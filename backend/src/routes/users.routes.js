const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");
const { loadRoleDefinitions, normalizeRoleKey } = require("../services/roles");

const router = express.Router();

const createUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.string().trim().min(2).max(60),
  fullName: z.string().min(2),
  isActive: z.boolean().optional().default(true),
});

const userIdSchema = z.string().uuid();
const updatePasswordSchema = z.object({
  password: z.string().min(6),
});

router.get(
  "/",
  requirePermission("users.manage"),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT id, username, role, full_name, is_active, created_at FROM users ORDER BY created_at DESC"
    );
    res.json(rows);
  })
);

router.post(
  "/",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });
    const data = parsed.data;
    const roleKey = normalizeRoleKey(data.role);
    const roles = await loadRoleDefinitions();
    if (!roles.some((role) => role.key === roleKey)) {
      return res.status(400).json({ message: "Rol invalido" });
    }
    const hash = await bcrypt.hash(data.password, 10);
    const { rows } = await pool.query(
      `
      INSERT INTO users(username, password_hash, role, full_name, is_active)
      VALUES($1, $2, $3, $4, $5)
      RETURNING id, username, role, full_name, is_active, created_at
    `,
      [data.username, hash, roleKey, data.fullName, data.isActive]
    );
    await logAudit({
      actorUserId: req.user.id,
      action: "USER_CREATE",
      entity: "users",
      entityId: rows[0].id,
      metadata: { after: rows[0] },
    });
    res.status(201).json(rows[0]);
  })
);

router.delete(
  "/:id",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const parsedId = userIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ message: "Usuario invalido" });
    }
    if (String(req.user?.id || "") === String(parsedId.data)) {
      return res.status(400).json({ message: "No puedes borrar tu propio usuario" });
    }

    const beforeRes = await pool.query(
      "SELECT id, username, role, full_name, is_active, created_at FROM users WHERE id = $1 LIMIT 1",
      [parsedId.data]
    );
    const before = beforeRes.rows[0];
    if (!before) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (!before.is_active) {
      return res.status(400).json({ message: "El usuario ya estaba borrado" });
    }

    const { rows } = await pool.query(
      `
        UPDATE users
        SET is_active = FALSE
        WHERE id = $1
        RETURNING id, username, role, full_name, is_active, created_at
      `,
      [parsedId.data]
    );

    await logAudit({
      actorUserId: req.user.id,
      action: "USER_DELETE",
      entity: "users",
      entityId: parsedId.data,
      metadata: { before, after: rows[0] },
    });

    res.json({ ok: true, user: rows[0] });
  })
);

router.put(
  "/:id/password",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const parsedId = userIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ message: "Usuario invalido" });
    }

    const parsedBody = updatePasswordSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ message: "Datos invalidos" });
    }

    const beforeRes = await pool.query(
      "SELECT id, username, role, full_name, is_active FROM users WHERE id = $1 LIMIT 1",
      [parsedId.data]
    );
    const before = beforeRes.rows[0];
    if (!before) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const nextHash = await bcrypt.hash(parsedBody.data.password, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [nextHash, parsedId.data]);

    await logAudit({
      actorUserId: req.user.id,
      action: "USER_PASSWORD_UPDATE",
      entity: "users",
      entityId: parsedId.data,
      metadata: {
        username: before.username,
        fullName: before.full_name,
        role: before.role,
        isActive: before.is_active,
      },
    });

    res.json({ ok: true });
  })
);

module.exports = router;
