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

// Obtener sesión del día (o crear si no existe y se pide)
router.get(
  "/today",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      "SELECT * FROM cash_register_sessions WHERE date = $1",
      [today]
    );

    if (rows[0]) {
      // Obtener movimientos de la sesión
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

// Obtener sesión por fecha
router.get(
  "/session/:date",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const { date } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM cash_register_sessions WHERE date = $1",
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
      "SELECT id FROM cash_register_sessions WHERE date = $1",
      [date]
    );

    if (existing.rows[0]) {
      return res.status(400).json({ message: "Ya existe una caja abierta para este dia" });
    }

    const { rows } = await pool.query(
      `INSERT INTO cash_register_sessions (date, opening_amount, opened_by, status)
       VALUES ($1, $2, $3, 'ABIERTA')
       RETURNING *`,
      [date, openingAmount, req.user.id]
    );

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
      "SELECT * FROM cash_register_sessions WHERE date = $1 AND status = 'ABIERTA'",
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

// Obtener ventas en efectivo del día
router.get(
  "/cash-sales/:date",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const { date } = req.params;

    // Sumar ventas de mostrador pagadas en efectivo del día
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(
        CASE
          WHEN s.payment_method = 'EFECTIVO' THEN si.line_total
          WHEN s.payment_method = 'MIXTO' THEN si.line_total * 0.5 -- Aproximación para mixto
          ELSE 0
        END
      ), 0) as cash_total
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       WHERE DATE(s.created_at) = $1
       AND s.status != 'ANULADO'
       AND s.sale_type = 'MOSTRADOR'
       AND s.payment_method IN ('EFECTIVO', 'MIXTO')`,
      [date]
    );

    res.json({ cashSales: Number(rows[0]?.cash_total || 0) });
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
        "SELECT * FROM cash_register_sessions WHERE date = $1 AND status = 'ABIERTA' FOR UPDATE",
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
        `SELECT COALESCE(SUM(
          CASE
            WHEN s.payment_method = 'EFECTIVO' THEN si.line_total
            WHEN s.payment_method = 'MIXTO' THEN si.line_total * 0.5
            ELSE 0
          END
        ), 0) as cash_total
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         WHERE DATE(s.created_at) = $1
         AND s.status != 'ANULADO'
         AND s.sale_type = 'MOSTRADOR'
         AND s.payment_method IN ('EFECTIVO', 'MIXTO')`,
        [today]
      );

      const cashSales = Number(cashSalesRes.rows[0]?.cash_total || 0);
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
       ORDER BY cs.date DESC
       LIMIT 30`
    );
    res.json(rows);
  })
);

module.exports = router;
