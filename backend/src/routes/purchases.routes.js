const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { blockDuringStockControl } = require("../middleware/stock-control");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");
const { notifyCriticalStockForProductIds } = require("../services/telegram-alerts");

const router = express.Router();

const createPurchaseSchema = z.object({
    invoiceNumber: z.string().optional().nullable(),
    supplierId: z.string().uuid().optional().nullable(),
    date: z.string().datetime().or(z.string().date()).optional(),
    paymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "OTRO", "CUENTA_CORRIENTE"]).optional(),
    location: z.enum(["GALPON", "LOCAL"]).optional().default("GALPON"),
    notes: z.string().optional().nullable(),
    category: z.string().optional().default('MERCADERIA'),
    updateCost: z.boolean().optional().default(true),
    updateCashbox: z.boolean().optional().default(false),
    receiptImageDataUrl: z.string().max(10_000_000).optional().nullable(),
    receiptImageName: z.string().max(255).optional().nullable(),
    items: z.array(
        z.object({
            productId: z.string().uuid(),
            qty: z.number().int().positive(),
            unitCost: z.number().nonnegative().optional().default(0),
        })
    ).min(1),
});

const attachReceiptSchema = z.object({
    receiptImageDataUrl: z.string().max(10_000_000),
    receiptImageName: z.string().max(255).optional().nullable(),
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

router.get(
    "/history",
    requirePermission("purchases.manage"),
    asyncHandler(async (_req, res) => {
        const { rows } = await pool.query(
            `
            SELECT
                p.*,
                COALESCE(s.name, 'SIN PROVEEDOR') AS supplier_name,
                COALESCE(l.code, 'GALPON') AS location_code,
                COALESCE(SUM(pi.line_total), 0) AS total_amount,
                COALESCE(SUM(pi.qty), 0) AS total_items
            FROM purchases p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            LEFT JOIN locations l ON l.id = p.location_id
            LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
            GROUP BY p.id, s.name, l.code
            ORDER BY p.purchase_date DESC, p.created_at DESC
        `
        );
        res.json(rows);
    })
);

router.post(
    "/",
    requirePermission("purchases.manage"),
    blockDuringStockControl,
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

            if (data.receiptImageDataUrl || data.receiptImageName) {
                await client.query(
                    `
                    UPDATE purchases
                    SET receipt_image_data_url = $1, receipt_image_name = $2, updated_at = now()
                    WHERE id = $3
                `,
                    [data.receiptImageDataUrl || null, data.receiptImageName || null, purchase.rows[0].id]
                );
                purchase.rows[0].receipt_image_data_url = data.receiptImageDataUrl || null;
                purchase.rows[0].receipt_image_name = data.receiptImageName || null;
            }

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
                        `UPDATE products SET cost = $1 WHERE id = $2`,
                        [item.unitCost, item.productId]
                    );
                }
            }

            // Record cashbox movement if requested
            if (data.paymentMethod === "CUENTA_CORRIENTE") {
                if (!data.supplierId) {
                    throw new Error("La cuenta corriente requiere un proveedor registrado");
                }
                const supplierRes = await client.query(
                    "SELECT id, name, enable_current_account FROM suppliers WHERE id = $1 LIMIT 1",
                    [data.supplierId]
                );
                const supplier = supplierRes.rows[0];
                if (!supplier) {
                    throw new Error("Proveedor no encontrado para cuenta corriente");
                }
                if (!supplier.enable_current_account) {
                    throw new Error("El proveedor no tiene cuenta corriente habilitada");
                }
                await client.query(
                    `
                    INSERT INTO supplier_current_account_entries(
                        supplier_id,
                        purchase_id,
                        entry_type,
                        amount,
                        payment_method,
                        description,
                        created_by
                    )
                    VALUES ($1, $2, 'DEBITO', $3, 'CUENTA_CORRIENTE', $4, $5)
                `,
                    [
                        data.supplierId,
                        purchase.rows[0].id,
                        totalAmount,
                        `Compra ${data.invoiceNumber || purchase.rows[0].id}`,
                        req.user.id,
                    ]
                );
            }

            if (data.updateCashbox && data.paymentMethod !== "CUENTA_CORRIENTE") {
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
            await notifyCriticalStockForProductIds(data.items.map((item) => item.productId));
            res.status(201).json(purchase.rows[0]);
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    })
);

router.patch(
    "/:id/receipt",
    requirePermission("purchases.manage"),
    asyncHandler(async (req, res) => {
        const purchaseId = String(req.params.id || "");
        if (!z.string().uuid().safeParse(purchaseId).success) {
            return res.status(400).json({ message: "Compra invalida" });
        }

        const parsed = attachReceiptSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: "Datos invalidos",
                errors: parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
            });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const purchaseResult = await client.query(
                "SELECT * FROM purchases WHERE id = $1 LIMIT 1",
                [purchaseId]
            );
            const purchase = purchaseResult.rows[0];
            if (!purchase) {
                await client.query("ROLLBACK");
                return res.status(404).json({ message: "Compra no encontrada" });
            }
            if (purchase.receipt_image_data_url) {
                await client.query("ROLLBACK");
                return res.status(409).json({ message: "La compra ya tiene una boleta asociada" });
            }

            const updated = await client.query(
                `
                UPDATE purchases
                SET receipt_image_data_url = $1,
                    receipt_image_name = $2,
                    updated_at = now()
                WHERE id = $3
                RETURNING *
            `,
                [parsed.data.receiptImageDataUrl, parsed.data.receiptImageName || null, purchaseId]
            );

            await logAudit({
                actorUserId: req.user.id,
                action: "PURCHASE_RECEIPT_ATTACH",
                entity: "purchases",
                entityId: purchaseId,
                metadata: {
                    before: {
                        receiptImageName: purchase.receipt_image_name || null,
                        hasReceipt: Boolean(purchase.receipt_image_data_url),
                    },
                    after: {
                        receiptImageName: updated.rows[0].receipt_image_name || null,
                        hasReceipt: Boolean(updated.rows[0].receipt_image_data_url),
                    },
                },
                client,
            });

            await client.query("COMMIT");
            res.json(updated.rows[0]);
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    })
);

module.exports = router;
