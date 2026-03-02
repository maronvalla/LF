const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");

const router = express.Router();

// Schema para apertura de caja
const openSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingAmount: z.number().nonnegative(),
});

// Schema para movimientos
const movementSchema = z.object({
  movementType: z.enum(["RETIRO", "PAGO_DEUDA", "PAGO_PROVEEDOR", "INGRESO", "AJUSTE"]),
  amount: z.number().positive(),
  concept: z.string().min(1).max(500),
  supplierId: z.string().uuid().nullable().optional(),
});

// Schema para cierre de caja
const closeSessionSchema = z.object({
  closingCount: z.record(z.string(), z.number().nonnegative()), // { "10": 5, "20": 3, ... }
  consolidatedIncluded: z.boolean(),
  consolidatedAmount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const loanSchema = z.object({
  counterpartyName: z.string().trim().min(2).max(160),
  direction: z.enum(["OTORGADO", "RECIBIDO"]),
  amount: z.number().positive(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const loanPaymentSchema = z.object({
  amount: z.number().positive(),
  notes: z.string().trim().max(500).optional().nullable(),
});

async function getOpenSessionForToday(client) {
  const today = new Date().toISOString().slice(0, 10);
  const sessionRes = await client.query(
    `SELECT * FROM cash_register_sessions
     WHERE date = $1 AND status = 'ABIERTA'
     ORDER BY opened_at DESC
     LIMIT 1
     FOR UPDATE`,
    [today]
  );
  return sessionRes.rows[0] || null;
}

async function loadLoansSummary(client) {
  const [loanRes, paymentRes] = await Promise.all([
    client.query(
      `SELECT *
       FROM cash_register_loans
       ORDER BY
         CASE WHEN status = 'ACTIVO' THEN 0 ELSE 1 END,
         created_at DESC`
    ),
    client.query(
      `SELECT p.*, l.counterparty_name, l.direction
       FROM cash_register_loan_payments p
       INNER JOIN cash_register_loans l ON l.id = p.loan_id
       ORDER BY p.created_at DESC
       LIMIT 50`
    ),
  ]);

  const summary = loanRes.rows.reduce(
    (acc, row) => {
      const outstanding = Number(row.outstanding_amount || 0);
      if (row.status === "ACTIVO") {
        if (row.direction === "OTORGADO") acc.meDeben += outstanding;
        if (row.direction === "RECIBIDO") acc.debo += outstanding;
      }
      return acc;
    },
    { meDeben: 0, debo: 0 }
  );

  return {
    loans: loanRes.rows,
    recentPayments: paymentRes.rows,
    summary,
  };
}

// Obtener sesión del día (o crear si no existe y se pide)
router.get(
  "/today",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const { rows: openRows } = await pool.query(
      `SELECT * FROM cash_register_sessions
       WHERE date = $1 AND status = 'ABIERTA'
       ORDER BY opened_at DESC
       LIMIT 1`,
      [today]
    );
    const { rows: latestRows } = await pool.query(
      `SELECT * FROM cash_register_sessions
       WHERE date = $1
       ORDER BY opened_at DESC
       LIMIT 1`,
      [today]
    );
    const { rows: lastConsolidatedRows } = await pool.query(
      `SELECT consolidated_amount
       FROM cash_register_sessions
       WHERE consolidated_included = true
         AND consolidated_amount IS NOT NULL
       ORDER BY COALESCE(closed_at, updated_at, created_at) DESC
       LIMIT 1`
    );
    const currentSession = openRows[0] || latestRows[0];
    const lastConsolidatedAmount = Number(lastConsolidatedRows[0]?.consolidated_amount || 0);

    if (currentSession) {
      // Obtener movimientos de la sesión
      const movRes = await pool.query(
        `SELECT m.*, s.name as supplier_name
         FROM cash_register_movements m
         LEFT JOIN suppliers s ON s.id = m.supplier_id
         WHERE m.session_id = $1
         ORDER BY m.created_at DESC`,
        [currentSession.id]
      );
      return res.json({
        session: currentSession,
        movements: movRes.rows,
        canOpen: !openRows[0],
        lastConsolidatedAmount,
      });
    }

    res.json({ session: null, movements: [], canOpen: true, lastConsolidatedAmount });
  })
);

// Obtener sesión por fecha
router.get(
  "/session/:date",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const { date } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM cash_register_sessions
       WHERE date = $1
       ORDER BY opened_at DESC
       LIMIT 1`,
      [date]
    );

    if (rows[0]) {
      const movRes = await pool.query(
        `SELECT m.*, s.name as supplier_name
         FROM cash_register_movements m
         LEFT JOIN suppliers s ON s.id = m.supplier_id
         WHERE m.session_id = $1
         ORDER BY m.created_at DESC`,
        [rows[0].id]
      );
      return res.json({ session: rows[0], movements: movRes.rows });
    }

    res.json({ session: null, movements: [] });
  })
);

// Abrir caja del día
router.post(
  "/open",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const parsed = openSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.errors });
    }

    const { date, openingAmount } = parsed.data;

    // Verificar si ya existe sesión para ese día
    const existing = await pool.query(
      "SELECT id FROM cash_register_sessions WHERE date = $1 AND status = 'ABIERTA' LIMIT 1",
      [date]
    );

    if (existing.rows[0]) {
      return res.status(400).json({ message: "Ya existe una caja abierta para este dia" });
    }

    let rows;
    try {
      const result = await pool.query(
        `INSERT INTO cash_register_sessions (date, opening_amount, opened_by, status)
         VALUES ($1, $2, $3, 'ABIERTA')
         RETURNING *`,
        [date, openingAmount, req.user.id]
      );
      rows = result.rows;
    } catch (err) {
      if (err?.code === "23505") {
        return res.status(400).json({
          message: "La base todavia no permite multiples cajas por dia. Aplica la migracion 018_cash_register_multiple_sessions_per_day.sql",
        });
      }
      throw err;
    }

    await logAudit({
      actorUserId: req.user.id,
      action: "CASH_REGISTER_OPEN",
      entity: "cash_register_sessions",
      entityId: rows[0].id,
      metadata: { openingAmount, date },
    });

    res.status(201).json({ session: rows[0], movements: [] });
  })
);

// Agregar movimiento a la caja
router.post(
  "/movement",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const parsed = movementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.errors });
    }

    const { movementType, amount, concept, supplierId } = parsed.data;
    const today = new Date().toISOString().slice(0, 10);

    // Obtener sesión del día
    const sessionRes = await pool.query(
      `SELECT * FROM cash_register_sessions
       WHERE date = $1 AND status = 'ABIERTA'
       ORDER BY opened_at DESC
       LIMIT 1`,
      [today]
    );

    if (!sessionRes.rows[0]) {
      return res.status(400).json({ message: "No hay caja abierta para hoy" });
    }

    const session = sessionRes.rows[0];

    const { rows } = await pool.query(
      `INSERT INTO cash_register_movements (session_id, movement_type, amount, concept, supplier_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [session.id, movementType, amount, concept, supplierId || null, req.user.id]
    );

    await logAudit({
      actorUserId: req.user.id,
      action: "CASH_REGISTER_MOVEMENT",
      entity: "cash_register_movements",
      entityId: rows[0].id,
      metadata: { movementType, amount, concept },
    });

    res.status(201).json(rows[0]);
  })
);

// Eliminar movimiento
router.delete(
  "/movement/:id",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const movRes = await pool.query(
      "SELECT m.*, s.status FROM cash_register_movements m JOIN cash_register_sessions s ON s.id = m.session_id WHERE m.id = $1",
      [id]
    );

    if (!movRes.rows[0]) {
      return res.status(404).json({ message: "Movimiento no encontrado" });
    }

    if (movRes.rows[0].status !== "ABIERTA") {
      return res.status(400).json({ message: "No se puede eliminar movimiento de una caja cerrada" });
    }

    const linkedLoanPayment = await pool.query(
      "SELECT id FROM cash_register_loan_payments WHERE movement_id = $1 LIMIT 1",
      [id]
    );
    if (linkedLoanPayment.rows[0]) {
      return res.status(400).json({ message: "El movimiento pertenece a un prestamo o devolucion y no se puede borrar desde caja" });
    }

    await pool.query("DELETE FROM cash_register_movements WHERE id = $1", [id]);

    await logAudit({
      actorUserId: req.user.id,
      action: "CASH_REGISTER_MOVEMENT_DELETE",
      entity: "cash_register_movements",
      entityId: id,
      metadata: movRes.rows[0],
    });

    res.json({ ok: true });
  })
);

router.get(
  "/loans",
  requirePermission("sales.manage"),
  asyncHandler(async (_req, res) => {
    const data = await loadLoansSummary(pool);
    res.json(data);
  })
);

router.post(
  "/loans",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const parsed = loanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.errors });
    }

    const { counterpartyName, direction, amount, notes } = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const session = await getOpenSessionForToday(client);
      if (!session) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "No hay caja abierta para hoy" });
      }

      const loanRes = await client.query(
        `INSERT INTO cash_register_loans (
          counterparty_name, direction, original_amount, outstanding_amount, notes, created_by
        )
         VALUES ($1, $2, $3, $3, $4, $5)
         RETURNING *`,
        [counterpartyName, direction, amount, notes || null, req.user.id]
      );
      const loan = loanRes.rows[0];

      const movementType = direction === "OTORGADO" ? "RETIRO" : "INGRESO";
      const movementConcept = `${direction === "OTORGADO" ? "PRESTAMO OTORGADO" : "PRESTAMO RECIBIDO"} - ${counterpartyName}`;
      const movementRes = await client.query(
        `INSERT INTO cash_register_movements (session_id, movement_type, amount, concept, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [session.id, movementType, amount, movementConcept, req.user.id]
      );

      await client.query(
        `INSERT INTO cash_register_loan_payments (loan_id, session_id, movement_id, amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          loan.id,
          session.id,
          movementRes.rows[0].id,
          amount,
          direction === "OTORGADO" ? "Prestamo entregado" : "Prestamo recibido",
          req.user.id,
        ]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "CASH_LOAN_CREATE",
        entity: "cash_register_loans",
        entityId: loan.id,
        metadata: { counterpartyName, direction, amount },
        client,
      });

      await client.query("COMMIT");
      res.status(201).json({ loan });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/loans/:id/payment",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const parsed = loanPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.errors });
    }

    const { amount, notes } = parsed.data;
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const session = await getOpenSessionForToday(client);
      if (!session) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "No hay caja abierta para hoy" });
      }

      const loanRes = await client.query(
        `SELECT *
         FROM cash_register_loans
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      const loan = loanRes.rows[0];
      if (!loan) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Prestamo no encontrado" });
      }
      if (loan.status !== "ACTIVO") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El prestamo ya esta saldado" });
      }

      const outstanding = Number(loan.outstanding_amount || 0);
      if (amount > outstanding) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El importe supera el saldo pendiente" });
      }

      const movementType = loan.direction === "OTORGADO" ? "INGRESO" : "RETIRO";
      const movementConcept = `${loan.direction === "OTORGADO" ? "COBRO DE PRESTAMO" : "PAGO DE PRESTAMO"} - ${loan.counterparty_name}`;
      const movementRes = await client.query(
        `INSERT INTO cash_register_movements (session_id, movement_type, amount, concept, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [session.id, movementType, amount, movementConcept, req.user.id]
      );

      const paymentRes = await client.query(
        `INSERT INTO cash_register_loan_payments (loan_id, session_id, movement_id, amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [loan.id, session.id, movementRes.rows[0].id, amount, notes || null, req.user.id]
      );

      const nextOutstanding = Math.max(0, outstanding - Number(amount));
      const updatedLoanRes = await client.query(
        `UPDATE cash_register_loans
         SET outstanding_amount = $2,
             status = $3,
             settled_at = CASE WHEN $3 = 'SALDADO' THEN now() ELSE settled_at END,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [loan.id, nextOutstanding, nextOutstanding === 0 ? "SALDADO" : "ACTIVO"]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "CASH_LOAN_PAYMENT",
        entity: "cash_register_loans",
        entityId: loan.id,
        metadata: { amount, notes: notes || null, direction: loan.direction },
        client,
      });

      await client.query("COMMIT");
      res.json({ loan: updatedLoanRes.rows[0], payment: paymentRes.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

// Obtener ventas en efectivo del día
router.get(
  "/cash-sales/:date",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const { date } = req.params;

    // Sumar cobranzas en efectivo y estimar capital/utilidad (aprox. para mixto).
    const { rows } = await pool.query(
      `SELECT
        COALESCE(SUM(
          CASE
            WHEN s.payment_method = 'EFECTIVO' THEN si.line_total
            WHEN s.payment_method = 'MIXTO' THEN si.line_total * 0.5
            ELSE 0
          END
        ), 0)::numeric as cash_total,
        COALESCE(SUM(
          CASE
            WHEN s.payment_method = 'EFECTIVO' THEN (COALESCE(p.cost, 0) * si.qty)
            WHEN s.payment_method = 'MIXTO' THEN (COALESCE(p.cost, 0) * si.qty) * 0.5
            ELSE 0
          END
        ), 0)::numeric as recovered_capital
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN products p ON p.id = si.product_id
       WHERE DATE(s.created_at) = $1
       AND s.status != 'ANULADO'
       AND s.sale_type = 'MOSTRADOR'
       AND s.payment_method IN ('EFECTIVO', 'MIXTO')`,
      [date]
    );

    const gross = Number(rows[0]?.cash_total || 0);
    const recoveredCapital = Number(rows[0]?.recovered_capital || 0);
    const estimatedProfit = gross - recoveredCapital;

    res.json({ cashSales: gross, recoveredCapital, estimatedProfit });
  })
);

// Cerrar caja del día
router.post(
  "/close",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const parsed = closeSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.errors });
    }

    const { closingCount, consolidatedIncluded, consolidatedAmount, notes } = parsed.data;
    const today = new Date().toISOString().slice(0, 10);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Obtener sesión abierta
      const sessionRes = await client.query(
        `SELECT * FROM cash_register_sessions
         WHERE date = $1 AND status = 'ABIERTA'
         ORDER BY opened_at DESC
         LIMIT 1
         FOR UPDATE`,
        [today]
      );

      if (!sessionRes.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "No hay caja abierta para hoy" });
      }

      const session = sessionRes.rows[0];

      // Calcular total del conteo de billetes
      const closingTotal = Object.entries(closingCount).reduce((sum, [denom, qty]) => {
        return sum + (Number(denom) * Number(qty));
      }, 0);

      // Obtener movimientos (retiros, pagos)
      const movRes = await client.query(
        "SELECT movement_type, SUM(amount) as total FROM cash_register_movements WHERE session_id = $1 GROUP BY movement_type",
        [session.id]
      );

      const movByType = {};
      for (const m of movRes.rows) {
        movByType[m.movement_type] = Number(m.total || 0);
      }

      const retiros = (movByType["RETIRO"] || 0) + (movByType["PAGO_DEUDA"] || 0) + (movByType["PAGO_PROVEEDOR"] || 0);
      const ingresos = movByType["INGRESO"] || 0;

      // Obtener ventas en efectivo del día
      const cashSalesRes = await client.query(
        `SELECT
          COALESCE(SUM(
            CASE
              WHEN s.payment_method = 'EFECTIVO' THEN si.line_total
              WHEN s.payment_method = 'MIXTO' THEN si.line_total * 0.5
              ELSE 0
            END
          ), 0)::numeric as cash_total,
          COALESCE(SUM(
            CASE
              WHEN s.payment_method = 'EFECTIVO' THEN (COALESCE(p.cost, 0) * si.qty)
              WHEN s.payment_method = 'MIXTO' THEN (COALESCE(p.cost, 0) * si.qty) * 0.5
              ELSE 0
            END
          ), 0)::numeric as recovered_capital
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         JOIN products p ON p.id = si.product_id
         WHERE DATE(s.created_at) = $1
         AND s.status != 'ANULADO'
         AND s.sale_type = 'MOSTRADOR'
         AND s.payment_method IN ('EFECTIVO', 'MIXTO')`,
        [today]
      );

      const cashSales = Number(cashSalesRes.rows[0]?.cash_total || 0);
      const recoveredCapital = Number(cashSalesRes.rows[0]?.recovered_capital || 0);
      const estimatedProfit = cashSales - recoveredCapital;
      const consolidado = consolidatedIncluded ? Number(consolidatedAmount || 0) : 0;

      // Cálculo: Saldo inicial - Retiros + Consolidado + Cobranzas en efectivo + Ingresos
      const expectedAmount = Number(session.opening_amount) - retiros + consolidado + cashSales + ingresos;
      const difference = closingTotal - expectedAmount;

      // Actualizar sesión
      const updated = await client.query(
        `UPDATE cash_register_sessions SET
          closing_count_json = $1,
          closing_total = $2,
          consolidated_amount = $3,
          consolidated_included = $4,
          cash_sales_amount = $5,
          expected_amount = $6,
          difference = $7,
          status = 'CERRADA',
          closed_by = $8,
          closed_at = NOW(),
          notes = $9,
          updated_at = NOW()
         WHERE id = $10
         RETURNING *`,
        [
          JSON.stringify(closingCount),
          closingTotal,
          consolidado,
          consolidatedIncluded,
          cashSales,
          expectedAmount,
          difference,
          req.user.id,
          notes || null,
          session.id
        ]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "CASH_REGISTER_CLOSE",
        entity: "cash_register_sessions",
        entityId: session.id,
        metadata: {
          closingTotal,
          expectedAmount,
          difference,
          consolidatedIncluded,
          consolidatedAmount: consolidado,
        },
        client,
      });

      await client.query("COMMIT");

      res.json({
        session: updated.rows[0],
        summary: {
          openingAmount: Number(session.opening_amount),
          retiros,
          ingresos,
          consolidado,
          cashSales,
          recoveredCapital,
          estimatedProfit,
          expectedAmount,
          closingTotal,
          difference,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// Historial de cajas
router.get(
  "/history",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT cs.*,
              ou.full_name as opened_by_name,
              cu.full_name as closed_by_name
       FROM cash_register_sessions cs
       LEFT JOIN users ou ON ou.id = cs.opened_by
       LEFT JOIN users cu ON cu.id = cs.closed_by
       ORDER BY cs.date DESC, cs.opened_at DESC
       LIMIT 30`
    );
    res.json(rows);
  })
);

module.exports = router;

