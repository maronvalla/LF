const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

const FALLBACK_ORIGIN = {
  lat: -27.432028,
  lng: -65.616528,
};

const optimizeSchema = z.object({
  fecha: z.string().date(),
  salida: z.enum(["11", "19"]),
});

const OPTIMIZE_SQL = `
  SELECT
    s.id AS sale_id,
    s.customer_id,
    s.sale_number,
    c.name AS customer_name,
    c.latitude,
    c.longitude
  FROM sales s
  JOIN customers c ON c.id = s.customer_id
  WHERE s.is_delivery = true
    AND s.scheduled_date = $1::date
    AND s.delivery_slot = $2
    AND s.status <> 'ANULADO'
    AND s.delivery_status IN ('PENDIENTE', 'CARGADO')
  ORDER BY s.created_at ASC;
`;

async function loadOrigin() {
  try {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'locations' LIMIT 1");
    const raw = rows?.[0]?.value;
    const deposito = raw?.deposito;
    const local = raw?.local;
    const candidate = deposito && Number.isFinite(Number(deposito.lat)) && Number.isFinite(Number(deposito.lng))
      ? deposito
      : local;
    if (candidate && Number.isFinite(Number(candidate.lat)) && Number.isFinite(Number(candidate.lng))) {
      return { lat: Number(candidate.lat), lng: Number(candidate.lng) };
    }
    return FALLBACK_ORIGIN;
  } catch {
    return FALLBACK_ORIGIN;
  }
}

async function optimizeWithOsrm(stops, origin) {
  const coords = [
    `${origin.lng},${origin.lat}`,
    ...stops.map((s) => `${s.lng},${s.lat}`),
  ].join(";");

  const url =
    `http://router.project-osrm.org/trip/v1/driving/${coords}` +
    "?source=first&roundtrip=false&steps=false&overview=false";

  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OSRM HTTP ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  if (data.code !== "Ok" || !data.trips?.[0] || !Array.isArray(data.waypoints)) {
    throw new Error(`OSRM error: ${data.code || "UNKNOWN"}`);
  }

  return data;
}

router.post(
  "/optimizar",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res) => {
    const parsed = optimizeSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Body invalido. Requiere fecha (YYYY-MM-DD) y salida (11|19)." });
    }

    const { fecha, salida } = parsed.data;
    const origin = await loadOrigin();
    const dbRes = await pool.query(OPTIMIZE_SQL, [fecha, salida]);

    const withoutCoords = [];
    const stops = [];
    for (const row of dbRes.rows) {
      if (row.latitude == null || row.longitude == null) {
        withoutCoords.push({
          sale_id: row.sale_id,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
        });
        continue;
      }
      stops.push({
        sale_id: row.sale_id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        lat: Number(row.latitude),
        lng: Number(row.longitude),
      });
    }

    if (!stops.length) {
      return res.status(404).json({
        message: "No hay envios con coordenadas para optimizar",
        salida,
        fecha,
        orden: [],
        metric: { distance_m: 0, duration_s: 0 },
        skipped_without_coords: withoutCoords,
      });
    }

    let osrm;
    try {
      osrm = await optimizeWithOsrm(stops, origin);
    } catch (err) {
      return res.status(502).json({
        message: "No se pudo optimizar ruta con OSRM",
        detail: err.message,
      });
    }

    const metaByInputIndex = new Map();
    metaByInputIndex.set(0, { kind: "origin", lat: origin.lat, lng: origin.lng });
    stops.forEach((s, idx) => metaByInputIndex.set(idx + 1, { kind: "stop", ...s }));

    const orderedStops = osrm.waypoints
      .map((wp, inputIndex) => ({
        orderIndex: wp.waypoint_index,
        meta: metaByInputIndex.get(inputIndex),
      }))
      .filter((wp) => wp.meta && wp.meta.kind === "stop")
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((wp, idx) => ({
        stop: idx + 1,
        sale_id: wp.meta.sale_id,
        customer_id: wp.meta.customer_id,
        customer_name: wp.meta.customer_name,
        lat: wp.meta.lat,
        lng: wp.meta.lng,
      }));

    res.json({
      salida,
      fecha,
      orden: orderedStops,
      metric: {
        distance_m: Math.round(osrm.trips[0].distance || 0),
        duration_s: Math.round(osrm.trips[0].duration || 0),
      },
      skipped_without_coords: withoutCoords,
    });
  })
);

module.exports = router;
