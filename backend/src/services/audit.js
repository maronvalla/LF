const { pool } = require("../db");

async function logAudit({
  actorUserId,
  action,
  entity,
  entityId = null,
  metadata = {},
  client = null,
}) {
  const db = client || pool;
  await db.query(
    `
      INSERT INTO audit_log (actor_user_id, action, entity, entity_id, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [actorUserId || null, action, entity, entityId, JSON.stringify(metadata || {})]
  );
}

module.exports = { logAudit };

