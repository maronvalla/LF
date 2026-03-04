const { pool } = require("../db");
const { buildSaleNumber, proposeShift } = require("../utils/sales");
const { loadTelegramAlertsConfig } = require("./telegram-alerts");

const EMPTY_CONFIG = {
  enabled: false,
  botToken: "",
  systemUserId: "",
};

function normalizeTelegramOrderBotConfig(input) {
  return {
    enabled: Boolean(input?.enabled),
    botToken: String(input?.botToken || "").trim(),
    systemUserId: String(input?.systemUserId || "").trim(),
  };
}

async function loadTelegramOrderBotConfig(client = pool) {
  const { rows } = await client.query(
    "SELECT value FROM app_settings WHERE key = 'telegram_order_bot' LIMIT 1"
  );
  if (!rows[0]?.value || typeof rows[0].value !== "object") {
    const alerts = await loadTelegramAlertsConfig(client);
    return {
      ...EMPTY_CONFIG,
      botToken: String(alerts?.botToken || "").trim(),
    };
  }
  const saved = normalizeTelegramOrderBotConfig(rows[0].value);
  if (!saved.botToken) {
    const alerts = await loadTelegramAlertsConfig(client);
    saved.botToken = String(alerts?.botToken || "").trim();
  }
  return saved;
}

async function saveTelegramOrderBotConfig(input, client = pool) {
  const payload = normalizeTelegramOrderBotConfig(input);
  await client.query(
    `
      INSERT INTO app_settings(key, value, updated_at)
      VALUES ('telegram_order_bot', $1::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [JSON.stringify(payload)]
  );
  return payload;
}

async function sendTelegramBotMessage({ botToken, chatId, text, replyMarkup }) {
  if (!botToken || !chatId || !text) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
      }),
    });
  } catch (error) {
    console.error("No se pudo enviar mensaje del bot de pedidos:", error?.message || error);
  }
}

async function loadConversation(channel, chatId, client = pool) {
  const { rows } = await client.query(
    "SELECT * FROM bot_conversations WHERE channel = $1 AND chat_id = $2 LIMIT 1",
    [channel, chatId]
  );
  return rows[0] || null;
}

async function saveConversation(channel, chatId, state, data, client = pool) {
  const payload = data && typeof data === "object" ? data : {};
  const { rows } = await client.query(
    `
      INSERT INTO bot_conversations(channel, chat_id, state, data, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, NOW())
      ON CONFLICT (channel, chat_id)
      DO UPDATE SET state = EXCLUDED.state, data = EXCLUDED.data, updated_at = NOW()
      RETURNING *
    `,
    [channel, chatId, state, JSON.stringify(payload)]
  );
  return rows[0];
}

async function clearConversation(channel, chatId, client = pool) {
  await client.query("DELETE FROM bot_conversations WHERE channel = $1 AND chat_id = $2", [
    channel,
    chatId,
  ]);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function findCustomerByPhone(phone, client = pool) {
  const needle = normalizePhone(phone);
  if (!needle) return null;
  const { rows } = await client.query(
    `
      SELECT id, name, phone, address, preferred_price_list, enable_current_account
      FROM customers
      WHERE phone IS NOT NULL AND TRIM(phone) <> ''
    `
  );

  const matches = rows.filter((row) => normalizePhone(row.phone) === needle);
  if (matches.length !== 1) return null;
  return matches[0];
}

async function getDefaultSystemUserId(client = pool) {
  const { rows } = await client.query(
    `
      SELECT id
      FROM users
      WHERE is_active = TRUE
      ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, created_at ASC
      LIMIT 1
    `
  );
  return rows[0]?.id || null;
}

async function getActingUserId(config, client = pool) {
  const configured = String(config?.systemUserId || "").trim();
  if (configured) {
    const { rows } = await client.query(
      "SELECT id FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1",
      [configured]
    );
    if (rows[0]?.id) return rows[0].id;
  }
  return getDefaultSystemUserId(client);
}

async function getLocalLocationId(client = pool) {
  const { rows } = await client.query("SELECT id FROM locations WHERE code = 'LOCAL' LIMIT 1");
  return rows[0]?.id || null;
}

function getPriceForList(product, priceListKey) {
  const key = String(priceListKey || "").toUpperCase();
  if (key === "MINORISTA") return Number(product.price_minorista || 0);
  if (key === "MAYORISTA") return Number(product.price_mayorista || 0);
  const dynamic = product.price_lists && typeof product.price_lists === "object" ? product.price_lists : {};
  return Number(dynamic[key] || 0);
}

function computeMatchScore(product, query) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!queryTokens.length) return -1;

  const name = normalizeText(product.name);
  const sku = normalizeText(product.sku);
  const nameTokens = name.split(/\s+/).filter(Boolean);

  let score = 0;
  for (const token of queryTokens) {
    const nameToken = nameTokens.find((part) => part.startsWith(token));
    if (nameToken) {
      score += 25;
      continue;
    }
    if (name.includes(token)) {
      score += 10;
      continue;
    }
    if (sku.startsWith(token)) {
      score += 18;
      continue;
    }
    if (sku.includes(token)) {
      score += 8;
      continue;
    }
    return -1;
  }

  if (name.startsWith(normalizedQuery)) score += 12;
  if (Number(product.stock_local || 0) > 0) score += 30;
  return score;
}

async function resolveProductLine(query, client = pool) {
  const localId = await getLocalLocationId(client);
  if (!localId) return null;

  const { rows } = await client.query(
    `
      SELECT
        p.id,
        p.name,
        COALESCE(p.sku, '') AS sku,
        p.price_minorista,
        p.price_mayorista,
        p.price_lists,
        COALESCE(b.quantity, 0) AS stock_local
      FROM products p
      LEFT JOIN inventory_balances b
        ON b.product_id = p.id
       AND b.location_id = $1
      WHERE COALESCE(p.is_active, TRUE) = TRUE
    `,
    [localId]
  );

  const ranked = rows
    .map((row) => ({ ...row, score: computeMatchScore(row, query) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (Number(b.stock_local || 0) !== Number(a.stock_local || 0)) {
        return Number(b.stock_local || 0) - Number(a.stock_local || 0);
      }
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

  return ranked[0] || null;
}

function parseOrderLines(text) {
  return String(text || "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (match) {
        return { qty: Number(match[1]), query: match[2].trim() };
      }
      return { qty: 1, query: line };
    })
    .filter((item) => item.qty > 0 && item.query);
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function buildOrderSummary(items, total) {
  const lines = ["Resumen de tu pedido:"];
  for (const item of items) {
    lines.push(`- ${item.qty} x ${item.name} = ${formatMoney(item.lineTotal)}`);
  }
  lines.push(`Total estimado: ${formatMoney(total)}`);
  return lines.join("\n");
}

function requestContactKeyboard() {
  return {
    keyboard: [[{ text: "Compartir telefono", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function removeKeyboard() {
  return {
    remove_keyboard: true,
  };
}

function normalizePaymentChoice(text) {
  const normalized = normalizeText(text);
  if (normalized.includes("EFECTIVO")) {
    return {
      label: "EFECTIVO",
      deliveryPayment: "COBRAR_EN_ENTREGA",
      deliveryPaymentMethod: "EFECTIVO",
    };
  }
  if (normalized.includes("TRANSFER")) {
    return {
      label: "TRANSFERENCIA",
      deliveryPayment: "TRANSFER_PREVIA",
      deliveryPaymentMethod: "TRANSFERENCIA",
    };
  }
  return null;
}

function computeScheduledDateForShift(shift, now = new Date()) {
  const date = new Date(now);
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (shift === "MANIANA" && minutes >= 19 * 60 + 30) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

async function createTelegramDeliverySale({ conversationData, config }, client = pool) {
  const actingUserId = await getActingUserId(config, client);
  if (!actingUserId) {
    throw new Error("No hay un usuario activo disponible para registrar pedidos del bot");
  }

  const items = Array.isArray(conversationData.items) ? conversationData.items : [];
  if (!items.length) {
    throw new Error("El pedido no tiene productos");
  }

  const shift = proposeShift(new Date());
  const scheduledDate = computeScheduledDateForShift(shift, new Date());
  const deliverySlot = shift === "MANIANA" ? "11" : "19";
  const saleNumber = buildSaleNumber();
  const notes = [String(conversationData.notes || "").trim(), "Pedido generado por Telegram"]
    .filter(Boolean)
    .join(" | ");

  const saleRes = await client.query(
    `
      INSERT INTO sales(
        sale_number,
        customer_id,
        sale_type,
        shift,
        scheduled_date,
        status,
        payment_method,
        payment_condition,
        delivery_address,
        notes,
        created_by,
        customer_name_snapshot,
        seller_name_snapshot,
        invoice_type,
        is_delivery,
        delivery_slot,
        delivery_payment,
        delivery_payment_method,
        delivery_status
      )
      VALUES ($1,$2,'ENVIO',$3,$4,'PENDIENTE',NULL,NULL,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,$13,'PENDIENTE')
      RETURNING *
    `,
    [
      saleNumber,
      conversationData.customerId || null,
      shift,
      scheduledDate,
      conversationData.address,
      notes || null,
      actingUserId,
      conversationData.customerName,
      "BOT TELEGRAM",
      "Factura B",
      deliverySlot,
      conversationData.deliveryPayment,
      conversationData.deliveryPaymentMethod,
    ]
  );

  for (const item of items) {
    await client.query(
      `
        INSERT INTO sale_items(sale_id, product_id, qty, unit_price, line_total)
        VALUES ($1,$2,$3,$4,$5)
      `,
      [saleRes.rows[0].id, item.productId, item.qty, item.unitPrice, item.lineTotal]
    );
  }

  return saleRes.rows[0];
}

module.exports = {
  normalizeTelegramOrderBotConfig,
  loadTelegramOrderBotConfig,
  saveTelegramOrderBotConfig,
  sendTelegramBotMessage,
  loadConversation,
  saveConversation,
  clearConversation,
  normalizePhone,
  findCustomerByPhone,
  resolveProductLine,
  parseOrderLines,
  formatMoney,
  buildOrderSummary,
  requestContactKeyboard,
  removeKeyboard,
  normalizePaymentChoice,
  createTelegramDeliverySale,
};
