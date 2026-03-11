const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");

const router = express.Router();

const paymentSchema = z.object({
  amount: z.number().positive(),
  description: z.string().trim().min(2).max(200).optional().nullable(),
  paymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "OTRO"]).optional().default("EFECTIVO"),
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

async function registerSupplierCurrentAccountCashPayment(client, { supplierName, amount, actorUserId }) {
  const session = await getOpenCashRegisterSession(client);
  if (!session) {
    throw new Error("No hay caja abierta para registrar el pago en efectivo al proveedor");
  }

  await client.query(
    `INSERT INTO cash_register_movements (session_id, movement_type, amount, concept, created_by)
     VALUES ($1, 'PAGO_PROVEEDOR', $2, $3, $4)`,
    [
      session.id,
      amount,
      `Pago cuenta corriente proveedor ${supplierName || "SIN NOMBRE"}`,
      actorUserId,
    ]
  );

  return session;
}

function computeBalance(rows, typeField = "entry_type", amountField = "amount") {
  return (rows || []).reduce((acc, row) => {
    const amount = Number(row?.[amountField] || 0);
    return String(row?.[typeField] || "").toUpperCase() === "DEBITO" ? acc + amount : acc - amount;
  }, 0);
}

router.get(
  "/summary",
  requirePermission("current-account.manage"),
  asyncHandler(async (_req, res) => {
    const [customersRes, suppliersRes] = await Promise.all([
      pool.query(
        `
          SELECT
            c.id,
            c.name,
            c.code,
            c.phone,
            c.enable_current_account,
            COALESCE(SUM(CASE WHEN e.entry_type = 'DEBITO' THEN e.amount ELSE -e.amount END), 0)::int AS balance,
            COUNT(e.id)::int AS movements
          FROM customers c
          LEFT JOIN customer_current_account_entries e ON e.customer_id = c.id
          WHERE c.enable_current_account = true
          GROUP BY c.id
          ORDER BY c.name ASC
        `
      ),
      pool.query(
        `
          SELECT
            s.id,
            s.name,
            s.cuit,
            s.phone,
            s.enable_current_account,
            COALESCE(SUM(CASE WHEN e.entry_type = 'DEBITO' THEN e.amount ELSE -e.amount END), 0)::int AS balance,
            COUNT(e.id)::int AS movements
          FROM suppliers s
          LEFT JOIN supplier_current_account_entries e ON e.supplier_id = s.id
          WHERE s.enable_current_account = true
          GROUP BY s.id
          ORDER BY s.name ASC
        `
      ),
    ]);

    res.json({
      customers: customersRes.rows,
      suppliers: suppliersRes.rows,
    });
  })
);

router.get(
  "/customers/:id",
  requirePermission("current-account.manage"),
  asyncHandler(async (req, res) => {
    const customerRes = await pool.query("SELECT * FROM customers WHERE id = $1 LIMIT 1", [req.params.id]);
    const customer = customerRes.rows[0];
    if (!customer) return res.status(404).json({ message: "Cliente no encontrado" });

    const entriesRes = await pool.query(
      `
        SELECT
          e.*,
          s.sale_number
        FROM customer_current_account_entries e
        LEFT JOIN sales s ON s.id = e.sale_id
        WHERE e.customer_id = $1
        ORDER BY e.created_at DESC, e.id DESC
      `,
      [req.params.id]
    );

    res.json({
      customer,
      balance: computeBalance(entriesRes.rows),
      entries: entriesRes.rows,
    });
  })
);

router.get(
  "/suppliers/:id",
  requirePermission("current-account.manage"),
  asyncHandler(async (req, res) => {
    const supplierRes = await pool.query("SELECT * FROM suppliers WHERE id = $1 LIMIT 1", [req.params.id]);
    const supplier = supplierRes.rows[0];
    if (!supplier) return res.status(404).json({ message: "Proveedor no encontrado" });

    const entriesRes = await pool.query(
      `
        SELECT
          e.*,
          p.purchase_number
        FROM supplier_current_account_entries e
        LEFT JOIN purchases p ON p.id = e.purchase_id
        WHERE e.supplier_id = $1
        ORDER BY e.created_at DESC, e.id DESC
      `,
      [req.params.id]
    );

    res.json({
      supplier,
      balance: computeBalance(entriesRes.rows),
      entries: entriesRes.rows,
    });
  })
);

router.post(
  "/customers/:id/payment",
  requirePermission("current-account.manage"),
  asyncHandler(async (req, res) => {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });

    const customerRes = await pool.query("SELECT * FROM customers WHERE id = $1 LIMIT 1", [req.params.id]);
    const customer = customerRes.rows[0];
    if (!customer) return res.status(404).json({ message: "Cliente no encontrado" });

    const { rows } = await pool.query(
      `
        INSERT INTO customer_current_account_entries(
          customer_id,
          entry_type,
          amount,
          payment_method,
          description,
          created_by
        )
        VALUES ($1, 'PAGO', $2, $3, $4, $5)
        RETURNING *
      `,
      [
        req.params.id,
        parsed.data.amount,
        parsed.data.paymentMethod,
        parsed.data.description || "Pago de cuenta corriente",
        req.user.id,
      ]
    );

    await logAudit({
      actorUserId: req.user.id,
      action: "CUSTOMER_CURRENT_ACCOUNT_PAYMENT",
      entity: "customer_current_account_entries",
      entityId: rows[0].id,
      metadata: { after: rows[0] },
    });

    res.status(201).json(rows[0]);
  })
);

router.post(
  "/suppliers/:id/payment",
  requirePermission("current-account.manage"),
  asyncHandler(async (req, res) => {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });

    const supplierRes = await pool.query("SELECT * FROM suppliers WHERE id = $1 LIMIT 1", [req.params.id]);
    const supplier = supplierRes.rows[0];
    if (!supplier) return res.status(404).json({ message: "Proveedor no encontrado" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `
          INSERT INTO supplier_current_account_entries(
            supplier_id,
            entry_type,
            amount,
            payment_method,
            description,
            created_by
          )
          VALUES ($1, 'PAGO', $2, $3, $4, $5)
          RETURNING *
        `,
        [
          req.params.id,
          parsed.data.amount,
          parsed.data.paymentMethod,
          parsed.data.description || "Pago a proveedor",
          req.user.id,
        ]
      );

      if (parsed.data.paymentMethod === "EFECTIVO") {
        await registerSupplierCurrentAccountCashPayment(client, {
          supplierName: supplier.name,
          amount: parsed.data.amount,
          actorUserId: req.user.id,
        });
      }

      await logAudit({
        actorUserId: req.user.id,
        action: "SUPPLIER_CURRENT_ACCOUNT_PAYMENT",
        entity: "supplier_current_account_entries",
        entityId: rows[0].id,
        metadata: { after: rows[0] },
        client,
      });

      await client.query("COMMIT");
      res.status(201).json(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
