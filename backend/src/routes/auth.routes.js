const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { pool } = require("../db");
const { authRequired } = require("../middleware/auth");
const { logAudit } = require("../services/audit");
const { asyncHandler } = require("../utils/async-handler");
const { getAllowedTabsForPermissions, getPermissionsForRole } = require("../services/roles");

const router = express.Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });

    const { username, password } = parsed.data;
    const { rows } = await pool.query(
      "SELECT id, username, password_hash, role, full_name, is_active FROM users WHERE username = $1",
      [username]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Credenciales invalidas" });
    const permissions = await getPermissionsForRole(user.role);
    const allowedTabs = getAllowedTabsForPermissions(permissions);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    });

    await logAudit({
      actorUserId: user.id,
      action: "AUTH_LOGIN",
      entity: "users",
      entityId: user.id,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        permissions,
        allowedTabs,
      },
    });
  })
);

router.post(
  "/logout",
  authRequired,
  asyncHandler(async (req, res) => {
    res.clearCookie("token");
    await logAudit({
      actorUserId: req.user.id,
      action: "AUTH_LOGOUT",
      entity: "users",
      entityId: req.user.id,
    });
    res.json({ message: "Sesion cerrada" });
  })
);

router.get(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    const permissions = await getPermissionsForRole(req.user.role);
    const allowedTabs = getAllowedTabsForPermissions(permissions);
    res.json({ user: { ...req.user, permissions, allowedTabs } });
  })
);

module.exports = router;
