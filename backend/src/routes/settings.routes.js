const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { pool } = require("../db");
const { asyncHandler } = require("../utils/async-handler");
const { requirePermission, isAdmin } = require("../middleware/rbac");
const { logAudit } = require("../services/audit");
const {
  loadStockControlPermissions,
  saveStockControlPermissions,
  loadStockControlState,
} = require("../services/stock-control");
const {
  DEFAULT_TRANSFER_PAIRS,
  loadTransferPairs,
  normalizeLocationCode,
  normalizeTransferPairs,
} = require("../services/inventory-transfer-settings");
const {
  ALL_PERMISSIONS,
  loadRoleDefinitions,
  normalizeRoleDefinitions,
  saveRoleDefinitions,
} = require("../services/roles");
const {
  loadTelegramAlertsConfig,
  normalizeTelegramAlertsConfig,
  saveTelegramAlertsConfig,
} = require("../services/telegram-alerts");

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
  code: z.string().trim().max(60).optional(),
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(3).max(220),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const transferPairsSchema = require("../services/inventory-transfer-settings").transferPairsSchema;

const locationsSchema = z.object({
  local: locationPointSchema,
  deposito: locationPointSchema,
  extras: z.array(extraLocationSchema).max(50).optional().default([]),
});

const priceOverrideUsersSchema = z.object({
  userIds: z.array(z.string().trim().min(1).max(100)).max(200).default([]),
});

const stockControlUsersSchema = z.object({
  userIds: z.array(z.string().trim().min(1).max(100)).max(200).default([]),
});

const DEFAULT_PRICE_LISTS = [
  { key: "MINORISTA", label: "Minorista" },
  { key: "MAYORISTA", label: "Mayorista" },
];
const DEFAULT_PRICE_LIST_KEY = "MAYORISTA";

const priceListItemSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((value) =>
      value
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
    ),
  label: z.string().trim().min(1).max(60),
});

const priceListsSchema = z.object({
  lists: z.array(priceListItemSchema).max(12).default(DEFAULT_PRICE_LISTS),
  defaultKey: z.string().trim().min(1).max(40).optional(),
});

const resetAppDataSchema = z.object({
  password: z.string().min(1).max(200),
});

const roleDefinitionSchema = z.object({
  key: z.string().trim().min(2).max(60),
  label: z.string().trim().min(2).max(80),
  permissions: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
});

const roleDefinitionsSchema = z.object({
  roles: z.array(roleDefinitionSchema).max(50),
});

const telegramAlertsSchema = z.object({
  enabled: z.boolean().optional().default(false),
  botToken: z.string().trim().max(255).optional().default(""),
  chatIds: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
});

const sellerAliasesSchema = z.object({
  aliasesByUser: z.record(z.string().trim().min(1).max(100), z.array(z.string().trim().min(1).max(80)).max(20)).default({}),
});

async function loadLocations() {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'locations' LIMIT 1");
  if (!rows.length || !rows[0].value) return FALLBACK_LOCATIONS;
  const parsed = locationsSchema.safeParse(rows[0].value);
  if (!parsed.success) return FALLBACK_LOCATIONS;
  return parsed.data;
}

function buildLocationEntries(locationsValue) {
  const extras = Array.isArray(locationsValue?.extras) ? locationsValue.extras : [];
  return [
    { code: "LOCAL", name: "Local" },
    { code: "GALPON", name: "Galpon" },
    ...extras.map((item, index) => ({
      code:
        normalizeLocationCode(item.code) ||
        normalizeLocationCode(item.name) ||
        `EXTRA_${index + 1}`,
      name: String(item.name || `Ubicacion ${index + 1}`).trim(),
    })),
  ];
}

async function syncLocationsTable(locationsValue, client = pool) {
  const entries = buildLocationEntries(locationsValue);
  for (const entry of entries) {
    await client.query(
      `
        INSERT INTO locations(code, name)
        VALUES ($1, $2)
        ON CONFLICT (code)
        DO UPDATE SET name = EXCLUDED.name
      `,
      [entry.code, entry.name]
    );
  }

  return entries;
}

async function buildDefaultPriceOverrideUserIds() {
  const { rows } = await pool.query(
    `
      SELECT id
      FROM users
      WHERE is_active = TRUE
        AND role IN ('ADMIN', 'CAJERO')
      ORDER BY created_at DESC
    `
  );
  return rows.map((row) => row.id);
}

async function loadPriceOverrideUsers() {
  const { rows } = await pool.query(
    "SELECT value FROM app_settings WHERE key = 'price_override_users' LIMIT 1"
  );
  if (!rows.length || !rows[0].value) {
    return { userIds: await buildDefaultPriceOverrideUserIds() };
  }
  const parsed = priceOverrideUsersSchema.safeParse(rows[0].value);
  if (!parsed.success) {
    return { userIds: await buildDefaultPriceOverrideUserIds() };
  }
  return parsed.data;
}

function normalizePriceLists(input) {
  const unique = new Map();
  DEFAULT_PRICE_LISTS.forEach((row) => {
    unique.set(row.key, row);
  });

  for (const row of input?.lists || []) {
    if (!row?.key || !row?.label) continue;
    if (row.key === "MINORISTA" || row.key === "MAYORISTA") {
      unique.set(row.key, { key: row.key, label: row.label });
      continue;
    }
    unique.set(row.key, { key: row.key, label: row.label });
  }

  const lists = Array.from(unique.values());
  const requestedDefault = String(input?.defaultKey || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const fallbackDefault = lists.some((row) => row.key === DEFAULT_PRICE_LIST_KEY)
    ? DEFAULT_PRICE_LIST_KEY
    : lists[0]?.key || "MINORISTA";

  return {
    lists,
    defaultKey: lists.some((row) => row.key === requestedDefault) ? requestedDefault : fallbackDefault,
  };
}

async function loadPriceLists() {
  const { rows } = await pool.query(
    "SELECT value FROM app_settings WHERE key = 'price_lists' LIMIT 1"
  );
  if (!rows.length || !rows[0].value) {
    return { lists: DEFAULT_PRICE_LISTS, defaultKey: DEFAULT_PRICE_LIST_KEY };
  }
  const parsed = priceListsSchema.safeParse(rows[0].value);
  if (!parsed.success) {
    return { lists: DEFAULT_PRICE_LISTS, defaultKey: DEFAULT_PRICE_LIST_KEY };
  }
  return normalizePriceLists(parsed.data);
}

function normalizeSellerAliases(input) {
  const next = {};
  const source = input?.aliasesByUser && typeof input.aliasesByUser === "object" ? input.aliasesByUser : {};

  for (const [userId, aliases] of Object.entries(source)) {
    const normalizedAliases = Array.from(
      new Set(
        (Array.isArray(aliases) ? aliases : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    ).slice(0, 20);

    if (normalizedAliases.length) {
      next[String(userId)] = normalizedAliases;
    }
  }

  return { aliasesByUser: next };
}

async function loadSellerAliases() {
  const { rows } = await pool.query(
    "SELECT value FROM app_settings WHERE key = 'seller_aliases' LIMIT 1"
  );
  if (!rows.length || !rows[0].value) return { aliasesByUser: {} };
  const parsed = sellerAliasesSchema.safeParse(rows[0].value);
  if (!parsed.success) return { aliasesByUser: {} };
  return normalizeSellerAliases(parsed.data);
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

    const payload = {
      ...parsed.data,
      extras: (parsed.data.extras || []).map((item, index) => ({
        ...item,
        code:
          normalizeLocationCode(item.code) ||
          normalizeLocationCode(item.name) ||
          `EXTRA_${index + 1}`,
      })),
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO app_settings(key, value, updated_at)
          VALUES ('locations', $1::jsonb, NOW())
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `,
        [JSON.stringify(payload)]
      );
      const locationEntries = await syncLocationsTable(payload, client);
      const normalizedPairs = await loadTransferPairs(locationEntries.map((entry) => entry.code));
      await client.query(
        `
          INSERT INTO app_settings(key, value, updated_at)
          VALUES ('inventory_transfer_pairs', $1::jsonb, NOW())
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `,
        [JSON.stringify(normalizedPairs)]
      );
      await client.query("COMMIT");
      res.json({ ok: true, locations: payload, locationEntries, transferPairs: normalizedPairs });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

router.get(
  "/price-overrides",
  asyncHandler(async (_req, res) => {
    const settings = await loadPriceOverrideUsers();
    res.json(settings);
  })
);

router.get(
  "/stock-control-users",
  asyncHandler(async (_req, res) => {
    const settings = await loadStockControlPermissions();
    res.json(settings);
  })
);

router.get(
  "/stock-control-state",
  asyncHandler(async (_req, res) => {
    const state = await loadStockControlState();
    res.json(state);
  })
);

router.get(
  "/price-lists",
  asyncHandler(async (_req, res) => {
    const settings = await loadPriceLists();
    res.json(settings);
  })
);

router.get(
  "/seller-aliases",
  requirePermission("sales.manage"),
  asyncHandler(async (_req, res) => {
    const settings = await loadSellerAliases();
    res.json(settings);
  })
);

router.get(
  "/inventory-transfer-pairs",
  asyncHandler(async (_req, res) => {
    const locations = await loadLocations();
    const locationEntries = buildLocationEntries(locations);
    const pairs = await loadTransferPairs(locationEntries.map((entry) => entry.code));
    res.json({ ok: true, locations: locationEntries, ...pairs });
  })
);

router.get(
  "/roles",
  requirePermission("users.manage"),
  asyncHandler(async (_req, res) => {
    const roles = await loadRoleDefinitions();
    res.json({ roles, permissions: ALL_PERMISSIONS });
  })
);

router.get(
  "/telegram-alerts",
  requirePermission("settings.manage"),
  asyncHandler(async (_req, res) => {
    const settings = await loadTelegramAlertsConfig();
    res.json(settings);
  })
);

router.put(
  "/telegram-alerts",
  requirePermission("settings.manage"),
  asyncHandler(async (req, res) => {
    const parsed = telegramAlertsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Configuracion de Telegram invalida",
        issues: parsed.error.issues,
      });
    }

    const saved = await saveTelegramAlertsConfig(normalizeTelegramAlertsConfig(parsed.data));
    res.json({ ok: true, ...saved });
  })
);

router.put(
  "/roles",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const parsed = roleDefinitionsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Configuracion de roles invalida",
        issues: parsed.error.issues,
      });
    }

    const normalized = normalizeRoleDefinitions(parsed.data.roles);
    const keys = new Set(normalized.map((role) => role.key));
    if (!keys.has("ADMIN")) {
      return res.status(400).json({ ok: false, message: "Debe existir el rol ADMIN" });
    }

    const saved = await saveRoleDefinitions(normalized);
    res.json({ ok: true, roles: saved, permissions: ALL_PERMISSIONS });
  })
);

router.put(
  "/seller-aliases",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const parsed = sellerAliasesSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Configuracion de nombres operativos invalida",
        issues: parsed.error.issues,
      });
    }

    const payload = normalizeSellerAliases(parsed.data);
    await pool.query(
      `
        INSERT INTO app_settings(key, value, updated_at)
        VALUES ('seller_aliases', $1::jsonb, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [JSON.stringify(payload)]
    );

    res.json({ ok: true, ...payload });
  })
);

router.put(
  "/price-lists",
  requirePermission("products.manage"),
  asyncHandler(async (req, res) => {
    const parsed = priceListsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Configuracion de listas invalida",
        issues: parsed.error.issues,
      });
    }

    const payload = normalizePriceLists(parsed.data);
    await pool.query(
      `
        INSERT INTO app_settings(key, value, updated_at)
        VALUES ('price_lists', $1::jsonb, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [JSON.stringify(payload)]
    );

    res.json({ ok: true, ...payload });
  })
);

router.put(
  "/price-overrides",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const parsed = priceOverrideUsersSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Configuracion de permisos invalida",
        issues: parsed.error.issues,
      });
    }

    const payload = {
      userIds: Array.from(new Set(parsed.data.userIds)),
    };

    if (payload.userIds.length) {
      const { rows } = await pool.query(
        "SELECT id::text AS id FROM users WHERE id::text = ANY($1::text[])",
        [payload.userIds]
      );
      const existingIds = new Set(rows.map((row) => row.id));
      const unknownIds = payload.userIds.filter((id) => !existingIds.has(String(id)));
      if (unknownIds.length) {
        return res.status(400).json({
          ok: false,
          message: "Hay usuarios invalidos en la configuracion",
          unknownIds,
        });
      }
    }

    await pool.query(
      `
        INSERT INTO app_settings(key, value, updated_at)
        VALUES ('price_override_users', $1::jsonb, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [JSON.stringify(payload)]
    );

    res.json({ ok: true, ...payload });
  })
);

router.put(
  "/stock-control-users",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const parsed = stockControlUsersSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Configuracion de permisos invalida",
        issues: parsed.error.issues,
      });
    }

    const payload = {
      userIds: Array.from(new Set(parsed.data.userIds)),
    };

    if (payload.userIds.length) {
      const { rows } = await pool.query(
        "SELECT id::text AS id FROM users WHERE id::text = ANY($1::text[])",
        [payload.userIds]
      );
      const existingIds = new Set(rows.map((row) => row.id));
      const unknownIds = payload.userIds.filter((id) => !existingIds.has(String(id)));
      if (unknownIds.length) {
        return res.status(400).json({
          ok: false,
          message: "Hay usuarios invalidos en la configuracion",
          unknownIds,
        });
      }
    }

    const saved = await saveStockControlPermissions(payload.userIds);
    res.json({ ok: true, ...saved });
  })
);

router.put(
  "/inventory-transfer-pairs",
  requirePermission("dashboard.view"),
  asyncHandler(async (req, res) => {
    const parsed = transferPairsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Configuracion de transferencias invalida",
        issues: parsed.error.issues,
      });
    }

    const locations = await loadLocations();
    const allowedCodes = buildLocationEntries(locations).map((entry) => entry.code);
    const payload = normalizeTransferPairs(parsed.data, allowedCodes);
    await pool.query(
      `
        INSERT INTO app_settings(key, value, updated_at)
        VALUES ('inventory_transfer_pairs', $1::jsonb, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [JSON.stringify(payload)]
    );
    res.json({ ok: true, locations: buildLocationEntries(locations), ...payload });
  })
);

router.post(
  "/reset-app-data",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ ok: false, message: "Solo un administrador puede borrar todos los datos" });
    }

    const parsed = resetAppDataSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Debes confirmar la contrasena actual",
        issues: parsed.error.issues,
      });
    }

    const { password } = parsed.data;
    const { rows: userRows } = await pool.query(
      "SELECT id, password_hash FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    const currentUser = userRows[0];
    if (!currentUser) {
      return res.status(400).json({ ok: false, message: "Usuario no encontrado" });
    }

    const passwordOk = await bcrypt.compare(password, currentUser.password_hash);
    if (!passwordOk) {
      return res.status(400).json({ ok: false, message: "Contrasena incorrecta" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        TRUNCATE TABLE
          delivery_tracking,
          delivery_sales,
          sale_items,
          purchase_items,
          cash_register_movements,
          delivery_consolidated_controls,
          deliveries,
          sales,
          purchases,
          inventory_movements,
          inventory_balances,
          customers,
          products,
          product_categories,
          product_brands,
          product_rubros,
          suppliers,
          cash_register_sessions,
          audit_log
        RESTART IDENTITY CASCADE
      `);

      await logAudit({
        actorUserId: req.user.id,
        action: "RESET_APP_DATA",
        entity: "system",
        entityId: null,
        metadata: {
          preserved: ["users", "locations", "app_settings"],
        },
        client,
      });

      await client.query("COMMIT");
      res.json({
        ok: true,
        message: "Todos los datos operativos fueron eliminados",
        preserved: ["users", "locations", "app_settings"],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
