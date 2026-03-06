const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
    COALESCE(
      NULLIF(TRIM(c.name), ''),
      NULLIF(NULLIF(TRIM(s.customer_name_snapshot), ''), TRIM(s.sale_number)),
      'CONSUMIDOR FINAL'
    ) AS customer_name,
    c.latitude,
    c.longitude,
    (SELECT COALESCE(SUM(line_total), 0) FROM sale_items WHERE sale_id = s.id)::numeric AS total_amount,
    (SELECT COALESCE(SUM(qty), 0) FROM sale_items WHERE sale_id = s.id)::integer AS total_qty
  FROM sales s
  LEFT JOIN customers c ON c.id = s.customer_id
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
        total_amount: Number(row.total_amount || 0),
        total_qty: Number(row.total_qty || 0),
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
        total_amount: wp.meta.total_amount,
        total_qty: wp.meta.total_qty,
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

// GET /rutas/customer-stop-stats
// Returns per-customer average dwell time from the last 30 days of GPS tracking.
router.get(
  "/customer-stop-stats",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res) => {
    const STOP_DIST_KM = 0.08;
    const STOP_MIN_MIN = 3;
    const MATCH_RADIUS_KM = 0.3;

    const [gpsResult, customerResult] = await Promise.all([
      pool.query(
        `SELECT latitude::float AS lat, longitude::float AS lng,
                EXTRACT(EPOCH FROM created_at) * 1000 AS ts_ms,
                user_id,
                (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day
         FROM delivery_tracking
         WHERE event_type = 'POSICION_CAMION'
           AND created_at >= NOW() - INTERVAL '30 days'
         ORDER BY user_id ASC, created_at ASC`
      ),
      pool.query(
        `SELECT id, latitude::float AS lat, longitude::float AS lng
         FROM customers
         WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
      ),
    ]);

    const customers = customerResult.rows;

    // Group GPS by user_id + day
    const groups = new Map();
    for (const row of gpsResult.rows) {
      const key = `${row.user_id}:${row.day}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ lat: row.lat, lng: row.lng, ts: Number(row.ts_ms) });
    }

    // Run stop detection per group and accumulate per customer
    const accumulator = new Map(); // customer_id -> { totalMin, count }
    for (const points of groups.values()) {
      const rawStops = [];
      let currentStop = null;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const dist = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
        const gapMin = (curr.ts - prev.ts) / 60000;
        if (dist < STOP_DIST_KM && gapMin >= STOP_MIN_MIN) {
          if (currentStop) {
            currentStop.endTs = curr.ts;
            currentStop.lats.push(curr.lat);
            currentStop.lngs.push(curr.lng);
          } else {
            currentStop = { startTs: prev.ts, endTs: curr.ts, lats: [prev.lat, curr.lat], lngs: [prev.lng, curr.lng] };
            rawStops.push(currentStop);
          }
        } else {
          currentStop = null;
        }
      }
      for (const stop of rawStops) {
        const durationMin = (stop.endTs - stop.startTs) / 60000;
        if (durationMin < STOP_MIN_MIN) continue;
        const lat = stop.lats.reduce((a, b) => a + b, 0) / stop.lats.length;
        const lng = stop.lngs.reduce((a, b) => a + b, 0) / stop.lngs.length;
        let nearestId = null;
        let nearestDist = Infinity;
        for (const c of customers) {
          const d = haversineKm(lat, lng, c.lat, c.lng);
          if (d < nearestDist) { nearestDist = d; nearestId = c.id; }
        }
        if (nearestId && nearestDist <= MATCH_RADIUS_KM) {
          const key = String(nearestId);
          if (!accumulator.has(key)) accumulator.set(key, { totalMin: 0, count: 0 });
          const acc = accumulator.get(key);
          acc.totalMin += durationMin;
          acc.count++;
        }
      }
    }

    const result = {};
    for (const [customerId, acc] of accumulator.entries()) {
      result[customerId] = { avgStopMin: Math.round(acc.totalMin / acc.count), sampleCount: acc.count };
    }
    res.json(result);
  })
);

module.exports = router;
