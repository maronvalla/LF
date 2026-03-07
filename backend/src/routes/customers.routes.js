const express = require("express");
const { z } = require("zod");
const axios = require("axios");
const { pool } = require("../db");
const { requirePermission, isAdmin } = require("../middleware/rbac");
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
  prospectMatchCustomerId: z.string().uuid().optional().nullable(),
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

function looksLikeCrossStreet(query) {
  return /\s+y\s+|\s*&\s*|\sesq\.?\s*|\besquina\b/i.test(query);
}

async function searchWithGeoRef(query) {
  const { data } = await axios.get("https://apis.datos.gob.ar/georef/api/direcciones", {
    params: {
      direccion: query,
      provincia: "tucuman",
      max: 3,
    },
    ...AXIOS_BASE_CONFIG,
  });
  const results = Array.isArray(data?.direcciones) ? data.direcciones : [];
  return results
    .map((r) => {
      const lat = Number(r?.ubicacion?.lat);
      const lng = Number(r?.ubicacion?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const label = r?.nomenclatura || "";
      if (!label) return null;
      return { provider: "GEOREF", label, address: label, latitude: lat, longitude: lng };
    })
    .filter(Boolean);
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
    results
      .map((r) => {
        const lat = Number(r?.geometry?.location?.lat);
        const lng = Number(r?.geometry?.location?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const label = r?.formatted_address || "";
        if (!label) return null;
        return { provider: "GOOGLE", label, address: label, latitude: lat, longitude: lng };
      })
      .filter(Boolean)
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
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
  "/prospect-match",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    if (!isAdmin(req)) return res.json(null);
    const name = String(req.query.name || "").trim();
    if (name.length < 3) return res.json(null);

    const normalizedName = normalizeText(name);
    const { rows } = await pool.query(
      `
        WITH budget_summary AS (
          SELECT
            b.customer_id,
            MAX(b.created_at) AS last_budget_at,
            (ARRAY_AGG(b.customer_phone ORDER BY b.created_at DESC))[1] AS customer_phone,
            (ARRAY_AGG(b.budget_number ORDER BY b.created_at DESC))[1] AS budget_number
          FROM budgets b
          WHERE b.customer_id IS NOT NULL
          GROUP BY b.customer_id
        )
        SELECT
          c.id,
          c.name,
          c.phone,
          c.crm_stage,
          bs.last_budget_at,
          bs.customer_phone,
          bs.budget_number
        FROM customers c
        LEFT JOIN budget_summary bs ON bs.customer_id = c.id
        WHERE c.crm_stage IN ('PROSPECTO', 'CONTACTO', 'NEGOCIACION', 'REACTIVACION')
          AND (
            UPPER(unaccent(c.name)) = UPPER(unaccent($1))
            OR UPPER(unaccent(c.name)) LIKE UPPER(unaccent($2))
          )
        ORDER BY
          CASE WHEN UPPER(unaccent(c.name)) = UPPER(unaccent($1)) THEN 0 ELSE 1 END,
          bs.last_budget_at DESC NULLS LAST,
          c.created_at DESC
        LIMIT 1
      `,
      [normalizedName, `%${normalizedName}%`]
    ).catch(async () => {
      const fallback = await pool.query(
        `
          WITH budget_summary AS (
            SELECT
              b.customer_id,
              MAX(b.created_at) AS last_budget_at,
              (ARRAY_AGG(b.customer_phone ORDER BY b.created_at DESC))[1] AS customer_phone,
              (ARRAY_AGG(b.budget_number ORDER BY b.created_at DESC))[1] AS budget_number
            FROM budgets b
            WHERE b.customer_id IS NOT NULL
            GROUP BY b.customer_id
          )
          SELECT
            c.id,
            c.name,
            c.phone,
            c.crm_stage,
            bs.last_budget_at,
            bs.customer_phone,
            bs.budget_number
          FROM customers c
          LEFT JOIN budget_summary bs ON bs.customer_id = c.id
          WHERE c.crm_stage IN ('PROSPECTO', 'CONTACTO', 'NEGOCIACION', 'REACTIVACION')
            AND (
              UPPER(c.name) = UPPER($1)
              OR UPPER(c.name) LIKE UPPER($2)
            )
          ORDER BY
            CASE WHEN UPPER(c.name) = UPPER($1) THEN 0 ELSE 1 END,
            bs.last_budget_at DESC NULLS LAST,
            c.created_at DESC
          LIMIT 1
        `,
        [name.trim(), `%${name.trim()}%`]
      );
      return fallback;
    });

    res.json(rows[0] || null);
  })
);

router.get(
  "/address-search",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 5) return res.json([]);

    if (req.query.provider === "google") {
      let results = [];
      try { results = await searchWithGoogle(q); } catch { results = []; }
      return res.json(results);
    }

    // Cross-street query: GeoRef first (official AR data), TomTom as fallback
    if (looksLikeCrossStreet(q)) {
      let results = [];
      try { results = await searchWithGeoRef(q); } catch { results = []; }
      if (!results.length) {
        try { results = await searchWithTomTom(q); } catch { results = []; }
      }
      return res.json(results);
    }

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
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let rows;

      if (d.prospectMatchCustomerId) {
        if (!isAdmin(req)) {
          await client.query("ROLLBACK");
          return res.status(403).json({ message: "Solo ADMIN puede vincular prospectos de presupuesto" });
        }
        const beforeRes = await client.query("SELECT * FROM customers WHERE id = $1 LIMIT 1", [
          d.prospectMatchCustomerId,
        ]);
        const before = beforeRes.rows[0];
        if (!before) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Prospecto no encontrado" });
        }

        const updated = await client.query(
          `
            UPDATE customers
            SET
              name = $2,
              code = $3,
              tax_id = $4,
              phone = $5,
              email = $6,
              address = $7,
              zone = $8,
              iva_condition = $9,
              notes = $10,
              preferred_price_list = $11,
              latitude = $12,
              longitude = $13,
              enable_current_account = $14,
              crm_stage = 'CLIENTE_ACTIVO',
              crm_last_contact_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [
            d.prospectMatchCustomerId,
            d.name,
            d.code || null,
            d.taxId || null,
            d.phone || before.phone || null,
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
        rows = updated.rows;

        await client.query(
          `
            INSERT INTO customer_crm_interactions(
              customer_id,
              interaction_type,
              summary,
              notes,
              happened_at,
              created_by
            )
            VALUES ($1, 'NOTA', 'Cliente regreso desde presupuesto', $2, NOW(), $3)
          `,
          [
            d.prospectMatchCustomerId,
            `Se confirmo que ${d.name} es el mismo prospecto que habia solicitado presupuesto.`,
            req.user.id,
          ]
        );

        await logAudit({
          actorUserId: req.user.id,
          action: "CUSTOMER_RETURNED_FROM_BUDGET",
          entity: "customers",
          entityId: rows[0].id,
          metadata: { before, after: rows[0] },
          client,
        });
      } else {
        const inserted = await client.query(
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
        rows = inserted.rows;

        await logAudit({
          actorUserId: req.user.id,
          action: "CUSTOMER_CREATE",
          entity: "customers",
          entityId: rows[0].id,
          metadata: { after: rows[0] },
          client,
        });
      }

      await client.query("COMMIT");
      res.status(201).json(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
