const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");

const router = express.Router();

const schema = z.object({
    name: z.string().min(1),
});

router.get(
    "/",
    requirePermission("products.manage"),
    asyncHandler(async (_req, res) => {
        const { rows } = await pool.query("SELECT * FROM product_rubros ORDER BY name ASC");
        res.json(rows);
    })
);

router.post(
    "/",
    requirePermission("products.manage"),
    asyncHandler(async (req, res) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });
        const { rows } = await pool.query(
            "INSERT INTO product_rubros(name) VALUES ($1) RETURNING *",
            [parsed.data.name]
        );
        await logAudit({
            actorUserId: req.user.id,
            action: "RUBRO_CREATE",
            entity: "product_rubros",
            entityId: rows[0].id,
            metadata: { after: rows[0] },
        });
        res.status(201).json(rows[0]);
    })
);

module.exports = router;
