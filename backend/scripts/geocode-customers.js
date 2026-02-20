const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { pool } = require("../src/db");
require("dotenv").config();

const PROVIDER = (process.env.GEOCODER_PROVIDER || "MAPBOX").toUpperCase();
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || "";
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const REQUEST_DELAY_MS = Number(process.env.GEOCODER_DELAY_MS || 250);
const BASE_LOCALITY = "Aguilares, Tucuman, Argentina";
const MISS_LOG_PATH = path.join(__dirname, "geocode-misses.log");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQuery(address, zone) {
  const safeAddress = (address || "").trim();
  const safeZone = (zone || "").trim();
  const locality = BASE_LOCALITY.toLowerCase();

  const pieces = [];
  if (safeAddress) pieces.push(safeAddress);
  if (safeZone && !safeZone.toLowerCase().includes("aguilares")) {
    pieces.push(safeZone);
  }
  if (!safeAddress.toLowerCase().includes("aguilares")) {
    pieces.push(BASE_LOCALITY);
  } else if (!safeAddress.toLowerCase().includes("tucuman")) {
    pieces.push("Tucuman, Argentina");
  }

  const q = pieces.join(", ").trim();
  return q || BASE_LOCALITY;
}

async function geocodeWithMapbox(query) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
  const { data } = await axios.get(url, {
    params: {
      access_token: MAPBOX_TOKEN,
      limit: 1,
      country: "AR",
      language: "es",
      types: "address,place,locality,neighborhood",
    },
    timeout: 10000,
  });

  const feature = data?.features?.[0];
  if (!feature?.center || feature.center.length < 2) return null;
  return {
    lng: Number(feature.center[0]),
    lat: Number(feature.center[1]),
    providerRef: feature.id || null,
  };
}

async function geocodeWithGoogle(query) {
  const { data } = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
    params: {
      address: query,
      key: GOOGLE_API_KEY,
      region: "ar",
      language: "es",
    },
    timeout: 10000,
  });

  if (data?.status !== "OK" || !data.results?.[0]?.geometry?.location) return null;
  const loc = data.results[0].geometry.location;
  return {
    lng: Number(loc.lng),
    lat: Number(loc.lat),
    providerRef: data.results[0].place_id || null,
  };
}

async function geocode(query) {
  if (PROVIDER === "GOOGLE") return geocodeWithGoogle(query);
  return geocodeWithMapbox(query);
}

function appendMissLog(line) {
  fs.appendFileSync(MISS_LOG_PATH, `${new Date().toISOString()} ${line}\n`, "utf8");
}

async function assertColumnsExist(client) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'customers'
        AND column_name IN ('latitude','longitude')
    `
  );
  const cols = new Set(rows.map((r) => r.column_name));
  if (!cols.has("latitude") || !cols.has("longitude")) {
    throw new Error("La tabla customers no tiene columnas latitude/longitude");
  }
}

async function run() {
  if (PROVIDER === "MAPBOX" && !MAPBOX_TOKEN) {
    throw new Error("Falta MAPBOX_ACCESS_TOKEN");
  }
  if (PROVIDER === "GOOGLE" && !GOOGLE_API_KEY) {
    throw new Error("Falta GOOGLE_MAPS_API_KEY");
  }

  const client = await pool.connect();
  let updated = 0;
  let skippedNoAddress = 0;
  let notFound = 0;
  let failed = 0;

  try {
    await assertColumnsExist(client);

    const { rows } = await client.query(
      `
        SELECT id, name, address, zone
        FROM customers
        WHERE latitude IS NULL
        ORDER BY created_at ASC
      `
    );

    console.log(`Clientes pendientes de geocodificar: ${rows.length}`);
    if (!rows.length) return;

    for (const c of rows) {
      const address = (c.address || "").trim();
      if (!address) {
        skippedNoAddress += 1;
        appendMissLog(`[NO_ADDRESS] customer=${c.id} name="${c.name || ""}" zone="${c.zone || ""}"`);
        continue;
      }

      const query = buildQuery(address, c.zone);
      try {
        const geo = await geocode(query);
        if (!geo) {
          notFound += 1;
          appendMissLog(`[NOT_FOUND] customer=${c.id} query="${query}"`);
          await sleep(REQUEST_DELAY_MS);
          continue;
        }

        await client.query(
          `
            UPDATE customers
            SET
              latitude = $1,
              longitude = $2
            WHERE id = $3
          `,
          [geo.lat, geo.lng, c.id]
        );
        updated += 1;
      } catch (err) {
        failed += 1;
        appendMissLog(`[ERROR] customer=${c.id} query="${query}" error="${err.message}"`);
      }

      await sleep(REQUEST_DELAY_MS);
    }

    console.log(`Geocodificacion finalizada. updated=${updated} skipped_no_address=${skippedNoAddress} not_found=${notFound} failed=${failed}`);
    console.log(`Log de misses: ${MISS_LOG_PATH}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
