const { pool } = require("../db");

const EMPTY_CONFIG = {
  enabled: false,
  botToken: "",
  chatIds: [],
};

function normalizeTelegramAlertsConfig(input) {
  const chatIds = Array.from(
    new Set(
      (Array.isArray(input?.chatIds) ? input.chatIds : String(input?.chatIds || "").split(/[\n,;]+/))
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  return {
    enabled: Boolean(input?.enabled),
    botToken: String(input?.botToken || "").trim(),
    chatIds,
  };
}

async function loadTelegramAlertsConfig(client = pool) {
  const { rows } = await client.query(
    "SELECT value FROM app_settings WHERE key = 'telegram_alerts' LIMIT 1"
  );
  if (!rows[0]?.value || typeof rows[0].value !== "object") return { ...EMPTY_CONFIG };
  return normalizeTelegramAlertsConfig(rows[0].value);
}

async function saveTelegramAlertsConfig(input, client = pool) {
  const payload = normalizeTelegramAlertsConfig(input);
  await client.query(
    `
      INSERT INTO app_settings(key, value, updated_at)
      VALUES ('telegram_alerts', $1::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [JSON.stringify(payload)]
  );
  return payload;
}

async function loadStockAlertState(client = pool) {
  const { rows } = await client.query(
    "SELECT value FROM app_settings WHERE key = 'telegram_stock_alert_state' LIMIT 1"
  );
  if (!rows[0]?.value || typeof rows[0].value !== "object") return { items: {} };
  const items = rows[0].value.items;
  return { items: items && typeof items === "object" ? items : {} };
}

async function saveStockAlertState(state, client = pool) {
  const payload = { items: state?.items && typeof state.items === "object" ? state.items : {} };
  await client.query(
    `
      INSERT INTO app_settings(key, value, updated_at)
      VALUES ('telegram_stock_alert_state', $1::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [JSON.stringify(payload)]
  );
}

async function sendTelegramMessage({ botToken, chatIds, text }) {
  if (!botToken || !Array.isArray(chatIds) || !chatIds.length || !text) return;

  for (const chatId of chatIds) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      });
    } catch (error) {
      console.error("No se pudo enviar alerta de Telegram:", error?.message || error);
    }
  }
}

function buildCriticalStockMessage(row) {
  const productName = String(row.product_name || "Producto");
  const code = String(row.sku || row.product_id || "").trim();
  const location = String(row.location_name || row.location_code || "UBICACION");
  const qty = Number(row.quantity || 0);
  const minStock = Number(row.min_stock || 0);

  const lines = [
    "ALERTA DE STOCK CRITICO",
    `${productName}${code ? ` (${code})` : ""}`,
    `Ubicacion: ${location}`,
    `Stock actual: ${qty}`,
    `Stock minimo: ${minStock}`,
  ];

  return lines.join("\n");
}

async function notifyCriticalStockForProductIds(productIds, client = pool) {
  const uniqueIds = Array.from(new Set((productIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (!uniqueIds.length) return;

  const telegram = await loadTelegramAlertsConfig(client);
  if (!telegram.enabled || !telegram.botToken || !telegram.chatIds.length) return;

  const previousState = await loadStockAlertState(client);
  const nextItems = { ...(previousState.items || {}) };

  const { rows } = await client.query(
    `
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.sku,
        p.min_stock,
        l.code AS location_code,
        l.name AS location_name,
        COALESCE(b.quantity, 0) AS quantity
      FROM products p
      CROSS JOIN locations l
      LEFT JOIN inventory_balances b
        ON b.product_id = p.id
       AND b.location_id = l.id
      WHERE p.id = ANY($1::uuid[])
    `,
    [uniqueIds]
  );

  const messages = [];
  for (const row of rows) {
    const key = `${row.product_id}:${String(row.location_code || "").toUpperCase()}`;
    const minStock = Number(row.min_stock || 0);
    const quantity = Number(row.quantity || 0);
    const below = minStock > 0 && quantity <= minStock;
    const prevBelow = Boolean(previousState.items?.[key]?.below);

    nextItems[key] = {
      below,
      quantity,
      minStock,
      updatedAt: new Date().toISOString(),
    };

    if (below && !prevBelow) {
      messages.push(buildCriticalStockMessage(row));
    }
  }

  await saveStockAlertState({ items: nextItems }, client);

  for (const text of messages) {
    await sendTelegramMessage({
      botToken: telegram.botToken,
      chatIds: telegram.chatIds,
      text,
    });
  }
}

module.exports = {
  normalizeTelegramAlertsConfig,
  loadTelegramAlertsConfig,
  saveTelegramAlertsConfig,
  notifyCriticalStockForProductIds,
};
