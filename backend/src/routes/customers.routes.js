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
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  zone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  preferredPriceList: z.enum(["MINORISTA", "MAYORISTA"]).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

const AXIOS_BASE_CONFIG = {
  timeout: 7000,
  proxy: false,
};

async function searchWithMapbox(query) {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return [];

  const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
  const { data } = await axios.get(endpoint, {
    params: {
      access_token: token,
      autocomplete: true,
      limit: 6,
      country: "AR",
      language: "es",
    },
    ...AXIOS_BASE_CONFIG,
  });

  const features = Array.isArray(data?.features) ? data.features : [];
  return features
    .map((f) => {
      const center = Array.isArray(f.center) ? f.center : [];
      const lng = Number(center[0]);
      const lat = Number(center[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const label = f.place_name || f.text || "";
      return {
        provider: "MAPBOX",
        label,
        address: label,
        latitude: lat,
        longitude: lng,
      };
    })
    .filter(Boolean);
}

async function searchWithGoogle(query) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];

  // Prefer Places API (New).
  const autocompleteUrl = "https://places.googleapis.com/v1/places:autocomplete";
  const { data } = await axios.post(
    autocompleteUrl,
    {
      input: query,
      languageCode: "es",
      includedRegionCodes: ["AR"],
    },
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      ...AXIOS_BASE_CONFIG,
    }
  );

  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions.slice(0, 6) : [];
  if (!suggestions.length) return [];

  const details = await Promise.all(
    suggestions.map(async (s) => {
      const placeId = s?.placePrediction?.placeId;
      if (!placeId) return null;
      try {
        const { data: placeData } = await axios.get(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
          {
            params: {
              languageCode: "es",
              regionCode: "AR",
            },
            headers: {
              "X-Goog-Api-Key": key,
              "X-Goog-FieldMask": "location,formattedAddress,displayName",
            },
            ...AXIOS_BASE_CONFIG,
          }
        );

        const lat = Number(placeData?.location?.latitude);
        const lng = Number(placeData?.location?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const label =
          placeData?.formattedAddress ||
          placeData?.displayName?.text ||
          s?.placePrediction?.text?.text ||
          "";
        return {
          provider: "GOOGLE",
          label,
          address: label,
          latitude: lat,
          longitude: lng,
        };
      } catch {
        return null;
      }
    })
  );

  return details.filter(Boolean);
}

async function reverseWithMapbox(lat, lng) {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return "";
  const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`;
  const { data } = await axios.get(endpoint, {
    params: {
      access_token: token,
      limit: 1,
      language: "es",
    },
    ...AXIOS_BASE_CONFIG,
  });
  const feature = Array.isArray(data?.features) ? data.features[0] : null;
  return feature?.place_name || feature?.text || "";
}

async function reverseWithGoogle(lat, lng) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return "";
  const endpoint = "https://maps.googleapis.com/maps/api/geocode/json";
  const { data } = await axios.get(endpoint, {
    params: {
      latlng: `${lat},${lng}`,
      key,
      language: "es",
    },
    ...AXIOS_BASE_CONFIG,
  });
  const first = Array.isArray(data?.results) ? data.results[0] : null;
  return first?.formatted_address || "";
}

router.get(
  "/",
  requirePermission("customers.manage"),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query("SELECT * FROM customers ORDER BY created_at DESC");
    res.json(rows);
  })
);

router.get(
  "/address-search",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 3) return res.json([]);
    const preferred = String(req.query.provider || "").toUpperCase();

    let results = [];
    if (preferred === "MAPBOX") {
      try {
        results = await searchWithMapbox(q);
      } catch {
        results = [];
      }
    } else if (preferred === "GOOGLE") {
      try {
        results = await searchWithGoogle(q);
      } catch {
        results = [];
      }
      if (!results.length) {
        try {
          results = await searchWithMapbox(q);
        } catch {
          results = [];
        }
      }
    } else {
      try {
        results = await searchWithGoogle(q);
      } catch {
        results = [];
      }
      if (!results.length) {
        try {
          results = await searchWithMapbox(q);
        } catch {
          results = [];
        }
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

    const preferred = String(req.query.provider || "").toUpperCase();
    let address = "";
    if (preferred === "MAPBOX") {
      try {
        address = await reverseWithMapbox(lat, lng);
      } catch {
        address = "";
      }
    } else if (preferred === "GOOGLE") {
      try {
        address = await reverseWithGoogle(lat, lng);
      } catch {
        address = "";
      }
      if (!address) {
        try {
          address = await reverseWithMapbox(lat, lng);
        } catch {
          address = "";
        }
      }
    } else {
      try {
        address = await reverseWithGoogle(lat, lng);
      } catch {
        address = "";
      }
      if (!address) {
        try {
          address = await reverseWithMapbox(lat, lng);
        } catch {
          address = "";
        }
      }
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
    const preferredPriceList = d.preferredPriceList || "MINORISTA";
    const { rows } = await pool.query(
      `
      INSERT INTO customers(name, phone, address, zone, notes, preferred_price_list, latitude, longitude)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
      [
        d.name,
        d.phone || null,
        d.address || null,
        d.zone || null,
        d.notes || null,
        preferredPriceList,
        d.latitude || null,
        d.longitude || null,
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
    const preferredPriceList = d.preferredPriceList || before.rows[0].preferred_price_list || "MINORISTA";
    const { rows } = await pool.query(
      `
      UPDATE customers
      SET name = $2, phone = $3, address = $4, zone = $5, notes = $6, preferred_price_list = $7, latitude = $8, longitude = $9
      WHERE id = $1
      RETURNING *
    `,
      [
        req.params.id,
        d.name,
        d.phone || null,
        d.address || null,
        d.zone || null,
        d.notes || null,
        preferredPriceList,
        d.latitude !== undefined ? d.latitude : before.rows[0].latitude,
        d.longitude !== undefined ? d.longitude : before.rows[0].longitude,
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

module.exports = router;
