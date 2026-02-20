const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.get(
  "/",
  requirePermission("audit.view"),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `
      SELECT a.*, u.username, u.full_name
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.created_at DESC
      LIMIT 300
    `
    );
    res.json(rows);
  })
);

module.exports = router;

