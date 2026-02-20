const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");

const router = express.Router();

const createPurchaseSchema = z.object({
    invoiceNumber: z.string().optional().nullable(),
    supplierId: z.string().uuid().optional().nullable(),
    date: z.string().datetime().or(z.string().date()).optional(),
    paymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "OTRO"]).optional(),
    location: z.enum(["GALPON", "LOCAL"]).optional().default("GALPON"),
    notes: z.string().optional().nullable(),
    category: z.string().optional().default('MERCADERIA'),
    updateCost: z.boolean().optional().default(true),
    updateCashbox: z.boolean().optional().default(false),
    items: z.array(
        z.object({
            productId: z.string().uuid(),
            qty: z.number().int().positive(),
            unitCost: z.number().nonnegative().optional().default(0),
        })
    ).min(1),
});

async function getLocationId(client, code) {
    const { rows } = await client.query("SELECT id FROM locations WHERE code = $1 LIMIT 1", [code]);
    if (!rows[0]) throw new Error(`Location ${code} no inicializada`);
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

router.post(
    "/",
    requirePermission("purchases.manage"),
    asyncHandler(async (req, res) => {
        const parsed = createPurchaseSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: "Datos invalidos",
                errors: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
            });
        }
        const data = parsed.data;

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const purchaseDate = data.date || new Date().toISOString().slice(0, 10);
            const locationId = await getLocationId(client, data.location);

            const purchase = await client.query(
                `
        INSERT INTO purchases(purchase_number, supplier_id, purchase_date, payment_method, notes, category, update_cost, update_cashbox, location_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
                [
                    data.invoiceNumber || null,
                    data.supplierId || null,
                    purchaseDate,
                    data.paymentMethod || 'EFECTIVO',
                    data.notes || null,
                    data.category,
                    data.updateCost,
                    data.updateCashbox,
                    locationId,
                    req.user.id,
                ]
            );

            let totalAmount = 0;

            for (const item of data.items) {
                const lineTotal = item.qty * item.unitCost;
                totalAmount += lineTotal;

                await client.query(
                    `
          INSERT INTO purchase_items(purchase_id, product_id, qty, unit_price, line_total)
          VALUES($1, $2, $3, $4, $5)
        `,
                    [purchase.rows[0].id, item.productId, item.qty, item.unitCost, lineTotal]
                );

                // Update inventory
                await ensureBalance(client, item.productId, locationId);
                await client.query(
                    `
          UPDATE inventory_balances
          SET quantity = quantity + $1, updated_at = now()
          WHERE product_id = $2 AND location_id = $3
        `,
                    [item.qty, item.productId, locationId]
                );

                await client.query(
                    `
          INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason, ref_type, ref_id, created_by)
          VALUES ($1, NULL, $2, $3, 'PURCHASE_ENTRY', 'purchase', $4, $5)
        `,
                    [item.productId, locationId, item.qty, purchase.rows[0].id, req.user.id]
                );

                // Update product cost if requested
                if (data.updateCost) {
                    await client.query(
                        `UPDATE products SET cost = $1, updated_at = now() WHERE id = $2`,
                        [item.unitCost, item.productId]
                    );
                }
            }

            // Record cashbox movement if requested
            if (data.updateCashbox) {
                // Get general wallet for the user or a system wallet
                const { rows: wallets } = await client.query("SELECT id FROM wallets WHERE is_active = true LIMIT 1");
                if (wallets[0]) {
                    await client.query(
                        `
            INSERT INTO wallet_movements(wallet_id, amount, type, reason, ref_type, ref_id, created_by)
            VALUES ($1, $2, 'EGRESO', $3, 'purchase', $4, $5)
          `,
                        [wallets[0].id, -totalAmount, `Compra Nro ${data.invoiceNumber || 'S/N'}`, purchase.rows[0].id, req.user.id]
                    );
                }
            }

            await logAudit({
                actorUserId: req.user.id,
                action: "PURCHASE_CREATE",
                entity: "purchases",
                entityId: purchase.rows[0].id,
                metadata: { after: purchase.rows[0], items: data.items },
                client,
            });

            await client.query("COMMIT");
            res.status(201).json(purchase.rows[0]);
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    })
);

module.exports = router;
