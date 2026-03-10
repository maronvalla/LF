const { pool } = require("../../db");
const { requirePermission } = require("../../middleware/rbac");
const { blockDuringStockControl } = require("../../middleware/stock-control");
const { asyncHandler } = require("../../utils/async-handler");
const { logAudit } = require("../../services/audit");
const {
  consumeFifoLayers,
  createInboundLayer,
  getProductCost,
} = require("../../services/inventory-fifo");
const { saleReturnSchema } = require("./schemas");
const { canChargeSales, closeEnoughMoney } = require("./utils");
const { ensureBalance, getLocalId } = require("./service");

function buildSaleReturnNumber() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `DEV-${datePart}-${rand}`;
}

function roundMoney(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function roundQty(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 1000) / 1000;
}

function makeHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isDeliverySale(sale) {
  return Boolean(sale?.is_delivery) || String(sale?.sale_type || "").toUpperCase() === "ENVIO";
}

function getSaleReturnBlockedReason(sale) {
  if (!sale) return "Venta no encontrada";
  if (String(sale.status || "").toUpperCase() === "ANULADO") {
    return "No se pueden gestionar devoluciones sobre una venta anulada.";
  }
  if (isDeliverySale(sale) && String(sale.delivery_status || "").toUpperCase() !== "ENTREGADO") {
    return "Solo se pueden gestionar devoluciones de envios ya entregados.";
  }
  if (!isDeliverySale(sale) && !String(sale.payment_method || "").trim()) {
    return "La venta todavia no fue cobrada.";
  }
  return "";
}

function getCashierReturnWindowBlockedReason(sale, user) {
  const role = String(user?.role || "").toUpperCase();
  if (role !== "CAJERO") return "";
  const createdAt = new Date(sale?.created_at || "");
  if (Number.isNaN(createdAt.getTime())) return "";
  const diffMs = Date.now() - createdAt.getTime();
  const limitMs = 7 * 24 * 60 * 60 * 1000;
  if (diffMs > limitMs) {
    return "El cajero solo puede gestionar devoluciones dentro de los 7 dias posteriores a la venta.";
  }
  return "";
}

async function loadReturnableSale(client, saleId, { forUpdate = false } = {}) {
  const lockSql = forUpdate ? "FOR UPDATE" : "";
  const saleRes = await client.query(
    `
      SELECT
        s.*,
        COALESCE(c.name, s.customer_name_snapshot, 'CONSUMIDOR FINAL') AS customer_name,
        COALESCE(total.total_amount, 0)::numeric AS total_amount
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(si.line_total), 0) AS total_amount
        FROM sale_items si
        WHERE si.sale_id = s.id
      ) total ON true
      WHERE s.id = $1
      LIMIT 1
      ${lockSql}
    `,
    [saleId]
  );
  return saleRes.rows[0] || null;
}

async function loadSaleItemsWithReturns(client, saleId) {
  const itemsRes = await client.query(
    `
      SELECT
        si.id AS sale_item_id,
        si.product_id,
        si.qty AS sold_qty,
        si.unit_price,
        si.line_total,
        si.cost_amount,
        p.name AS product_name,
        COALESCE(p.sku, p.id::text) AS product_sku,
        p.unit_label,
        COALESCE(ret.returned_qty, 0)::numeric AS returned_qty
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(sri.qty), 0) AS returned_qty
        FROM sale_return_items sri
        INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
        WHERE sri.sale_item_id = si.id
      ) ret ON true
      WHERE si.sale_id = $1
      ORDER BY si.id ASC
    `,
    [saleId]
  );

  return itemsRes.rows.map((row) => ({
    ...row,
    sold_qty: roundQty(row.sold_qty),
    returned_qty: roundQty(row.returned_qty),
    available_qty: Math.max(0, roundQty(Number(row.sold_qty || 0) - Number(row.returned_qty || 0))),
    unit_price: roundMoney(row.unit_price),
    line_total: roundMoney(row.line_total),
    cost_amount: roundMoney(row.cost_amount),
  }));
}

async function loadPreviousReturns(client, saleId) {
  const previousRes = await client.query(
    `
      SELECT
        sr.id,
        sr.return_number,
        sr.created_at,
        sr.reason,
        sr.return_credit_amount,
        sr.replacement_total_amount,
        sr.difference_amount,
        sr.receipt_photo_base64,
        sr.receipt_photo_mime_type,
        COALESCE(u.full_name, u.username, 'N/A') AS created_by_name
      FROM sale_returns sr
      LEFT JOIN users u ON u.id = sr.created_by
      WHERE sr.sale_id = $1
      ORDER BY sr.created_at DESC
      LIMIT 30
    `,
    [saleId]
  );

  return previousRes.rows.map((row) => ({
    ...row,
    return_credit_amount: roundMoney(row.return_credit_amount),
    replacement_total_amount: roundMoney(row.replacement_total_amount),
    difference_amount: roundMoney(row.difference_amount),
    receiptPhotoUrl: row.receipt_photo_base64
      ? `data:${String(row.receipt_photo_mime_type || "image/jpeg")};base64,${row.receipt_photo_base64}`
      : "",
  }));
}

function assertCanManageReturns(user, sale) {
  if (!canChargeSales(user)) {
    throw makeHttpError(403, "Solo CAJERO o ADMIN pueden gestionar devoluciones.");
  }

  const blockedReason = getSaleReturnBlockedReason(sale);
  if (blockedReason) {
    throw makeHttpError(400, blockedReason);
  }

  const cashierBlockedReason = getCashierReturnWindowBlockedReason(sale, user);
  if (cashierBlockedReason) {
    throw makeHttpError(403, cashierBlockedReason);
  }
}

async function getOpenCashRegisterSession(client) {
  const today = new Date().toISOString().slice(0, 10);
  const sessionRes = await client.query(
    `
      SELECT *
      FROM cash_register_sessions
      WHERE date = $1
        AND status = 'ABIERTA'
      ORDER BY opened_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [today]
  );
  return sessionRes.rows[0] || null;
}

async function registerDifferenceCashMovement(client, saleReturn, actorUserId, cashAmount) {
  const normalizedAmount = roundMoney(cashAmount);
  if (normalizedAmount <= 0) return null;

  const session = await getOpenCashRegisterSession(client);
  if (!session) {
    throw makeHttpError(400, "No hay caja abierta para registrar el efectivo cobrado por la diferencia del cambio.");
  }

  const movementRes = await client.query(
    `
      INSERT INTO cash_register_movements(session_id, movement_type, amount, concept, created_by)
      VALUES ($1, 'INGRESO', $2, $3, $4)
      RETURNING *
    `,
    [
      session.id,
      normalizedAmount,
      `Diferencia cobrada por cambio ${saleReturn.return_number} de venta ${saleReturn.sale_number_snapshot || saleReturn.sale_id}`,
      actorUserId,
    ]
  );

  return movementRes.rows[0] || null;
}

function registerSalesReturnRoutes(router) {
  router.get(
    "/:id/returns/context",
    requirePermission("sales.checkout"),
    asyncHandler(async (req, res) => {
      const client = await pool.connect();
      try {
        const sale = await loadReturnableSale(client, req.params.id);
        if (!sale) {
          return res.status(404).json({ message: "Venta no encontrada" });
        }

        assertCanManageReturns(req.user, sale);

        const [items, previousReturns] = await Promise.all([
          loadSaleItemsWithReturns(client, sale.id),
          loadPreviousReturns(client, sale.id),
        ]);

        res.json({
          sale: {
            id: sale.id,
            saleNumber: sale.sale_number,
            createdAt: sale.created_at,
            customerId: sale.customer_id,
            customerName: sale.customer_name,
            totalAmount: roundMoney(sale.total_amount),
            paymentMethod: sale.payment_method,
            saleType: sale.sale_type,
            deliveryStatus: sale.delivery_status,
          },
          requiresReceiptPhoto: String(req.user?.role || "").toUpperCase() === "CAJERO",
          items,
          previousReturns,
        });
      } finally {
        client.release();
      }
    })
  );

  router.post(
    "/:id/returns",
    requirePermission("sales.checkout"),
    blockDuringStockControl,
    asyncHandler(async (req, res) => {
      if (!canChargeSales(req.user)) {
        return res.status(403).json({ message: "Solo CAJERO o ADMIN pueden gestionar devoluciones." });
      }

      const parsed = saleReturnSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Datos invalidos" });
      }

      const data = parsed.data;
      const receiptBase64 = String(data.receiptPhotoBase64 || "").trim();
      const receiptMime = String(data.receiptPhotoMimeType || "").trim();
      const receiptName = String(data.receiptPhotoName || "").trim();

      if (receiptBase64 && !receiptMime) {
        return res.status(400).json({ message: "Falta el tipo de archivo de la foto del comprobante." });
      }
      if (String(req.user?.role || "").toUpperCase() === "CAJERO" && !receiptBase64) {
        return res.status(400).json({ message: "El cajero debe adjuntar una foto del comprobante original para registrar la devolucion." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const sale = await loadReturnableSale(client, req.params.id, { forUpdate: true });
        if (!sale) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Venta no encontrada" });
        }

        assertCanManageReturns(req.user, sale);

        const saleItems = await loadSaleItemsWithReturns(client, sale.id);
        const saleItemById = new Map(saleItems.map((item) => [String(item.sale_item_id), item]));

        const requestedReturns = new Map();
        for (const item of data.returnedItems) {
          const saleItemId = String(item.saleItemId || "");
          const qty = roundQty(item.qty);
          if (!saleItemId || qty <= 0) continue;
          requestedReturns.set(saleItemId, roundQty((requestedReturns.get(saleItemId) || 0) + qty));
        }

        if (!requestedReturns.size) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Debes seleccionar al menos un articulo a devolver." });
        }

        let returnCreditAmount = 0;
        const normalizedReturnItems = [];
        const returnedQtyByProduct = new Map();

        for (const [saleItemId, qty] of requestedReturns.entries()) {
          const originalItem = saleItemById.get(saleItemId);
          if (!originalItem) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Hay articulos devueltos que no pertenecen a la venta original." });
          }
          if (qty > Number(originalItem.available_qty || 0) + 0.0001) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: `No puedes devolver mas de ${Number(originalItem.available_qty || 0).toFixed(3)} de ${originalItem.product_name}.`,
            });
          }

          const unitPrice = roundMoney(originalItem.unit_price);
          const lineTotal = roundMoney(qty * unitPrice);
          const unitCost =
            Number(originalItem.cost_amount || 0) > 0 && Number(originalItem.sold_qty || 0) > 0
              ? roundMoney(Number(originalItem.cost_amount || 0) / Number(originalItem.sold_qty || 0))
              : roundMoney(await getProductCost(client, originalItem.product_id));
          const totalCost = roundMoney(unitCost * qty);

          returnCreditAmount += lineTotal;
          returnedQtyByProduct.set(
            String(originalItem.product_id),
            roundQty((returnedQtyByProduct.get(String(originalItem.product_id)) || 0) + qty)
          );
          normalizedReturnItems.push({
            saleItemId,
            productId: originalItem.product_id,
            productName: originalItem.product_name,
            qty,
            unitPrice,
            lineTotal,
            unitCost,
            totalCost,
          });
        }

        const replacementItemsInput = Array.isArray(data.replacementItems) ? data.replacementItems : [];
        if (!replacementItemsInput.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Debes seleccionar al menos un articulo de reemplazo." });
        }

        const normalizedReplacementItems = [];
        const replacementQtyByProduct = new Map();
        let replacementTotalAmount = 0;

        for (const item of replacementItemsInput) {
          const productId = String(item.productId || "");
          const qty = roundQty(item.qty);
          const unitPrice = roundMoney(item.unitPrice);
          if (!productId || qty <= 0) continue;
          const lineTotal = roundMoney(qty * unitPrice);
          replacementTotalAmount += lineTotal;
          replacementQtyByProduct.set(
            productId,
            roundQty((replacementQtyByProduct.get(productId) || 0) + qty)
          );
          normalizedReplacementItems.push({
            productId,
            qty,
            unitPrice,
            lineTotal,
          });
        }

        if (!normalizedReplacementItems.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Debes seleccionar al menos un articulo de reemplazo." });
        }

        returnCreditAmount = roundMoney(returnCreditAmount);
        replacementTotalAmount = roundMoney(replacementTotalAmount);
        if (replacementTotalAmount + 0.01 < returnCreditAmount) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: "El cambio no puede devolver dinero. El total del reemplazo debe ser igual o mayor al credito disponible.",
          });
        }

        const differenceAmount = roundMoney(Math.max(0, replacementTotalAmount - returnCreditAmount));
        const differencePayment = data.differencePayment || null;
        let differencePaymentMethod = null;
        let differenceCashAmount = 0;
        let differenceTransferAmount = 0;
        let differenceProofBase64 = "";
        let differenceProofMimeType = "";
        let differenceProofName = "";

        if (differenceAmount > 0) {
          if (!differencePayment) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Debes registrar como se cobrara la diferencia del cambio." });
          }

          differencePaymentMethod = String(differencePayment.paymentMethod || "").toUpperCase();
          differenceCashAmount = roundMoney(differencePayment.cashAmount);
          differenceTransferAmount = roundMoney(differencePayment.transferAmount);
          differenceProofBase64 = String(differencePayment.proofImageBase64 || "").trim();
          differenceProofMimeType = String(differencePayment.proofImageMimeType || "").trim();
          differenceProofName = String(differencePayment.proofImageName || "").trim();

          if (differenceProofBase64 && !differenceProofMimeType) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Falta el tipo de archivo del comprobante de la diferencia." });
          }

          if (differencePaymentMethod === "EFECTIVO") {
            if (!closeEnoughMoney(differenceCashAmount, differenceAmount)) {
              await client.query("ROLLBACK");
              return res.status(400).json({ message: "La diferencia en efectivo debe coincidir exactamente con el importe a cobrar." });
            }
            differenceTransferAmount = 0;
          } else if (differencePaymentMethod === "TRANSFERENCIA") {
            if (!closeEnoughMoney(differenceTransferAmount, differenceAmount)) {
              await client.query("ROLLBACK");
              return res.status(400).json({ message: "La diferencia por transferencia debe coincidir exactamente con el importe a cobrar." });
            }
            differenceCashAmount = 0;
          } else if (differencePaymentMethod === "MIXTO") {
            if (!closeEnoughMoney(differenceCashAmount + differenceTransferAmount, differenceAmount)) {
              await client.query("ROLLBACK");
              return res.status(400).json({ message: "La suma de efectivo y transferencia debe coincidir con la diferencia a cobrar." });
            }
          } else {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Metodo de cobro invalido para la diferencia." });
          }
        }

        const localId = await getLocalId(client);
        const returnNumber = buildSaleReturnNumber();
        const saleReturnRes = await client.query(
          `
            INSERT INTO sale_returns(
              return_number,
              sale_id,
              customer_id,
              sale_number_snapshot,
              customer_name_snapshot,
              reason,
              receipt_photo_base64,
              receipt_photo_mime_type,
              receipt_photo_name,
              return_credit_amount,
              replacement_total_amount,
              difference_amount,
              difference_payment_method,
              difference_cash_amount,
              difference_transfer_amount,
              difference_proof_base64,
              difference_proof_mime_type,
              difference_proof_name,
              created_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,
              $10,$11,$12,$13,$14,$15,$16,$17,$18,$19
            )
            RETURNING *
          `,
          [
            returnNumber,
            sale.id,
            sale.customer_id || null,
            sale.sale_number || null,
            sale.customer_name || null,
            data.reason,
            receiptBase64 || null,
            receiptMime || null,
            receiptName || null,
            returnCreditAmount,
            replacementTotalAmount,
            differenceAmount,
            differencePaymentMethod || null,
            differenceCashAmount,
            differenceTransferAmount,
            differenceProofBase64 || null,
            differenceProofMimeType || null,
            differenceProofName || null,
            req.user.id,
          ]
        );
        const saleReturn = saleReturnRes.rows[0];

        for (const item of normalizedReturnItems) {
          const returnItemRes = await client.query(
            `
              INSERT INTO sale_return_items(
                sale_return_id,
                sale_item_id,
                product_id,
                qty,
                unit_price,
                line_total,
                unit_cost,
                total_cost
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              RETURNING *
            `,
            [
              saleReturn.id,
              item.saleItemId,
              item.productId,
              item.qty,
              item.unitPrice,
              item.lineTotal,
              item.unitCost,
              item.totalCost,
            ]
          );

          await ensureBalance(client, item.productId, localId);
          await client.query(
            `
              UPDATE inventory_balances
              SET quantity = quantity + $1, updated_at = now()
              WHERE product_id = $2
                AND location_id = $3
            `,
            [item.qty, item.productId, localId]
          );
          await client.query(
            `
              INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason, ref_type, ref_id, created_by)
              VALUES ($1, NULL, $2, $3, 'SALE_RETURN_IN', 'sale_return', $4, $5)
            `,
            [item.productId, localId, item.qty, saleReturn.id, req.user.id]
          );
          await createInboundLayer(client, {
            productId: item.productId,
            locationId: localId,
            qty: item.qty,
            unitCost: item.unitCost,
            sourceType: "SALE_RETURN_IN",
            sourceId: saleReturn.id,
            sourceLineId: returnItemRes.rows[0].id,
            receivedAt: new Date().toISOString(),
            notes: `Ingreso por devolucion de venta ${sale.sale_number || sale.id}`,
            createdBy: req.user.id,
          });
        }

        const replacementProductIds = Array.from(new Set(normalizedReplacementItems.map((item) => item.productId)));
        const productsRes = await client.query(
          `
            SELECT id, name, sku
            FROM products
            WHERE id = ANY($1::uuid[])
          `,
          [replacementProductIds]
        );
        const productById = new Map(productsRes.rows.map((row) => [String(row.id), row]));

        for (const item of normalizedReplacementItems) {
          const product = productById.get(String(item.productId));
          if (!product) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Hay articulos de reemplazo que ya no existen." });
          }

          await ensureBalance(client, item.productId, localId);
          const balanceRes = await client.query(
            `
              UPDATE inventory_balances
              SET quantity = quantity - $1, updated_at = now()
              WHERE product_id = $2
                AND location_id = $3
                AND quantity >= $1
              RETURNING *
            `,
            [item.qty, item.productId, localId]
          );

          if (!balanceRes.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: `Stock insuficiente en LOCAL para ${product.name}.`,
            });
          }

          const replacementRowRes = await client.query(
            `
              INSERT INTO sale_return_replacement_items(
                sale_return_id,
                product_id,
                qty,
                unit_price,
                line_total,
                total_cost
              )
              VALUES ($1,$2,$3,$4,$5,0)
              RETURNING *
            `,
            [saleReturn.id, item.productId, item.qty, item.unitPrice, item.lineTotal]
          );

          await client.query(
            `
              INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason, ref_type, ref_id, created_by)
              VALUES ($1, $2, NULL, $3, 'SALE_RETURN_REPLACEMENT', 'sale_return', $4, $5)
            `,
            [item.productId, localId, item.qty, saleReturn.id, req.user.id]
          );

          const fifoResult = await consumeFifoLayers(client, {
            productId: item.productId,
            locationId: localId,
            qty: item.qty,
            movementReason: "SALE_RETURN_REPLACEMENT",
            refType: "sale_return",
            refId: saleReturn.id,
            refLineId: replacementRowRes.rows[0].id,
            createdBy: req.user.id,
          });

          await client.query(
            `
              UPDATE sale_return_replacement_items
              SET total_cost = $2
              WHERE id = $1
            `,
            [replacementRowRes.rows[0].id, roundMoney(fifoResult.totalCost)]
          );
        }

        const cashMovement = await registerDifferenceCashMovement(
          client,
          saleReturn,
          req.user.id,
          differenceCashAmount
        );

        if (cashMovement?.id) {
          await client.query(
            `
              UPDATE sale_returns
              SET cash_movement_id = $2, updated_at = now()
              WHERE id = $1
            `,
            [saleReturn.id, cashMovement.id]
          );
        }

        await logAudit({
          actorUserId: req.user.id,
          action: "SALE_RETURN_CREATE",
          entity: "sale_returns",
          entityId: saleReturn.id,
          metadata: {
            saleId: sale.id,
            saleNumber: sale.sale_number,
            returnNumber,
            returnCreditAmount,
            replacementTotalAmount,
            differenceAmount,
            differencePaymentMethod,
            returnedItems: normalizedReturnItems,
            replacementItems: normalizedReplacementItems,
            cashMovementId: cashMovement?.id || null,
          },
          client,
        });

        await client.query("COMMIT");
        res.status(201).json({
          id: saleReturn.id,
          returnNumber,
          saleId: sale.id,
          returnCreditAmount,
          replacementTotalAmount,
          differenceAmount,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    })
  );
}

module.exports = registerSalesReturnRoutes;
