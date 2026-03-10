const { pool } = require("../../db");
const { requirePermission } = require("../../middleware/rbac");
const { blockDuringStockControl } = require("../../middleware/stock-control");
const { asyncHandler } = require("../../utils/async-handler");
const { buildSaleNumber, proposeShift } = require("../../utils/sales");
const { logAudit } = require("../../services/audit");
const { notifyCriticalStockForProductIds } = require("../../services/telegram-alerts");
const {
  createSaleSchema,
  checkoutSaleSchema,
  cancelSaleSchema,
} = require("./schemas");
const { normalizeDeliveryCondition, canChargeSales } = require("./utils");
const {
  findItemsWithoutStock,
  assertOpenCashRegisterForCheckout,
  deductMostradorInventory,
  registerCustomerCurrentAccountDebit,
  getSaleWithItems,
  prepareSaleInventory,
  restoreSaleInventory,
  getSaleTotalAmount,
  hasApprovedConsolidatedControl,
  syncApprovedConsolidatedControl,
  registerSaleCancellationCashMovement,
  reverseCustomerCurrentAccountDebit,
} = require("./service");

function registerSalesTransactionRoutes(router) {
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
        (deliveryPayment === "COBRAR_EN_ENTREGA"
          ? "EFECTIVO"
          : deliveryPayment === "PAGO_ENTREGA_TRANSFERENCIA" || deliveryPayment === "PAGO_LOCAL_TRANSFERENCIA"
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
            transferAmount,
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

        const preparedItems = await prepareSaleInventory(client, sale.id, req.user.id);

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
        await notifyCriticalStockForProductIds(preparedItems.map((item) => item.product_id));
        res.json(updated.rows[0]);
      } catch (err) {
        await client.query("ROLLBACK");
        if (String(err?.message || "").includes("Stock insuficiente en LOCAL")) {
          return res.status(400).json({ message: err.message });
        }
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

        const approvedConsolidated = await hasApprovedConsolidatedControl(client, sale);
        const isAdmin = String(req.user?.role || "").toUpperCase() === "ADMIN";
        if (approvedConsolidated) {
          if (!isAdmin) {
            await client.query("ROLLBACK");
            return res.status(403).json({
              message:
                "No se puede anular esta venta porque pertenece a un consolidado aprobado y la mercaderia ya fue cargada en el camion. Solo ADMIN puede hacerlo.",
            });
          }
          if (!parsed.data.overrideApprovedConsolidated) {
            await client.query("ROLLBACK");
            return res.status(409).json({
              code: "APPROVED_CONSOLIDATED_OVERRIDE_REQUIRED",
              message:
                "Anular esta venta modificaria un consolidado aprobado. Si confirmas, la orden se eliminara del consolidado y los repartidores ya no deberan rendir esa mercaderia.",
            });
          }
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

        const consolidatedSync = approvedConsolidated
          ? await syncApprovedConsolidatedControl(client, { ...sale, status: "ANULADO" })
          : { affected: false, removed: false, totalOrders: 0, totalItems: 0 };

        await logAudit({
          actorUserId: req.user.id,
          action: "SALE_CANCEL",
          entity: "sales",
          entityId: req.params.id,
          metadata: {
            before: sale,
            after: updated.rows[0],
            reason: parsed.data.reason,
            approvedConsolidated,
            overrideApprovedConsolidated: Boolean(parsed.data.overrideApprovedConsolidated),
            consolidatedSync,
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
}

module.exports = registerSalesTransactionRoutes;
