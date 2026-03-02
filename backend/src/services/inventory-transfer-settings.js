const { z } = require("zod");
const { pool } = require("../db");

const DEFAULT_TRANSFER_PAIRS = [
  { fromCode: "GALPON", toCode: "LOCAL" },
  { fromCode: "LOCAL", toCode: "GALPON" },
];

const transferPairSchema = z.object({
  fromCode: z.string().trim().min(2).max(60),
  toCode: z.string().trim().min(2).max(60),
});

const transferPairsSchema = z.object({
  pairs: z.array(transferPairSchema).max(100).default(DEFAULT_TRANSFER_PAIRS),
});

function normalizeLocationCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeTransferPairs(input, allowedCodes = []) {
  const allowed = new Set(allowedCodes.map(normalizeLocationCode));
  const pairs = [];
  for (const pair of input?.pairs || []) {
    const fromCode = normalizeLocationCode(pair.fromCode);
    const toCode = normalizeLocationCode(pair.toCode);
    if (!fromCode || !toCode || fromCode === toCode) continue;
    if (allowed.size && (!allowed.has(fromCode) || !allowed.has(toCode))) continue;
    if (pairs.some((row) => row.fromCode === fromCode && row.toCode === toCode)) continue;
    pairs.push({ fromCode, toCode });
  }
  return { pairs: pairs.length ? pairs : DEFAULT_TRANSFER_PAIRS };
}

async function loadTransferPairs(allowedCodes = []) {
  const { rows } = await pool.query(
    "SELECT value FROM app_settings WHERE key = 'inventory_transfer_pairs' LIMIT 1"
  );
  if (!rows.length || !rows[0].value) {
    return normalizeTransferPairs({ pairs: DEFAULT_TRANSFER_PAIRS }, allowedCodes);
  }
  const parsed = transferPairsSchema.safeParse(rows[0].value);
  if (!parsed.success) {
    return normalizeTransferPairs({ pairs: DEFAULT_TRANSFER_PAIRS }, allowedCodes);
  }
  return normalizeTransferPairs(parsed.data, allowedCodes);
}

async function saveTransferPairs(pairs) {
  const payload = normalizeTransferPairs(pairs);
  await pool.query(
    `
      INSERT INTO app_settings(key, value, updated_at)
      VALUES ('inventory_transfer_pairs', $1::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [JSON.stringify(payload)]
  );
  return payload;
}

module.exports = {
  DEFAULT_TRANSFER_PAIRS,
  loadTransferPairs,
  normalizeLocationCode,
  normalizeTransferPairs,
  saveTransferPairs,
  transferPairsSchema,
};
