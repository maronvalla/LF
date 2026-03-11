const { logAudit } = require("../../services/audit");
const {
  EPSILON_QTY,
  consumeFifoLayers,
  createInboundLayer,
  ensureBalanceRow,
  getLocationIdByCode,
  getProductCost,
  restoreFifoConsumptions,
} = require("../../services/inventory-fifo");

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

async function findCustomerByPhone(client, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { rows } = await client.query(
    `
      SELECT *
      FROM customers
      WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [normalized]
  );

  return rows[0] || null;
}

async function ensureBudgetProspect({
  client,
  customerId,
  customerName,
  customerPhone,
  notes,
  deliveryAddress,
  actorUserId,
  budgetNumber,
}) {
  if (customerId) {
    const existingRes = await client.query(
      "SELECT * FROM customers WHERE id = $1 LIMIT 1",
      [customerId]
    );
    const existingCustomer = existingRes.rows[0];
    if (!existingCustomer) {
      throw new Error("Cliente no encontrado para presupuesto");
    }

    const { rows } = await client.query(
      `
        UPDATE customers
        SET
          phone = CASE
            WHEN COALESCE(NULLIF(TRIM(phone), ''), '') = '' THEN $2
            ELSE phone
          END,
          crm_last_contact_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [customerId, customerPhone]
    );

    return rows[0];
  }

  const customerByPhone = await findCustomerByPhone(client, customerPhone);
  if (customerByPhone) {
    const { rows } = await client.query(
      `
        UPDATE customers
        SET
          name = CASE
            WHEN COALESCE(NULLIF(TRIM(name), ''), '') = '' THEN $2
            ELSE name
          END,
          address = COALESCE(address, $3),
          crm_stage = CASE
            WHEN crm_stage = 'CLIENTE_ACTIVO' THEN crm_stage
            ELSE 'PROSPECTO'
          END,
          crm_last_contact_at = NOW(),
          crm_commercial_notes = CASE
            WHEN $4 IS NULL OR $4 = '' THEN crm_commercial_notes
            WHEN crm_commercial_notes IS NULL OR crm_commercial_notes = '' THEN $4
            ELSE crm_commercial_notes
          END
        WHERE id = $1
        RETURNING *
      `,
      [
        customerByPhone.id,
        customerName,
        deliveryAddress || null,
        notes || `Prospecto generado desde presupuesto ${budgetNumber}`,
      ]
    );
    return rows[0];
  }

  const insertRes = await client.query(
    `
      INSERT INTO customers(
        name,
        phone,
        address,
        notes,
        crm_stage,
        crm_priority,
        crm_last_contact_at,
        crm_commercial_notes
      )
      VALUES ($1, $2, $3, $4, 'PROSPECTO', 'MEDIA', NOW(), $5)
      RETURNING *
    `,
    [
      customerName,
      customerPhone,
      deliveryAddress || null,
      notes || null,
      `Prospecto generado desde presupuesto ${budgetNumber}`,
    ]
  );

  await logAudit({
    actorUserId,
    action: "CUSTOMER_PROSPECT_CREATE_FROM_BUDGET",
    entity: "customers",
    entityId: insertRes.rows[0].id,
    metadata: {
      after: insertRes.rows[0],
      budgetNumber,
    },
    client,
  });

  return insertRes.rows[0];
}

async function getLocalId(client) {
  return getLocationIdByCode(client, "LOCAL");
}

async function ensureBalance(client, productId, locationId) {
  await ensureBalanceRow(client, productId, locationId);
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

    const restored = await restoreFifoConsumptions(client, {
      refType: "sale",
      refId: saleId,
      refLineId: item.id,
      deleteAfterRestore: true,
    });
    const missingQty = Math.max(0, Number(item.qty || 0) - Number(restored.restoredQty || 0));
    if (missingQty > EPSILON_QTY) {
      const fallbackUnitCost =
        Number(item.cost_amount || 0) > 0 && Number(item.qty || 0) > 0
          ? Number(item.cost_amount || 0) / Number(item.qty || 0)
          : await getProductCost(client, item.product_id);
      await createInboundLayer(client, {
        productId: item.product_id,
        locationId: localId,
        qty: missingQty,
        unitCost: fallbackUnitCost,
        sourceType: "SALE_ANULADA_RESTORE",
        sourceId: saleId,
        sourceLineId: item.id,
        receivedAt: new Date().toISOString(),
        notes: "Restitucion por anulacion de venta",
        createdBy: actorUserId,
      });
    }
  }
}

async function getSaleTotalAmount(client, saleId) {
  const totalRes = await client.query(
    "SELECT COALESCE(SUM(line_total), 0)::numeric AS total FROM sale_items WHERE sale_id = $1",
    [saleId]
  );
  return Number(totalRes.rows[0]?.total || 0);
}

function toISODateStr(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  // already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // fallback: parse and re-format
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

async function hasApprovedConsolidatedControl(client, sale) {
  const isDelivery =
    Boolean(sale?.is_delivery) || String(sale?.sale_type || "").toUpperCase() === "ENVIO";
  const scheduledDate = toISODateStr(sale?.scheduled_date);
  const deliverySlot = String(sale?.delivery_slot || "").trim();
  if (!isDelivery || !scheduledDate || !deliverySlot) return false;

  const controlRes = await client.query(
    `
      SELECT id
      FROM delivery_consolidated_controls
      WHERE control_date = $1
        AND slot = $2
      LIMIT 1
    `,
    [scheduledDate, deliverySlot]
  );

  return Boolean(controlRes.rows[0]);
}

async function syncApprovedConsolidatedControl(client, sale) {
  const isDelivery =
    Boolean(sale?.is_delivery) || String(sale?.sale_type || "").toUpperCase() === "ENVIO";
  const scheduledDate = toISODateStr(sale?.scheduled_date);
  const deliverySlot = String(sale?.delivery_slot || "").trim();
  if (!isDelivery || !scheduledDate || !deliverySlot) {
    return { affected: false, removed: false, totalOrders: 0, totalItems: 0 };
  }

  const totalsRes = await client.query(
    `
      SELECT
        COUNT(DISTINCT s.id)::int AS total_orders,
        COALESCE(SUM(si.qty), 0)::int AS total_items
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE (s.is_delivery = true OR s.sale_type = 'ENVIO')
        AND s.scheduled_date = $1
        AND s.delivery_slot = $2
        AND s.status <> 'ANULADO'
    `,
    [scheduledDate, deliverySlot]
  );

  const totalOrders = Number(totalsRes.rows[0]?.total_orders || 0);
  const totalItems = Number(totalsRes.rows[0]?.total_items || 0);

  if (totalOrders <= 0) {
    const deleted = await client.query(
      `
        DELETE FROM delivery_consolidated_controls
        WHERE control_date = $1
          AND slot = $2
        RETURNING id
      `,
      [scheduledDate, deliverySlot]
    );
    return {
      affected: Boolean(deleted.rows[0]),
      removed: Boolean(deleted.rows[0]),
      totalOrders,
      totalItems,
    };
  }

  const updated = await client.query(
    `
      UPDATE delivery_consolidated_controls
      SET
        total_orders = $3,
        total_items = $4,
        updated_at = now()
      WHERE control_date = $1
        AND slot = $2
      RETURNING id
    `,
    [scheduledDate, deliverySlot, totalOrders, totalItems]
  );

  return {
    affected: Boolean(updated.rows[0]),
    removed: false,
    totalOrders,
    totalItems,
  };
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

    const fifoResult = await consumeFifoLayers(client, {
      productId: item.product_id,
      locationId: localId,
      qty: item.qty,
      movementReason: "SALE_COMPLETED",
      refType: "sale",
      refId: saleId,
      refLineId: item.id,
      createdBy: actorUserId,
    });
    await client.query("UPDATE sale_items SET cost_amount = $2 WHERE id = $1", [
      item.id,
      Number(fifoResult.totalCost || 0),
    ]);
  }

  return itemsRes.rows;
}

async function prepareSaleInventory(client, saleId, actorUserId) {
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
        VALUES ($1, $2, NULL, $3, 'SALE_PREPARADO', 'sale', $4, $5)
      `,
      [item.product_id, localId, item.qty, saleId, actorUserId]
    );
    const fifoResult = await consumeFifoLayers(client, {
      productId: item.product_id,
      locationId: localId,
      qty: item.qty,
      movementReason: "SALE_PREPARADO",
      refType: "sale",
      refId: saleId,
      refLineId: item.id,
      createdBy: actorUserId,
    });
    await client.query("UPDATE sale_items SET cost_amount = $2 WHERE id = $1", [
      item.id,
      Number(fifoResult.totalCost || 0),
    ]);
  }

  return itemsRes.rows;
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

module.exports = {
  ensureBudgetProspect,
  getLocalId,
  ensureBalance,
  restoreSaleInventory,
  getSaleTotalAmount,
  hasApprovedConsolidatedControl,
  syncApprovedConsolidatedControl,
  assertOpenCashRegisterForCheckout,
  registerSaleCancellationCashMovement,
  reverseCustomerCurrentAccountDebit,
  findItemsWithoutStock,
  getSaleWithItems,
  deductMostradorInventory,
  prepareSaleInventory,
  registerCustomerCurrentAccountDebit,
};
