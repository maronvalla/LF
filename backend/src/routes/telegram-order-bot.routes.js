const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { authRequired } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const {
  loadTelegramOrderBotConfig,
  saveTelegramOrderBotConfig,
  sendTelegramBotMessage,
  loadConversation,
  saveConversation,
  clearConversation,
  findCustomerByPhone,
  resolveProductLine,
  parseOrderLines,
  formatMoney,
  buildOrderSummary,
  requestContactKeyboard,
  removeKeyboard,
  normalizePaymentChoice,
  createTelegramDeliverySale,
} = require("../services/telegram-order-bot");

const router = express.Router();

const CHANNEL = "TELEGRAM";

const telegramOrderBotSchema = z.object({
  enabled: z.boolean().optional().default(false),
  botToken: z.string().trim().max(255).optional().default(""),
  systemUserId: z.string().trim().max(100).optional().default(""),
});

function getMessageFromUpdate(update) {
  return update?.message || update?.edited_message || null;
}

function buildHelpMessage() {
  return [
    "Bot de pedidos de envio.",
    "",
    "Enviame tu pedido en lineas como estas:",
    "2 pepsi 2.25",
    "1 manaos cola 2.25",
    "",
    "Despues te voy a pedir nombre, direccion y como pagarias.",
    'Escribe "cancelar" para borrar la conversacion actual.',
  ].join("\n");
}

function buildCustomerMatchedMessage(customer) {
  return [
    `Te identifique como ${customer.name}.`,
    customer.address ? `Direccion guardada: ${customer.address}` : "No tengo una direccion guardada para este cliente.",
    "Ahora enviame tu pedido.",
  ].join("\n");
}

async function moveConversationForward(botToken, chatId, conversation, nextData) {
  const customerName = String(nextData.customerName || "").trim();
  const address = String(nextData.address || "").trim();
  if (!customerName) {
    await saveConversation(CHANNEL, chatId, "AWAITING_NAME", nextData);
    await sendTelegramBotMessage({
      botToken,
      chatId,
      text: "Perfecto. Decime a nombre de quien es el pedido.",
      replyMarkup: removeKeyboard(),
    });
    return;
  }
  if (!address) {
    await saveConversation(CHANNEL, chatId, "AWAITING_ADDRESS", nextData);
    await sendTelegramBotMessage({
      botToken,
      chatId,
      text: "Perfecto. Decime la direccion de entrega.",
      replyMarkup: removeKeyboard(),
    });
    return;
  }
  await saveConversation(CHANNEL, chatId, "AWAITING_PAYMENT", nextData);
  await sendTelegramBotMessage({
    botToken,
    chatId,
    text: `${buildOrderSummary(nextData.items, nextData.total)}\n\nComo pagarias? Responde EFECTIVO o TRANSFERENCIA.`,
    replyMarkup: removeKeyboard(),
  });
}

async function handleOrderDraft({ botToken, chatId, text, conversation }) {
  const lines = parseOrderLines(text);
  if (!lines.length) {
    await sendTelegramBotMessage({
      botToken,
      chatId,
      text: buildHelpMessage(),
      replyMarkup: requestContactKeyboard(),
    });
    return;
  }

  const issues = [];
  const items = [];
  const client = await pool.connect();
  try {
    for (const line of lines) {
      const product = await resolveProductLine(line.query, client);
      if (!product) {
        issues.push(`No encontre "${line.query}"`);
        continue;
      }
      if (Number(product.stock_local || 0) < Number(line.qty || 0)) {
        issues.push(
          `${product.name} sin stock suficiente. Disponible: ${Number(product.stock_local || 0)}`
        );
        continue;
      }

      const priceListKey = String(conversation?.data?.preferredPriceList || "MAYORISTA").toUpperCase();
      const unitPrice =
        priceListKey === "MINORISTA"
          ? Number(product.price_minorista || 0)
          : priceListKey === "MAYORISTA"
          ? Number(product.price_mayorista || 0)
          : Number((product.price_lists && product.price_lists[priceListKey]) || 0);
      if (unitPrice <= 0) {
        issues.push(`${product.name} no tiene precio para la lista ${priceListKey}`);
        continue;
      }

      items.push({
        productId: product.id,
        name: product.name,
        qty: Number(line.qty || 0),
        unitPrice,
        lineTotal: Number(line.qty || 0) * unitPrice,
      });
    }
  } finally {
    client.release();
  }

  if (issues.length || !items.length) {
    const issueText = issues.length ? issues.join("\n") : "No pude interpretar el pedido.";
    await sendTelegramBotMessage({
      botToken,
      chatId,
      text: `${issueText}\n\nReenviame el pedido, una linea por producto. Ejemplo:\n2 pepsi 2.25`,
      replyMarkup: requestContactKeyboard(),
    });
    return;
  }

  const total = items.reduce((acc, item) => acc + Number(item.lineTotal || 0), 0);
  const nextData = {
    ...(conversation?.data || {}),
    items,
    total,
  };

  await moveConversationForward(botToken, chatId, conversation, nextData);
}

async function processTelegramMessage({ config, message }) {
  const botToken = config.botToken;
  const chatId = String(message?.chat?.id || "");
  if (!chatId) return;

  const current = (await loadConversation(CHANNEL, chatId)) || {
    state: "IDLE",
    data: {},
  };
  const text = String(message?.text || "").trim();
  const lowered = text.toLowerCase();

  if (lowered === "/start" || lowered === "ayuda") {
    await clearConversation(CHANNEL, chatId);
    await sendTelegramBotMessage({
      botToken,
      chatId,
      text: buildHelpMessage(),
      replyMarkup: requestContactKeyboard(),
    });
    return;
  }

  if (lowered === "cancelar") {
    await clearConversation(CHANNEL, chatId);
    await sendTelegramBotMessage({
      botToken,
      chatId,
      text: "Perfecto. Borre el pedido en curso. Cuando quieras, enviame uno nuevo.",
      replyMarkup: requestContactKeyboard(),
    });
    return;
  }

  if (message?.contact?.phone_number) {
    const customer = await findCustomerByPhone(message.contact.phone_number);
    if (!customer) {
      const nextData = {
        ...(current.data || {}),
      };
      await saveConversation(CHANNEL, chatId, current.state || "IDLE", nextData);
      await sendTelegramBotMessage({
        botToken,
        chatId,
        text: "Recibi tu telefono, pero no encontre un cliente asociado. Puedes seguir igual y te pedire nombre y direccion.",
        replyMarkup: removeKeyboard(),
      });
      if (Array.isArray(nextData.items) && nextData.items.length) {
        await moveConversationForward(botToken, chatId, current, nextData);
      }
      return;
    }

    const nextData = {
      ...(current.data || {}),
      customerId: customer.id,
      customerName: customer.name,
      address: customer.address || "",
      preferredPriceList: customer.preferred_price_list || "MAYORISTA",
      enableCurrentAccount: Boolean(customer.enable_current_account),
    };
    if (Array.isArray(nextData.items) && nextData.items.length) {
      await sendTelegramBotMessage({
        botToken,
        chatId,
        text: buildCustomerMatchedMessage(customer),
        replyMarkup: removeKeyboard(),
      });
      await moveConversationForward(botToken, chatId, current, nextData);
      return;
    }
    await saveConversation(CHANNEL, chatId, current.state || "IDLE", nextData);
    await sendTelegramBotMessage({
      botToken,
      chatId,
      text: buildCustomerMatchedMessage(customer),
      replyMarkup: removeKeyboard(),
    });
    return;
  }

  if (current.state === "AWAITING_NAME") {
    const nextData = {
      ...(current.data || {}),
      customerName: text,
    };
    await moveConversationForward(botToken, chatId, current, nextData);
    return;
  }

  if (current.state === "AWAITING_ADDRESS") {
    const nextData = {
      ...(current.data || {}),
      address: text,
    };
    await moveConversationForward(botToken, chatId, current, nextData);
    return;
  }

  if (current.state === "AWAITING_PAYMENT") {
    const payment = normalizePaymentChoice(text);
    if (!payment) {
      await sendTelegramBotMessage({
        botToken,
        chatId,
        text: "No entendi la forma de pago. Responde EFECTIVO o TRANSFERENCIA.",
      });
      return;
    }
    const nextData = {
      ...(current.data || {}),
      paymentLabel: payment.label,
      deliveryPayment: payment.deliveryPayment,
      deliveryPaymentMethod: payment.deliveryPaymentMethod,
    };
    await saveConversation(CHANNEL, chatId, "AWAITING_CONFIRMATION", nextData);
    await sendTelegramBotMessage({
      botToken,
      chatId,
      text: `${buildOrderSummary(nextData.items, nextData.total)}\n\nNombre: ${nextData.customerName}\nDireccion: ${nextData.address}\nPago: ${payment.label}\n\nSi esta bien, responde CONFIRMAR.`,
    });
    return;
  }

  if (current.state === "AWAITING_CONFIRMATION") {
    if (lowered !== "confirmar") {
      await sendTelegramBotMessage({
        botToken,
        chatId,
        text: 'Si esta todo bien responde "CONFIRMAR". Si quieres empezar de nuevo, escribe "cancelar".',
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sale = await createTelegramDeliverySale(
        {
          conversationData: current.data || {},
          config,
        },
        client
      );
      await client.query("COMMIT");
      await clearConversation(CHANNEL, chatId, client);
      await sendTelegramBotMessage({
        botToken,
        chatId,
        text: `Pedido creado con exito.\nNumero: ${sale.sale_number}\nTurno: ${sale.delivery_slot === "11" ? "MANANA (11:00)" : "TARDE (19:00)"}\nFecha: ${sale.scheduled_date}\nTotal estimado: ${formatMoney(current.data?.total || 0)}`,
      });
      return;
    } catch (error) {
      await client.query("ROLLBACK");
      await sendTelegramBotMessage({
        botToken,
        chatId,
        text: `No pude crear el pedido: ${error.message || "error interno"}`,
      });
      return;
    } finally {
      client.release();
    }
  }

  await handleOrderDraft({ botToken, chatId, text, conversation: current });
}

router.get(
  "/config",
  authRequired,
  requirePermission("settings.manage"),
  asyncHandler(async (_req, res) => {
    const config = await loadTelegramOrderBotConfig();
    res.json(config);
  })
);

router.put(
  "/config",
  authRequired,
  requirePermission("settings.manage"),
  asyncHandler(async (req, res) => {
    const parsed = telegramOrderBotSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Configuracion invalida" });
    }
    const saved = await saveTelegramOrderBotConfig(parsed.data);
    res.json({ ok: true, ...saved });
  })
);

router.post(
  "/webhook/:token",
  asyncHandler(async (req, res) => {
    const config = await loadTelegramOrderBotConfig();
    if (!config.enabled || !config.botToken) {
      return res.json({ ok: true, ignored: true });
    }
    if (String(req.params.token || "").trim() !== config.botToken) {
      return res.status(403).json({ ok: false, message: "Token invalido" });
    }

    const message = getMessageFromUpdate(req.body || {});
    if (!message) return res.json({ ok: true });
    await processTelegramMessage({ config, message });
    res.json({ ok: true });
  })
);

module.exports = router;
