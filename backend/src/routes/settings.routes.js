const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { asyncHandler } = require("../utils/async-handler");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();

const FALLBACK_LOCATIONS = {
  local: {
    address: "Avenida Mitre 831, Aguilares",
    lat: -27.432028,
    lng: -65.616528,
  },
  deposito: {
    address: "Avenida Mitre 831, Aguilares",
    lat: -27.432028,
    lng: -65.616528,
  },
  extras: [],
};

const locationPointSchema = z.object({
  address: z.string().trim().min(3).max(220),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const extraLocationSchema = z.object({
  id: z.string().trim().max(100).optional(),
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(3).max(220),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const locationsSchema = z.object({
  local: locationPointSchema,
  deposito: locationPointSchema,
  extras: z.array(extraLocationSchema).max(50).optional().default([]),
});

async function loadLocations() {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'locations' LIMIT 1");
  if (!rows.length || !rows[0].value) return FALLBACK_LOCATIONS;
  const parsed = locationsSchema.safeParse(rows[0].value);
  if (!parsed.success) return FALLBACK_LOCATIONS;
  return parsed.data;
}

router.get(
  "/locations",
  asyncHandler(async (_req, res) => {
    const locations = await loadLocations();
    res.json(locations);
  })
);

router.put(
  "/locations",
  requirePermission("dashboard.view"),
  asyncHandler(async (req, res) => {
    const parsed = locationsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Configuracion de ubicaciones invalida",
        issues: parsed.error.issues,
      });
    }

    const payload = parsed.data;
    await pool.query(
      `
        INSERT INTO app_settings(key, value, updated_at)
        VALUES ('locations', $1::jsonb, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [JSON.stringify(payload)]
    );

    res.json({ ok: true, locations: payload });
  })
);

module.exports = router;
