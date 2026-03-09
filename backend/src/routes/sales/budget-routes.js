const { pool } = require("../../db");
const { requirePermission } = require("../../middleware/rbac");
const { asyncHandler } = require("../../utils/async-handler");
const { logAudit } = require("../../services/audit");
const {
  createBudgetSchema,
  deliveryPartialPlanSchema,
} = require("./schemas");
const { closeEnoughMoney, canChargeSales } = require("./utils");
const {
  ensureBudgetProspect,
  getSaleTotalAmount,
  getSaleWithItems,
} = require("./service");

function registerSalesBudgetRoutes(router) {
  router.post(
    "/:id/delivery-payment-plan",
    requirePermission("sales.manage"),
    asyncHandler(async (req, res) => {
      if (!canChargeSales(req.user)) {
        return res.status(403).json({ message: "Solo CAJERO o ADMIN pueden registrar pagos parciales" });
      }

      const parsed = deliveryPartialPlanSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Datos invalidos" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

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
        if (String(sale.sale_type || "").toUpperCase() !== "ENVIO" && !sale.is_delivery) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Solo los envios admiten este registro" });
        }
        if (String(sale.delivery_payment || "").toUpperCase() !== "PAGO_PARCIAL") {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "La orden no esta marcada como pago parcial" });
        }
        if (
          ["ENTREGADO", "RECHAZADO", "NO_ESTABA"].includes(
            String(sale.delivery_status || "").trim().toUpperCase() || "PENDIENTE"
          )
        ) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "El envio ya no admite configurar pago parcial" });
        }

        const saleTotal = await getSaleTotalAmount(client, sale.id);
        const cashAmount = Number(parsed.data.cashAmount || 0);
        const transferAmount = Number(parsed.data.transferAmount || 0);
        if (!closeEnoughMoney(cashAmount + transferAmount, saleTotal)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `La suma del pago parcial debe coincidir con el total del pedido ($${saleTotal.toFixed(2)}).`,
          });
        }

        await client.query(
          `
            UPDATE sales
            SET
              delivery_payment_method = 'MIXTO',
              delivery_expected_cash_amount = $2,
              delivery_expected_transfer_amount = $3,
              delivery_payment_configured_at = NOW(),
              delivery_payment_configured_by = $4,
              updated_at = NOW()
            WHERE id = $1
          `,
          [sale.id, cashAmount, transferAmount, req.user.id]
        );

        await logAudit({
          actorUserId: req.user.id,
          action: "DELIVERY_PARTIAL_PAYMENT_PLAN_SET",
          entity: "sales",
          entityId: sale.id,
          metadata: {
            cashAmount,
            transferAmount,
            saleTotal,
          },
          client,
        });

        const fullSale = await getSaleWithItems(client, sale.id);
        await client.query("COMMIT");
        res.json(fullSale);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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
      const customerPhone = String(data.customerPhone || "").trim();
      if (!customerPhone) {
        return res.status(400).json({ message: "El celular es obligatorio para presupuestos" });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const resolvedCustomer = await ensureBudgetProspect({
          client,
          customerId: data.customerId || null,
          customerName,
          customerPhone,
          notes: data.notes || null,
          deliveryAddress: data.deliveryAddress || null,
          actorUserId: req.user.id,
          budgetNumber: data.budgetNumber,
        });

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
              customer_phone,
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
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING *
          `,
          [
            data.budgetNumber,
            resolvedCustomer?.id || data.customerId || null,
            customerName,
            customerPhone,
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

        await client.query(
          `
            INSERT INTO customer_crm_interactions(
              customer_id,
              interaction_type,
              summary,
              notes,
              happened_at,
              created_by
            )
            VALUES ($1, 'VENTA', $2, $3, NOW(), $4)
          `,
          [
            resolvedCustomer?.id || null,
            `Presupuesto ${data.budgetNumber}`,
            data.notes || `Prospecto generado desde presupuesto ${data.budgetNumber}`,
            req.user.id,
          ]
        );

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
}

module.exports = registerSalesBudgetRoutes;
