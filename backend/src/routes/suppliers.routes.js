const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");

const router = express.Router();

const schema = z.object({
    name: z.string().min(2),
    phone: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    cuit: z.string().optional().nullable(),
    iva_condition: z.string().optional().nullable(),
});

router.get(
    "/",
    requirePermission("purchases.manage"),
    asyncHandler(async (_req, res) => {
        const { rows } = await pool.query("SELECT * FROM suppliers ORDER BY name ASC");
        res.json(rows);
    })
);

router.post(
    "/",
    requirePermission("purchases.manage"),
    asyncHandler(async (req, res) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });
        const d = parsed.data;
        const { rows } = await pool.query(
            `
      INSERT INTO suppliers(name, phone, address, cuit, iva_condition)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
            [d.name, d.phone || null, d.address || null, d.cuit || null, d.iva_condition || 'RESPONSABLE INSCRIPTO']
        );
        await logAudit({
            actorUserId: req.user.id,
            action: "SUPPLIER_CREATE",
            entity: "suppliers",
            entityId: rows[0].id,
            metadata: { after: rows[0] },
        });
        res.status(201).json(rows[0]);
    })
);

router.put(
    "/:id",
    requirePermission("purchases.manage"),
    asyncHandler(async (req, res) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });
        const before = await pool.query("SELECT * FROM suppliers WHERE id = $1", [req.params.id]);
        if (!before.rows[0]) return res.status(404).json({ message: "Proveedor no encontrado" });
        const d = parsed.data;
        const { rows } = await pool.query(
            `
      UPDATE suppliers
      SET name = $2, phone = $3, address = $4, cuit = $5, iva_condition = $6
      WHERE id = $1
      RETURNING *
    `,
            [req.params.id, d.name, d.phone || null, d.address || null, d.cuit || null, d.iva_condition || 'RESPONSABLE INSCRIPTO']
        );
        await logAudit({
            actorUserId: req.user.id,
            action: "SUPPLIER_UPDATE",
            entity: "suppliers",
            entityId: rows[0].id,
            metadata: { before: before.rows[0], after: rows[0] },
        });
        res.json(rows[0]);
    })
);

module.exports = router;
