const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { blockDuringStockControl } = require("../middleware/stock-control");
const { asyncHandler } = require("../utils/async-handler");
const { buildSaleNumber, proposeShift } = require("../utils/sales");
const { logAudit } = require("../services/audit");
const { notifyCriticalStockForProductIds } = require("../services/telegram-alerts");

const router = express.Router();

const deliveryConditionSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_]{3,64}$/)
  .nullable()
  .optional();

function normalizeDeliveryCondition(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toUpperCase();
  if (!raw) return null;
  if (raw === "PAGO_LOCAL_TRANSFERENCIA") return "PAGO_ENTREGA_TRANSFERENCIA";
  return raw.replace(/\s+/g, "_");
}

const createSaleSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1).max(200).nullable().optional(),
  sellerId: z.string().uuid().nullable().optional(),
  vendedorId: z.string().uuid().nullable().optional(),
  sellerName: z.string().trim().min(1).max(200).nullable().optional(),
  sellerNameSnapshot: z.string().trim().min(1).max(200).nullable().optional(),
  saleType: z.enum(["MOSTRADOR", "ENVIO"]),
  isDelivery: z.boolean().optional(),
  shift: z.enum(["MANIANA", "TARDE"]).nullable().optional(),
  deliverySlot: z.enum(["11", "19"]).nullable().optional(),
  scheduledDate: z.string().date().optional(),
  invoiceType: z.string().trim().min(1).max(80).optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentCondition: deliveryConditionSchema,
  deliveryPayment: deliveryConditionSchema,
  deliveryPaymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "MIXTO"]).nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().positive(),
        unitPrice: z.number().int().nonnegative(),
      })
    )
    .min(1),
});

const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

const createBudgetSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1).max(200),
  sellerName: z.string().trim().min(1).max(200).nullable().optional(),
  saleType: z.enum(["MOSTRADOR", "ENVIO"]),
  shift: z.enum(["MANIANA", "TARDE"]).nullable().optional(),
  scheduledDate: z.string().date().nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  budgetNumber: z.string().trim().min(3).max(80),
  invoiceType: z.string().trim().min(1).max(80).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().positive(),
        unitPrice: z.number().int().nonnegative(),
      })
    )
    .min(1),
});

const checkoutSaleSchema = z.object({
  paymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "MIXTO", "CUENTA_CORRIENTE"]),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1).max(200),
  notes: z.string().nullable().optional(),
  transferAmount: z.number().nonnegative().optional(),
  cashAmount: z.number().nonnegative().optional(),
  proofImageBase64: z.string().optional().nullable(),
  proofImageMimeType: z.string().optional().nullable(),
  proofImageName: z.string().optional().nullable(),
});

async function getLocalId(client) {
  const { rows } = await client.query("SELECT id FROM locations WHERE code = 'LOCAL' LIMIT 1");
  if (!rows[0]) throw new Error("Location LOCAL no inicializada");
  return rows[0].id;
}

async function ensureBalance(client, productId, locationId) {
  await client.query(
    `
      INSERT INTO inventory_balances(product_id, location_id, quantity)
      VALUES ($1, $2, 0)
      ON CONFLICT (product_id, location_id) DO NOTHING
    `,
    [productId, locationId]
  );
}

async function restoreSaleInventory(client, saleId, actorUserId) {
  const localId = await getLocalId(client);
  const itemsRes = await client.query("SELECT * FROM sale_items WHERE sale_id = $1", [saleId]);

  for (const item of itemsRes.rows) {
    await ensureBalance(client, item.product_id, localId);
    await client.query(
      `
        UPDATE inventory_balances
        SET quantity = quantity + $1, updated_at = now()
        WHERE product_id = $2 AND location_id = $3
      `,
      [item.qty, item.product_id, localId]
    );
    await client.query(
      `
        INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason, ref_type, ref_id, created_by)
        VALUES ($1, NULL, $2, $3, 'SALE_ANULADA_RESTORE', 'sale', $4, $5)
      `,
      [item.product_id, localId, item.qty, saleId, actorUserId]
    );
  }
}

async function getSaleTotalAmount(client, saleId) {
  const totalRes = await client.query(
    "SELECT COALESCE(SUM(line_total), 0)::numeric AS total FROM sale_items WHERE sale_id = $1",
    [saleId]
  );
  return Number(totalRes.rows[0]?.total || 0);
}

function getSaleCashImpactAmount(sale, totalAmount) {
  const method = String(sale?.payment_method || "").trim().toUpperCase();
  if (method === "EFECTIVO") return Number(totalAmount || 0);
  if (method === "MIXTO") return Number(totalAmount || 0) / 2;
  return 0;
}

async function getOpenCashRegisterSession(client) {
  const today = new Date().toISOString().slice(0, 10);
  const sessionRes = await client.query(
    `SELECT * FROM cash_register_sessions
     WHERE date = $1 AND status = 'ABIERTA'
     ORDER BY opened_at DESC
     LIMIT 1`,
    [today]
  );
  return sessionRes.rows[0] || null;
}

async function assertOpenCashRegisterForCheckout(client) {
  const openSession = await getOpenCashRegisterSession(client);
  if (!openSession) {
    const err = new Error("No hay caja abierta. Debe abrir caja para facturar");
    err.status = 400;
    throw err;
  }
  return openSession;
}

async function registerSaleCancellationCashMovement(client, sale, actorUserId, totalAmount) {
  const cashImpact = getSaleCashImpactAmount(sale, totalAmount);
  if (cashImpact <= 0) {
    return { adjusted: false, amount: 0 };
  }

  const session = await getOpenCashRegisterSession(client);
  if (!session) {
    throw new Error("No hay caja abierta para registrar la devolucion en caja de esta venta anulada");
  }

  await client.query(
    `INSERT INTO cash_register_movements (session_id, movement_type, amount, concept, created_by)
     VALUES ($1, 'RETIRO', $2, $3, $4)`,
    [
      session.id,
      cashImpact,
      `Anulacion de venta ${sale.sale_number || sale.id}`,
      actorUserId,
    ]
  );

  return { adjusted: true, amount: cashImpact, sessionId: session.id };
}

async function reverseCustomerCurrentAccountDebit(client, sale, actorUserId, totalAmount) {
  if (String(sale?.payment_method || "").trim().toUpperCase() !== "CUENTA_CORRIENTE" || !sale?.customer_id) {
    return { adjusted: false, amount: 0 };
  }

  const debitRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::int AS total
     FROM customer_current_account_entries
     WHERE sale_id = $1 AND customer_id = $2 AND entry_type = 'DEBITO'`,
    [sale.id, sale.customer_id]
  );

  const debitAmount = Number(debitRes.rows[0]?.total || 0) || Number(totalAmount || 0);
  if (debitAmount <= 0) {
    return { adjusted: false, amount: 0 };
  }

  await client.query(
    `INSERT INTO customer_current_account_entries(
      customer_id,
      sale_id,
      entry_type,
      amount,
      payment_method,
      description,
      created_by
    )
    VALUES ($1, $2, 'PAGO', $3, 'ANULACION_VENTA', $4, $5)`,
    [
      sale.customer_id,
      sale.id,
      debitAmount,
      `Anulacion de venta ${sale.sale_number || sale.id}`,
      actorUserId,
    ]
  );

  return { adjusted: true, amount: debitAmount };
}

function canChargeSales(user) {
  const role = String(user?.role || "").toUpperCase();
  return role === "ADMIN" || role === "CAJERO";
}

async function findItemsWithoutStock(client, items, options = {}) {
  const localId = await getLocalId(client);
  const excludeSaleId = options.excludeSaleId ? String(options.excludeSaleId) : null;
  const requestedByProduct = new Map();

  for (const item of items || []) {
    const productId = String(item.productId || "");
    const qty = Number(item.qty || 0);
    if (!productId || !Number.isFinite(qty)) continue;
    requestedByProduct.set(productId, (requestedByProduct.get(productId) || 0) + qty);
  }

  const productIds = Array.from(requestedByProduct.keys());
  if (!productIds.length) return [];

  const { rows } = await client.query(
    `
      SELECT
        p.id,
        p.name,
        COALESCE(b.quantity, 0) AS quantity,
        COALESCE(reserved.reserved_qty, 0) AS reserved_qty
      FROM products p
      LEFT JOIN inventory_balances b
        ON b.product_id = p.id
       AND b.location_id = $2
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(si.qty), 0) AS reserved_qty
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE si.product_id = p.id
          AND s.status = 'PENDIENTE'
          AND s.status <> 'ANULADO'
          AND ($3::uuid IS NULL OR s.id <> $3::uuid)
      ) reserved ON true
      WHERE p.id = ANY($1::uuid[])
    `,
    [productIds, localId, excludeSaleId]
  );

  return rows
    .map((row) => {
      const available = Math.max(
        0,
        Number(row.quantity || 0) - Number(row.reserved_qty || 0)
      );
      const requested = Number(requestedByProduct.get(String(row.id)) || 0);
      if (available >= requested) return null;
      return {
        productId: row.id,
        productName: row.name,
        available,
        requested,
        reserved: Number(row.reserved_qty || 0),
      };
    })
    .filter(Boolean);
}

async function getSaleWithItems(client, saleId) {
  const saleRes = await client.query(
    `
      SELECT
        s.*,
        COALESCE(c.name, s.customer_name_snapshot, 'CONSUMIDOR FINAL') AS customer_name,
        COALESCE(NULLIF(TRIM(s.seller_name_snapshot), ''), u.full_name, u.username) AS created_by_name,
        u.username AS created_by_username
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.created_by
      WHERE s.id = $1
      LIMIT 1
    `,
    [saleId]
  );
  const sale = saleRes.rows[0];
  if (!sale) return null;

  const itemsRes = await client.query(
    `
      SELECT
        si.*,
        p.name AS product_name,
        COALESCE(p.sku, p.id::text) AS product_sku,
        p.price_minorista,
        p.price_mayorista
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = $1
      ORDER BY si.id ASC
    `,
    [saleId]
  );

  return {
    ...sale,
    items: itemsRes.rows,
  };
}

async function deductMostradorInventory(client, saleId, actorUserId) {
  const itemsRes = await client.query("SELECT * FROM sale_items WHERE sale_id = $1", [saleId]);
  const localId = await getLocalId(client);

  for (const item of itemsRes.rows) {
    await ensureBalance(client, item.product_id, localId);
    const moved = await client.query(
      `
        UPDATE inventory_balances
        SET quantity = quantity - $1, updated_at = now()
        WHERE product_id = $2 AND location_id = $3 AND quantity >= $1
        RETURNING *
      `,
      [item.qty, item.product_id, localId]
    );
    if (!moved.rows[0]) {
      throw new Error(`Stock insuficiente en LOCAL para producto ${item.product_id}`);
    }
    await client.query(
      `
        INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason, ref_type, ref_id, created_by)
        VALUES ($1, $2, NULL, $3, 'SALE_COMPLETED', 'sale', $4, $5)
      `,
      [item.product_id, localId, item.qty, saleId, actorUserId]
    );
  }
}

async function registerCustomerCurrentAccountDebit(client, sale, actorUserId) {
  const customerId = sale.customer_id;
  if (!customerId) {
    throw new Error("La cuenta corriente requiere un cliente registrado");
  }

  const customerRes = await client.query(
    "SELECT id, name, enable_current_account FROM customers WHERE id = $1 LIMIT 1",
    [customerId]
  );
  const customer = customerRes.rows[0];
  if (!customer) {
    throw new Error("Cliente no encontrado para cuenta corriente");
  }
  if (!customer.enable_current_account) {
    throw new Error("El cliente no tiene cuenta corriente habilitada");
  }

  const totalAmount = await getSaleTotalAmount(client, sale.id);

  await client.query(
    `
      INSERT INTO customer_current_account_entries(
        customer_id,
        sale_id,
        entry_type,
        amount,
        payment_method,
        description,
        created_by
      )
      VALUES ($1, $2, 'DEBITO', $3, 'CUENTA_CORRIENTE', $4, $5)
    `,
    [
      customerId,
      sale.id,
      totalAmount,
      `Venta ${sale.sale_number || sale.id}`,
      actorUserId,
    ]
  );
}

router.get(
  "/",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const seller = String(req.query.seller || "").trim();
    const customer = String(req.query.customer || "").trim();
    const params = [];
    const whereClauses = [];

    if (status) {
      params.push(status);
      whereClauses.push(`s.status = $${params.length}`);
    }
    if (from) {
      params.push(from);
      whereClauses.push(`s.created_at::date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      whereClauses.push(`s.created_at::date <= $${params.length}::date`);
    }
    if (seller) {
      params.push(seller);
      whereClauses.push(`s.created_by = $${params.length}::uuid`);
    }
    if (customer) {
      params.push(`%${customer}%`);
      whereClauses.push(`COALESCE(c.name, '') ILIKE $${params.length}`);
    }
    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `
      SELECT
        s.*,
        COALESCE(c.name, s.customer_name_snapshot, 'CONSUMIDOR FINAL') AS customer_name,
        COALESCE(NULLIF(TRIM(s.seller_name_snapshot), ''), u.full_name, u.username) AS created_by_name,
        u.username AS created_by_username,
        COALESCE(SUM(si.line_total), 0)::numeric AS total_amount
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.created_by
      LEFT JOIN sale_items si ON si.sale_id = s.id
      ${where}
      GROUP BY s.id, c.name, u.full_name, u.username
      ORDER BY s.created_at DESC
      LIMIT 500
    `,
      params
    );
    res.json(rows);
  })
);

router.get(
  "/my-orders-today",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `
      SELECT
        s.id,
        s.sale_number,
        s.created_at,
        s.status,
        s.sale_type,
        COALESCE(NULLIF(TRIM(s.seller_name_snapshot), ''), creator.full_name, creator.username, 'N/A') AS seller_name,
        COALESCE(c.name, s.customer_name_snapshot, 'CONSUMIDOR FINAL') AS customer_name,
        COALESCE(SUM(si.line_total), 0)::numeric AS total_amount
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users creator ON creator.id = s.created_by
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.created_by = $1
        AND s.created_at::date = CURRENT_DATE
        AND s.status = 'PENDIENTE'
        AND s.payment_method IS NULL
      GROUP BY s.id, c.name, creator.full_name, creator.username
      ORDER BY s.created_at DESC
    `,
      [req.user.id]
    );
    res.json(rows);
  })
);

router.get(
  "/pending-orders",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    if (!canChargeSales(req.user)) {
      return res.json([]);
    }

    const { rows } = await pool.query(
      `
      SELECT
        s.id,
        s.sale_number,
        s.created_at,
        s.customer_id,
        COALESCE(c.name, s.customer_name_snapshot, 'CONSUMIDOR FINAL') AS customer_name,
        COALESCE(SUM(si.line_total), 0)::numeric AS total_amount,
        COALESCE(SUM(si.qty), 0)::int AS total_items,
        COALESCE(NULLIF(TRIM(s.seller_name_snapshot), ''), creator.full_name, creator.username) AS created_by_name,
        creator.username AS created_by_username
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users creator ON creator.id = s.created_by
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.sale_type = 'MOSTRADOR'
        AND s.status = 'PENDIENTE'
        AND s.payment_method IS NULL
      GROUP BY s.id, c.name, creator.full_name, creator.username
      ORDER BY s.created_at ASC
    `
    );
    res.json(rows);
  })
);

router.post(
  "/budgets",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const parsed = createBudgetSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos" });
    }

    const data = parsed.data;
    const customerName = String(data.customerName || "").trim() || "CONSUMIDOR FINAL";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const totalAmount = data.items.reduce(
        (acc, item) => acc + Number(item.qty || 0) * Number(item.unitPrice || 0),
        0
      );
      const sellerNameSnapshot =
        String(data.sellerName || "").trim() ||
        String(req.user?.fullName || req.user?.full_name || req.user?.username || "").trim() ||
        null;
      const invoiceType = String(data.invoiceType || "Presupuesto").trim() || "Presupuesto";

      const budgetRes = await client.query(
        `
          INSERT INTO budgets(
            budget_number,
            customer_id,
            customer_name_snapshot,
            sale_type,
            shift,
            scheduled_date,
            delivery_address,
            notes,
            total_amount,
            created_by,
            seller_name_snapshot,
            invoice_type
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING *
        `,
        [
          data.budgetNumber,
          data.customerId || null,
          customerName,
          data.saleType,
          data.shift || null,
          data.scheduledDate || null,
          data.deliveryAddress || null,
          data.notes || null,
          totalAmount,
          req.user.id,
          sellerNameSnapshot,
          invoiceType,
        ]
      );

      for (const item of data.items) {
        const lineTotal = Number(item.qty || 0) * Number(item.unitPrice || 0);
        await client.query(
          `
            INSERT INTO budget_items(budget_id, product_id, qty, unit_price, line_total)
            VALUES ($1,$2,$3,$4,$5)
          `,
          [budgetRes.rows[0].id, item.productId, item.qty, item.unitPrice, lineTotal]
        );
      }

      await logAudit({
        actorUserId: req.user.id,
        action: "BUDGET_CREATE",
        entity: "budgets",
        entityId: budgetRes.rows[0].id,
        metadata: {
          after: budgetRes.rows[0],
          items: data.items,
        },
        client,
      });

      await client.query("COMMIT");
      res.status(201).json(budgetRes.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

router.get(
  "/:id",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
      const sale = await getSaleWithItems(client, req.params.id);
      if (!sale) {
        return res.status(404).json({ message: "Venta no encontrada" });
      }
      res.json(sale);
    } finally {
      client.release();
    }
  })
);

router.post(
  "/",
  requirePermission("sales.manage"),
  blockDuringStockControl,
  asyncHandler(async (req, res) => {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });
    const data = parsed.data;
    const isDelivery = data.isDelivery ?? data.saleType === "ENVIO";
    const saleType = isDelivery ? "ENVIO" : data.saleType;
    const shiftFromSlot = data.deliverySlot === "11" ? "MANIANA" : data.deliverySlot === "19" ? "TARDE" : null;
    const shift = isDelivery ? shiftFromSlot || data.shift || proposeShift(new Date()) : data.shift || null;
    const deliverySlot = shift === "MANIANA" ? "11" : shift === "TARDE" ? "19" : null;
    const normalizedPaymentCondition = normalizeDeliveryCondition(data.paymentCondition);
    const deliveryPayment = normalizeDeliveryCondition(data.deliveryPayment) || normalizedPaymentCondition || null;
    const deliveryPaymentMethod =
      data.deliveryPaymentMethod ||
      (deliveryPayment === "PAGO_ENTREGA_TRANSFERENCIA" || deliveryPayment === "PAGO_LOCAL_TRANSFERENCIA"
        ? "TRANSFERENCIA"
        : null);
    const scheduledDate = data.scheduledDate || new Date().toISOString().slice(0, 10);
    const sellerId = data.vendedorId || data.sellerId || req.user.id;
    const sellerNameSnapshot =
      String(data.sellerNameSnapshot || data.sellerName || "").trim() ||
      String(req.user?.fullName || req.user?.full_name || req.user?.username || "").trim() ||
      null;
    const invoiceType = String(data.invoiceType || "Factura B").trim() || "Factura B";
    const saleNumber = buildSaleNumber();
    const customerName =
      String(data.customerName || "").trim() ||
      (data.customerId ? "" : "CONSUMIDOR FINAL");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const insufficientItems = await findItemsWithoutStock(client, data.items);
      if (insufficientItems.length) {
        await client.query("ROLLBACK");
        const first = insufficientItems[0];
        return res.status(400).json({
          message: `Stock insuficiente para ${first.productName || first.productId}. Disponible: ${first.available}, solicitado: ${first.requested}`,
          items: insufficientItems,
        });
      }
      const sale = await client.query(
        `
        INSERT INTO sales(
          sale_number, customer_id, sale_type, shift, scheduled_date, status, 
          payment_method, payment_condition, delivery_address, notes, created_by,
          customer_name_snapshot, seller_name_snapshot, invoice_type,
          is_delivery, delivery_slot, delivery_payment, delivery_payment_method, delivery_status
        )
        VALUES ($1,$2,$3,$4,$5,'PENDIENTE',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'PENDIENTE')
        RETURNING *
      `,
        [
          saleNumber,
          data.customerId || null,
          saleType,
          shift,
          scheduledDate,
          data.paymentMethod || null,
          normalizedPaymentCondition,
          data.deliveryAddress || null,
          data.notes || null,
          sellerId,
          customerName || null,
          sellerNameSnapshot,
          invoiceType,
          isDelivery,
          deliverySlot,
          deliveryPayment,
          deliveryPaymentMethod,
        ]
      );
      for (const item of data.items) {
        const lineTotal = item.qty * item.unitPrice;
        await client.query(
          `
          INSERT INTO sale_items(sale_id, product_id, qty, unit_price, line_total)
          VALUES($1,$2,$3,$4,$5)
        `,
          [sale.rows[0].id, item.productId, item.qty, item.unitPrice, lineTotal]
        );
      }
      await logAudit({
        actorUserId: req.user.id,
        action: "SALE_CREATE",
        entity: "sales",
        entityId: sale.rows[0].id,
        metadata: { after: sale.rows[0], items: data.items },
        client,
      });
      await client.query("COMMIT");
      res.status(201).json(sale.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/:id/checkout",
  requirePermission("sales.manage"),
  blockDuringStockControl,
  asyncHandler(async (req, res) => {
    if (!canChargeSales(req.user)) {
      return res.status(403).json({ message: "Solo CAJERO o ADMIN pueden cobrar ordenes" });
    }

    const parsed = checkoutSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await assertOpenCashRegisterForCheckout(client);

      const saleRes = await client.query("SELECT * FROM sales WHERE id = $1 FOR UPDATE", [req.params.id]);
      const sale = saleRes.rows[0];
      if (!sale) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Venta no encontrada" });
      }
      if (String(sale.status || "").toUpperCase() === "ANULADO") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "La venta esta anulada" });
      }
      if (sale.payment_method) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "La orden ya fue cobrada" });
      }

      const transferAmount =
        parsed.data.paymentMethod === "TRANSFERENCIA"
          ? Number(parsed.data.transferAmount || 0)
          : parsed.data.paymentMethod === "MIXTO"
          ? Number(parsed.data.transferAmount || 0)
          : 0;
      if (
        String(parsed.data.proofImageBase64 || "").trim() &&
        !String(parsed.data.proofImageMimeType || "").trim()
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Falta el tipo de archivo del comprobante" });
      }

      const itemsRes = await client.query("SELECT * FROM sale_items WHERE sale_id = $1", [sale.id]);
      const insufficientItems = await findItemsWithoutStock(
        client,
        itemsRes.rows.map((item) => ({
          productId: item.product_id,
          qty: Number(item.qty || 0),
        })),
        { excludeSaleId: sale.id }
      );
      if (insufficientItems.length) {
        await client.query("ROLLBACK");
        const first = insufficientItems[0];
        return res.status(400).json({
          message: `Stock insuficiente para ${first.productName || first.productId}. Disponible: ${first.available}, solicitado: ${first.requested}`,
          items: insufficientItems,
        });
      }

      if (String(sale.sale_type || "").toUpperCase() === "MOSTRADOR") {
        await deductMostradorInventory(client, sale.id, req.user.id);
      }

      const updated = await client.query(
        `
          UPDATE sales
          SET
            customer_id = $2,
            customer_name_snapshot = $3,
            payment_method = $4,
            notes = COALESCE($5, notes),
            delivery_transfer_proof_base64 = CASE WHEN $7 <> '' THEN $7 ELSE NULL END,
            delivery_transfer_proof_mime_type = CASE WHEN $8 <> '' THEN $8 ELSE NULL END,
            delivery_transfer_proof_name = CASE WHEN $9 <> '' THEN $9 ELSE NULL END,
            status = CASE
              WHEN sale_type = 'MOSTRADOR' THEN 'COMPLETADO'
              ELSE status
            END,
            charged_by = $6,
            charged_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [
          sale.id,
          parsed.data.customerId || sale.customer_id || null,
          parsed.data.customerName,
          parsed.data.paymentMethod,
          parsed.data.notes ?? null,
          req.user.id,
          String(parsed.data.proofImageBase64 || ""),
          String(parsed.data.proofImageMimeType || ""),
          String(parsed.data.proofImageName || ""),
        ]
      );

      if (parsed.data.paymentMethod === "CUENTA_CORRIENTE") {
        await registerCustomerCurrentAccountDebit(client, updated.rows[0], req.user.id);
      }

      await logAudit({
        actorUserId: req.user.id,
        action: "SALE_CHECKOUT",
        entity: "sales",
        entityId: sale.id,
        metadata: {
          before: sale,
          after: updated.rows[0],
          paymentMethod: parsed.data.paymentMethod,
          proofAttached: Boolean(parsed.data.proofImageBase64),
        },
        client,
      });

      await client.query("COMMIT");
      if (String(sale.sale_type || "").toUpperCase() === "MOSTRADOR") {
        await notifyCriticalStockForProductIds(itemsRes.rows.map((item) => item.product_id));
      }
      const fullSale = await getSaleWithItems(client, sale.id);
      res.json(fullSale || updated.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/:id/prepare",
  requirePermission("sales.prepare"),
  blockDuringStockControl,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const saleRes = await client.query("SELECT * FROM sales WHERE id = $1 FOR UPDATE", [req.params.id]);
      const sale = saleRes.rows[0];
      if (!sale) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Venta no encontrada" });
      }
      if (sale.status !== "PENDIENTE") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Solo ventas PENDIENTE pueden prepararse" });
      }
      const itemsRes = await client.query("SELECT * FROM sale_items WHERE sale_id = $1", [sale.id]);
      const localId = await getLocalId(client);

      for (const item of itemsRes.rows) {
        await ensureBalance(client, item.product_id, localId);
        const moved = await client.query(
          `
          UPDATE inventory_balances
          SET quantity = quantity - $1, updated_at = now()
          WHERE product_id = $2 AND location_id = $3 AND quantity >= $1
          RETURNING *
        `,
          [item.qty, item.product_id, localId]
        );
        if (!moved.rows[0]) {
          await client.query("ROLLBACK");
          return res
            .status(400)
            .json({ message: `Stock insuficiente en LOCAL para producto ${item.product_id}` });
        }
        await client.query(
          `
          INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason, ref_type, ref_id, created_by)
          VALUES ($1, $2, NULL, $3, 'SALE_PREPARADO', 'sale', $4, $5)
        `,
          [item.product_id, localId, item.qty, sale.id, req.user.id]
        );
      }

      const updated = await client.query(
        "UPDATE sales SET status = 'PREPARADO', updated_at = now() WHERE id = $1 RETURNING *",
        [sale.id]
      );
      await logAudit({
        actorUserId: req.user.id,
        action: "SALE_PREPARED",
        entity: "sales",
        entityId: sale.id,
        metadata: { before: sale, after: updated.rows[0] },
        client,
      });
      await client.query("COMMIT");
      await notifyCriticalStockForProductIds(itemsRes.rows.map((item) => item.product_id));
      res.json(updated.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/:id/anular",
  requirePermission("sales.manage"),
  blockDuringStockControl,
  asyncHandler(async (req, res) => {
    const parsed = cancelSaleSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Debe indicar un motivo de anulacion (minimo 3 caracteres)" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const before = await client.query("SELECT * FROM sales WHERE id = $1 FOR UPDATE", [req.params.id]);
      const sale = before.rows[0];
      if (!sale) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Venta no encontrada" });
      }
      if (String(sale.status || "").toUpperCase() === "ANULADO") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "La venta ya esta anulada" });
      }
      if (String(sale.delivery_status || "").toUpperCase() === "ENTREGADO") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "No se puede anular una venta ya entregada" });
      }

      const saleStatus = String(sale.status || "").toUpperCase();
      const saleType = String(sale.sale_type || "").toUpperCase();
      const totalAmount = await getSaleTotalAmount(client, sale.id);
      const shouldRestoreInventory =
        ["PREPARADO", "CARGADO"].includes(saleStatus) ||
        (saleType === "MOSTRADOR" && saleStatus === "COMPLETADO");
      if (shouldRestoreInventory) {
        await restoreSaleInventory(client, sale.id, req.user.id);
      }

      const cashRegisterAdjustment = await registerSaleCancellationCashMovement(
        client,
        sale,
        req.user.id,
        totalAmount
      );
      const currentAccountAdjustment = await reverseCustomerCurrentAccountDebit(
        client,
        sale,
        req.user.id,
        totalAmount
      );

      await client.query("DELETE FROM delivery_sales WHERE sale_id = $1", [sale.id]);

      const updated = await client.query(
        `
          UPDATE sales
          SET
            status = 'ANULADO',
            delivery_status = CASE
              WHEN COALESCE(NULLIF(TRIM(UPPER(delivery_status)), ''), 'PENDIENTE') = 'ENTREGADO' THEN delivery_status
              ELSE NULL
            END,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [req.params.id]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "SALE_CANCEL",
        entity: "sales",
        entityId: req.params.id,
        metadata: {
          before: sale,
          after: updated.rows[0],
          reason: parsed.data.reason,
          restoredInventory: shouldRestoreInventory,
          cashRegisterAdjustment,
          currentAccountAdjustment,
        },
        client,
      });

      await client.query("COMMIT");
      if (shouldRestoreInventory) {
        const restoredItems = await client.query("SELECT product_id FROM sale_items WHERE sale_id = $1", [sale.id]);
        await notifyCriticalStockForProductIds(restoredItems.rows.map((item) => item.product_id));
      }
      res.json({ ...updated.rows[0], cancel_reason: parsed.data.reason });
    } catch (err) {
      await client.query("ROLLBACK");
      if (String(err?.message || "").includes("No hay caja abierta para registrar la devolucion")) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
