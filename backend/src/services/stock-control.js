const { z } = require("zod");
const XLSX = require("xlsx");
const { pool } = require("../db");

const STOCK_CONTROL_PERMISSION_KEY = "stock_control_users";
const STOCK_CONTROL_STATE_KEY = "stock_control_state";

const permissionSchema = z.object({
  userIds: z.array(z.string().trim().min(1).max(100)).max(200).default([]),
});

const stateSchema = z.object({
  active: z.boolean().default(false),
  startedAt: z.string().nullable().default(null),
  startedByUserId: z.string().nullable().default(null),
  startedByName: z.string().nullable().default(null),
  startedByRole: z.string().nullable().default(null),
  locationOrder: z.array(z.enum(["LOCAL", "GALPON"])).default([]),
  currentLocationCode: z.enum(["LOCAL", "GALPON"]).nullable().default(null),
  completedLocations: z.array(z.enum(["LOCAL", "GALPON"])).default([]),
  counts: z
    .object({
      LOCAL: z.record(z.string(), z.number().int().nonnegative()).default({}),
      GALPON: z.record(z.string(), z.number().int().nonnegative()).default({}),
    })
    .default({ LOCAL: {}, GALPON: {} }),
  lastReport: z
    .object({
      generatedAt: z.string().nullable().default(null),
      generatedByUserId: z.string().nullable().default(null),
      generatedByName: z.string().nullable().default(null),
      rows: z.array(z.any()).default([]),
    })
    .nullable()
    .default(null),
});

function buildDefaultState() {
  return {
    active: false,
    startedAt: null,
    startedByUserId: null,
    startedByName: null,
    startedByRole: null,
    locationOrder: [],
    currentLocationCode: null,
    completedLocations: [],
    counts: {
      LOCAL: {},
      GALPON: {},
    },
    lastReport: null,
  };
}

async function buildDefaultStockControlUserIds(client = pool) {
  const { rows } = await client.query(
    `
      SELECT id
      FROM users
      WHERE is_active = TRUE
        AND role = 'ADMIN'
      ORDER BY created_at DESC
    `
  );
  return rows.map((row) => row.id);
}

async function loadStockControlPermissions(client = pool) {
  const { rows } = await client.query(
    "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
    [STOCK_CONTROL_PERMISSION_KEY]
  );
  if (!rows.length || !rows[0].value) {
    return { userIds: await buildDefaultStockControlUserIds(client) };
  }
  const parsed = permissionSchema.safeParse(rows[0].value);
  if (!parsed.success) {
    return { userIds: await buildDefaultStockControlUserIds(client) };
  }
  return parsed.data;
}

async function saveStockControlPermissions(userIds, client = pool) {
  const payload = {
    userIds: Array.from(new Set((userIds || []).map(String))),
  };
  await client.query(
    `
      INSERT INTO app_settings(key, value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [STOCK_CONTROL_PERMISSION_KEY, JSON.stringify(payload)]
  );
  return payload;
}

function normalizeStateValue(value) {
  const parsed = stateSchema.safeParse(value || {});
  if (!parsed.success) return buildDefaultState();
  return {
    ...buildDefaultState(),
    ...parsed.data,
    counts: {
      LOCAL: parsed.data.counts?.LOCAL || {},
      GALPON: parsed.data.counts?.GALPON || {},
    },
  };
}

async function loadStockControlState(client = pool) {
  const { rows } = await client.query(
    "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
    [STOCK_CONTROL_STATE_KEY]
  );
  if (!rows.length || !rows[0].value) return buildDefaultState();
  return normalizeStateValue(rows[0].value);
}

async function saveStockControlState(state, client = pool) {
  const payload = normalizeStateValue(state);
  await client.query(
    `
      INSERT INTO app_settings(key, value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [STOCK_CONTROL_STATE_KEY, JSON.stringify(payload)]
  );
  return payload;
}

async function userCanManageStockControl(user, client = pool, userPermissions = null) {
  if (Array.isArray(userPermissions) && userPermissions.includes("inventory.transfer")) return true;
  const permissions = await loadStockControlPermissions(client);
  return permissions.userIds.includes(String(user?.id || ""));
}

function buildStockControlWorkbook(reportRows = []) {
  const headers = [
    "ubicacion",
    "codigo",
    "producto",
    "unidad",
    "stock_esperado",
    "stock_real",
    "diferencia",
    "detalle",
  ];
  const data = [
    headers,
    ...reportRows.map((row) => [
      row.locationCode || "",
      row.code || "",
      row.productName || "",
      row.unitLabel || "",
      Number(row.expectedQty || 0),
      Number(row.actualQty || 0),
      Number(row.difference || 0),
      row.description || "",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "control_stock");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = {
  STOCK_CONTROL_PERMISSION_KEY,
  STOCK_CONTROL_STATE_KEY,
  buildDefaultState,
  buildStockControlWorkbook,
  loadStockControlPermissions,
  saveStockControlPermissions,
  loadStockControlState,
  saveStockControlState,
  userCanManageStockControl,
};
