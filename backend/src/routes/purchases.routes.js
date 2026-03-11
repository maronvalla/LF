const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { blockDuringStockControl } = require("../middleware/stock-control");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");
const { notifyCriticalStockForProductIds } = require("../services/telegram-alerts");
const {
    createInboundLayer,
    ensureBalanceRow,
} = require("../services/inventory-fifo");

const router = express.Router();

const createPurchaseSchema = z.object({
    invoiceNumber: z.string().optional().nullable(),
    supplierId: z.string().uuid().optional().nullable(),
    date: z.string().datetime().or(z.string().date()).optional(),
    paymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "OTRO", "CUENTA_CORRIENTE"]).optional(),
    location: z.enum(["GALPON", "LOCAL"]).optional().default("LOCAL"),
    notes: z.string().optional().nullable(),
    category: z.string().optional().default('MERCADERIA'),
    updateCost: z.boolean().optional().default(true),
    updateCashbox: z.boolean().optional().default(false),
    receiptImageDataUrl: z.string().max(10_000_000).optional().nullable(),
    receiptImageName: z.string().max(255).optional().nullable(),
    items: z.array(
        z.object({
            productId: z.string().uuid(),
            qty: z.number().positive(),
            unitCost: z.number().nonnegative().optional().default(0),
            salePrice: z.number().nonnegative().optional().nullable(),
        })
    ).min(1),
});

const attachReceiptSchema = z.object({
    receiptImageDataUrl: z.string().max(10_000_000),
    receiptImageName: z.string().max(255).optional().nullable(),
});

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

async function registerPurchaseCashMovement(client, { purchaseId, invoiceNumber, totalAmount, actorUserId }) {
    const session = await getOpenCashRegisterSession(client);
    if (!session) {
        throw new Error("No hay caja abierta para registrar esta compra pagada en efectivo");
    }

    await client.query(
        `INSERT INTO cash_register_movements (session_id, movement_type, amount, concept, created_by)
         VALUES ($1, 'PAGO_PROVEEDOR', $2, $3, $4)`,
        [
            session.id,
            totalAmount,
            `Compra ${invoiceNumber || purchaseId}`,
            actorUserId,
        ]
    );

    return session;
}

async function getLocationId(client, code) {
    const { rows } = await client.query("SELECT id FROM locations WHERE code = $1 LIMIT 1", [code]);
    if (!rows[0]) throw new Error(`Location ${code} no inicializada`);
    return rows[0].id;
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

                const purchaseItemRes = await client.query(
                    `
          INSERT INTO purchase_items(purchase_id, product_id, qty, unit_price, line_total)
          VALUES($1, $2, $3, $4, $5)
          RETURNING *
        `,
                    [purchase.rows[0].id, item.productId, item.qty, item.unitCost, lineTotal]
                );

                // Update inventory
                await ensureBalanceRow(client, item.productId, locationId);
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

                await createInboundLayer(client, {
                    productId: item.productId,
                    locationId,
                    qty: item.qty,
                    unitCost: item.unitCost,
                    sourceType: "PURCHASE_ENTRY",
                    sourceId: purchase.rows[0].id,
                    sourceLineId: purchaseItemRes.rows[0]?.id || null,
                    receivedAt: purchase.rows[0]?.purchase_date || null,
                    notes: `Compra ${data.invoiceNumber || purchase.rows[0].id}`,
                    createdBy: req.user.id,
                });

                // Update product cost if requested
                if (data.updateCost) {
                    await client.query(
                        `UPDATE products SET cost = $1 WHERE id = $2`,
                        [item.unitCost, item.productId]
                    );
                }

                if (item.salePrice !== undefined && item.salePrice !== null) {
                    const productRes = await client.query(
                        `SELECT price_lists, price_mayorista FROM products WHERE id = $1 LIMIT 1`,
                        [item.productId]
                    );
                    const currentProduct = productRes.rows[0] || {};
                    const currentPriceLists =
                        currentProduct.price_lists && typeof currentProduct.price_lists === "object"
                            ? currentProduct.price_lists
                            : {};
                    const nextPriceLists = {
                        ...currentPriceLists,
                        MINORISTA: Number(item.salePrice || 0),
                        MAYORISTA: Number(
                            currentPriceLists.MAYORISTA ??
                                currentProduct.price_mayorista ??
                                currentPriceLists.MINORISTA ??
                                item.salePrice ??
                                0
                        ),
                    };

                    await client.query(
                        `
                        UPDATE products
                        SET price_minorista = $1, price_lists = $2::jsonb, updated_at = now()
                        WHERE id = $3
                        `,
                        [Number(item.salePrice || 0), JSON.stringify(nextPriceLists), item.productId]
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

            if (data.paymentMethod === "EFECTIVO") {
                await registerPurchaseCashMovement(client, {
                    purchaseId: purchase.rows[0].id,
                    invoiceNumber: data.invoiceNumber || null,
                    totalAmount,
                    actorUserId: req.user.id,
                });
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
