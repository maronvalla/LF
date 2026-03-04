const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { pool } = require("../db");
const { authRequired } = require("../middleware/auth");
const { logAudit } = require("../services/audit");
const { asyncHandler } = require("../utils/async-handler");
const { getAllowedTabsForPermissions, getPermissionsForRole } = require("../services/roles");
const { getIO } = require("../realtime");

const router = express.Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const driverLogoutPinSchema = z.object({
  pin: z.string().trim().regex(/^\d{6}$/),
});

function generateSixDigitPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function performLogout({ req, res }) {
  res.clearCookie("token");
  await logAudit({
    actorUserId: req.user.id,
    action: "AUTH_LOGOUT",
    entity: "users",
    entityId: req.user.id,
  });

  const role = String(req.user.role || "").toUpperCase();
  if (role === "REPARTIDOR") {
    const hour = new Date().getHours();
    if (hour >= 8 && hour < 22) {
      const io = getIO();
      if (io) {
        const driverName = req.user.fullName || req.user.username || "Repartidor";
        io.emit("driver_offline_alert", {
          type: "logout",
          driverName,
          userId: req.user.id,
          message: `${driverName} cerro sesion`,
          ts: new Date().toISOString(),
        });
      }
    }
  }

  return res.json({ message: "Sesion cerrada" });
}

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
    const role = String(req.user.role || "").toUpperCase();
    if (role === "REPARTIDOR") {
      return res.status(403).json({
        message: "El chofer debe solicitar un PIN de administrador para cerrar sesion",
      });
    }

    return performLogout({ req, res });
  })
);

router.post(
  "/driver-logout/request-pin",
  authRequired,
  asyncHandler(async (req, res) => {
    const role = String(req.user.role || "").toUpperCase();
    if (role !== "REPARTIDOR") {
      return res.status(403).json({ message: "Solo el chofer necesita PIN para cerrar sesion" });
    }

    const pin = generateSixDigitPin();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `
        UPDATE driver_logout_pins
        SET used_at = NOW()
        WHERE user_id = $1
          AND used_at IS NULL
          AND expires_at > NOW()
      `,
      [req.user.id]
    );

    await pool.query(
      `
        INSERT INTO driver_logout_pins(user_id, pin, expires_at)
        VALUES ($1, $2, $3)
      `,
      [req.user.id, pin, expiresAt]
    );

    await logAudit({
      actorUserId: req.user.id,
      action: "DRIVER_LOGOUT_PIN_REQUEST",
      entity: "users",
      entityId: req.user.id,
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    const io = getIO();
    if (io) {
      const driverName = req.user.fullName || req.user.username || "Repartidor";
      io.emit("admin_security_alert", {
        type: "driver_logout_pin",
        driverName,
        userId: req.user.id,
        pin,
        message: `${driverName} solicito cerrar sesion. PIN: ${pin}`,
        ts: new Date().toISOString(),
      });
    }

    return res.json({
      ok: true,
      message: "Se envio una notificacion al administrador con el PIN",
      expiresAt: expiresAt.toISOString(),
    });
  })
);

router.post(
  "/driver-logout/confirm",
  authRequired,
  asyncHandler(async (req, res) => {
    const role = String(req.user.role || "").toUpperCase();
    if (role !== "REPARTIDOR") {
      return res.status(403).json({ message: "Solo el chofer puede confirmar este cierre de sesion" });
    }

    const parsed = driverLogoutPinSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "PIN invalido" });
    }

    const { rows } = await pool.query(
      `
        SELECT id, pin, expires_at
        FROM driver_logout_pins
        WHERE user_id = $1
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [req.user.id]
    );
    const pinRow = rows[0];
    if (!pinRow) {
      return res.status(400).json({ message: "No hay un PIN pendiente para esta sesion" });
    }
    if (new Date(pinRow.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: "El PIN ya vencio. Solicita uno nuevo" });
    }
    if (String(pinRow.pin) !== parsed.data.pin) {
      return res.status(400).json({ message: "PIN incorrecto" });
    }

    await pool.query(
      `
        UPDATE driver_logout_pins
        SET used_at = NOW()
        WHERE id = $1
      `,
      [pinRow.id]
    );

    await logAudit({
      actorUserId: req.user.id,
      action: "DRIVER_LOGOUT_PIN_CONFIRM",
      entity: "users",
      entityId: req.user.id,
    });

    return performLogout({ req, res });
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
