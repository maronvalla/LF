const express = require("express");
const { z } = require("zod");
const axios = require("axios");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");

const router = express.Router();

const schema = z.object({
  name: z.string().min(2),
  code: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  zone: z.string().optional().nullable(),
  ivaCondition: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  preferredPriceList: z.string().trim().min(1).max(40).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  enableCurrentAccount: z.boolean().optional(),
});

const AXIOS_BASE_CONFIG = {
  timeout: 7000,
  proxy: false,
};
const AGUILARES_BIAS = {
  lat: -27.432028,
  lng: -65.616528,
  bbox: [-65.78, -27.58, -65.45, -27.28],
};
const TUCUMAN_BOUNDS = {
  south: -28.25,
  west: -66.25,
  north: -25.9,
  east: -64.75,
};

function isWithinTucuman(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= TUCUMAN_BOUNDS.south &&
    lat <= TUCUMAN_BOUNDS.north &&
    lng >= TUCUMAN_BOUNDS.west &&
    lng <= TUCUMAN_BOUNDS.east
  );
}

function labelLooksLikeTucuman(label) {
  const normalized = String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return normalized.includes("TUCUMAN");
}

function filterTucumanResults(results) {
  return (Array.isArray(results) ? results : []).filter(
    (item) =>
      isWithinTucuman(Number(item?.latitude), Number(item?.longitude)) &&
      labelLooksLikeTucuman(item?.label || item?.address)
  );
}

async function loadDefaultPriceListKey() {
  const { rows } = await pool.query(
    "SELECT value FROM app_settings WHERE key = 'price_lists' LIMIT 1"
  );
  const saved = rows[0]?.value;
  const defaultKey = String(saved?.defaultKey || "MAYORISTA")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return defaultKey || "MAYORISTA";
}

async function searchWithTomTom(query) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return [];

  const endpoint = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`;
  const { data } = await axios.get(endpoint, {
    params: {
      key,
      limit: 3,
      countrySet: "AR",
      lat: AGUILARES_BIAS.lat,
      lon: AGUILARES_BIAS.lng,
      radius: 80000,
      language: "es-ES",
      idxSet: "PAD,Addr,Str,Geo,POI,XStr",
    },
    ...AXIOS_BASE_CONFIG,
  });

  const results = Array.isArray(data?.results) ? data.results : [];
  return filterTucumanResults(
    results
      .map((r) => {
        const lat = Number(r?.position?.lat);
        const lng = Number(r?.position?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const label = r?.address?.freeformAddress || r?.address?.streetNameAndNumber || "";
        if (!label) return null;
        return { provider: "TOMTOM", label, address: label, latitude: lat, longitude: lng };
      })
      .filter(Boolean)
  );
}

async function searchWithGoogle(query) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];
  const { data } = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
    params: { address: `${query}, Tucumán, Argentina`, key, language: "es", region: "AR" },
    ...AXIOS_BASE_CONFIG,
  });
  const results = Array.isArray(data?.results) ? data.results.slice(0, 3) : [];
  return filterTucumanResults(
    results.map((r) => {
      const lat = Number(r?.geometry?.location?.lat);
      const lng = Number(r?.geometry?.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const label = r?.formatted_address || "";
      if (!label) return null;
      return { provider: "GOOGLE", label, address: label, latitude: lat, longitude: lng };
    }).filter(Boolean)
  );
}

async function reverseWithTomTom(lat, lng) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return "";
  const endpoint = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lng}.json`;
  const { data } = await axios.get(endpoint, {
    params: { key, language: "es-ES" },
    ...AXIOS_BASE_CONFIG,
  });
  const first = Array.isArray(data?.addresses) ? data.addresses[0] : null;
  return first?.address?.freeformAddress || "";
}

router.get(
  "/",
  requirePermission("customers.manage"),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, code, tax_id, phone, email, address, zone, iva_condition, notes,
              preferred_price_list, latitude, longitude, enable_current_account, created_at,
              (facade_photo_base64 IS NOT NULL) AS has_facade_photo
       FROM customers ORDER BY created_at DESC`
    );
    res.json(rows);
  })
);

router.get(
  "/address-search",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 5) return res.json([]);
    let results = [];
    try {
      results = await searchWithTomTom(q);
    } catch {
      results = [];
    }
    const numberMatch = q.match(/\b(\d{2,5})\b/);
    const queriedNumber = numberMatch ? numberMatch[1] : null;
    const tomtomHasNumber = !queriedNumber || results.some((r) => String(r.label).includes(queriedNumber));
    if (!results.length || (queriedNumber && !tomtomHasNumber)) {
      try {
        results = await searchWithGoogle(q);
      } catch {
        results = [];
      }
    }
    res.json(results);
  })
);

router.get(
  "/reverse-geocode",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "lat/lng invalidos" });
    }

    let address = "";
    try {
      address = await reverseWithTomTom(lat, lng);
    } catch {
      address = "";
    }

    return res.json({
      address,
    });
  })
);

router.post(
  "/",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });
    const d = parsed.data;
    const preferredPriceList = d.preferredPriceList || (await loadDefaultPriceListKey());
    const { rows } = await pool.query(
      `
      INSERT INTO customers(name, code, tax_id, phone, email, address, zone, iva_condition, notes, preferred_price_list, latitude, longitude, enable_current_account)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `,
      [
        d.name,
        d.code || null,
        d.taxId || null,
        d.phone || null,
        d.email || null,
        d.address || null,
        d.zone || null,
        d.ivaCondition || "Consumidor Final",
        d.notes || null,
        preferredPriceList,
        d.latitude || null,
        d.longitude || null,
        Boolean(d.enableCurrentAccount),
      ]
    );
    await logAudit({
      actorUserId: req.user.id,
      action: "CUSTOMER_CREATE",
      entity: "customers",
      entityId: rows[0].id,
      metadata: { after: rows[0] },
    });
    res.status(201).json(rows[0]);
  })
);

router.put(
  "/:id",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });
    const before = await pool.query("SELECT * FROM customers WHERE id = $1", [req.params.id]);
    if (!before.rows[0]) return res.status(404).json({ message: "Cliente no encontrado" });
    const d = parsed.data;
    const preferredPriceList =
      d.preferredPriceList || before.rows[0].preferred_price_list || (await loadDefaultPriceListKey());
    const { rows } = await pool.query(
      `
      UPDATE customers
      SET name = $2, code = $3, tax_id = $4, phone = $5, email = $6, address = $7, zone = $8, iva_condition = $9, notes = $10, preferred_price_list = $11, latitude = $12, longitude = $13, enable_current_account = $14
      WHERE id = $1
      RETURNING *
    `,
      [
        req.params.id,
        d.name,
        d.code !== undefined ? d.code || null : before.rows[0].code,
        d.taxId || null,
        d.phone || null,
        d.email || null,
        d.address || null,
        d.zone || null,
        d.ivaCondition || before.rows[0].iva_condition || "Consumidor Final",
        d.notes || null,
        preferredPriceList,
        d.latitude !== undefined ? d.latitude : before.rows[0].latitude,
        d.longitude !== undefined ? d.longitude : before.rows[0].longitude,
        d.enableCurrentAccount !== undefined
          ? Boolean(d.enableCurrentAccount)
          : Boolean(before.rows[0].enable_current_account),
      ]
    );
    await logAudit({
      actorUserId: req.user.id,
      action: "CUSTOMER_UPDATE",
      entity: "customers",
      entityId: rows[0].id,
      metadata: { before: before.rows[0], after: rows[0] },
    });
    res.json(rows[0]);
  })
);

// Get facade photo for a specific customer (admin / cashier)
router.get(
  "/:id/facade-photo",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT facade_photo_base64, facade_photo_mime_type FROM customers WHERE id = $1",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Cliente no encontrado" });
    res.json({
      base64: rows[0].facade_photo_base64 || null,
      mimeType: rows[0].facade_photo_mime_type || null,
    });
  })
);

// Update customer coordinates from driver app
router.patch(
  "/:id/location",
  requirePermission("deliveries.track"),
  asyncHandler(async (req, res) => {
    const lat = Number(req.body.latitude);
    const lng = Number(req.body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "Coordenadas invalidas" });
    }
    const existing = await pool.query("SELECT id FROM customers WHERE id = $1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ message: "Cliente no encontrado" });
    await pool.query(
      "UPDATE customers SET latitude = $2, longitude = $3 WHERE id = $1",
      [req.params.id, lat, lng]
    );
    await logAudit({
      actorUserId: req.user.id,
      action: "CUSTOMER_LOCATION_UPDATE",
      entity: "customers",
      entityId: req.params.id,
      metadata: { latitude: lat, longitude: lng, source: "DRIVER_APP" },
    });
    res.json({ ok: true });
  })
);

// Upload facade photo from driver app
router.post(
  "/:id/facade-photo",
  requirePermission("deliveries.track"),
  asyncHandler(async (req, res) => {
    const base64 = String(req.body.base64 || "").trim();
    const mimeType = String(req.body.mimeType || "image/jpeg").trim();
    if (!base64) return res.status(400).json({ message: "Foto requerida" });
    const existing = await pool.query("SELECT id FROM customers WHERE id = $1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ message: "Cliente no encontrado" });
    await pool.query(
      "UPDATE customers SET facade_photo_base64 = $2, facade_photo_mime_type = $3 WHERE id = $1",
      [req.params.id, base64, mimeType]
    );
    await logAudit({
      actorUserId: req.user.id,
      action: "CUSTOMER_FACADE_PHOTO_UPDATE",
      entity: "customers",
      entityId: req.params.id,
      metadata: { source: "DRIVER_APP" },
    });
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const before = await pool.query("SELECT * FROM customers WHERE id = $1", [req.params.id]);
    if (!before.rows[0]) return res.status(404).json({ message: "Cliente no encontrado" });
    await pool.query("DELETE FROM customers WHERE id = $1", [req.params.id]);
    await logAudit({
      actorUserId: req.user.id,
      action: "CUSTOMER_DELETE",
      entity: "customers",
      entityId: req.params.id,
      metadata: { before: before.rows[0] },
    });
    res.json({ ok: true });
  })
);

module.exports = router;
