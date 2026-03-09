const EPSILON_QTY = 0.0001;

function toQty(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMoney(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

async function ensureBalanceRow(client, productId, locationId) {
  await client.query(
    `
      INSERT INTO inventory_balances(product_id, location_id, quantity)
      VALUES ($1, $2, 0)
      ON CONFLICT (product_id, location_id) DO NOTHING
    `,
    [productId, locationId]
  );
}

async function getLocationIdByCode(client, code) {
  const { rows } = await client.query("SELECT id FROM locations WHERE code = $1 LIMIT 1", [code]);
  if (!rows[0]) throw new Error(`Location ${code} no inicializada`);
  return rows[0].id;
}

async function getProductCost(client, productId) {
  const { rows } = await client.query(
    "SELECT COALESCE(cost, 0)::numeric AS cost FROM products WHERE id = $1 LIMIT 1",
    [productId]
  );
  return toMoney(rows[0]?.cost || 0);
}

async function createInboundLayer(
  client,
  {
    productId,
    locationId,
    qty,
    unitCost,
    sourceType,
    sourceId = null,
    sourceLineId = null,
    receivedAt = null,
    notes = null,
    createdBy = null,
  }
) {
  const normalizedQty = toQty(qty);
  if (normalizedQty <= EPSILON_QTY) return null;

  const { rows } = await client.query(
    `
      INSERT INTO inventory_fifo_layers(
        product_id,
        location_id,
        source_type,
        source_id,
        source_line_id,
        unit_cost,
        original_qty,
        remaining_qty,
        received_at,
        notes,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, COALESCE($8, NOW()), $9, $10)
      RETURNING *
    `,
    [
      productId,
      locationId,
      String(sourceType || "FIFO_IN"),
      sourceId,
      sourceLineId,
      toMoney(unitCost),
      normalizedQty,
      receivedAt,
      notes || null,
      createdBy || null,
    ]
  );

  return rows[0] || null;
}

async function consumeFifoLayers(
  client,
  {
    productId,
    locationId,
    qty,
    movementReason,
    refType = null,
    refId = null,
    refLineId = null,
    createdBy = null,
  }
) {
  const normalizedQty = toQty(qty);
  if (normalizedQty <= EPSILON_QTY) {
    return { consumptions: [], totalCost: 0 };
  }

  const { rows: layers } = await client.query(
    `
      SELECT id, remaining_qty, unit_cost, received_at, created_at
      FROM inventory_fifo_layers
      WHERE product_id = $1
        AND location_id = $2
        AND remaining_qty > 0
      ORDER BY received_at ASC, created_at ASC, id ASC
      FOR UPDATE
    `,
    [productId, locationId]
  );

  const totalAvailable = layers.reduce((sum, layer) => sum + toQty(layer.remaining_qty), 0);
  if (totalAvailable + EPSILON_QTY < normalizedQty) {
    throw new Error("Stock FIFO insuficiente para completar la operacion");
  }

  let pending = normalizedQty;
  let totalCost = 0;
  const consumptions = [];

  for (const layer of layers) {
    if (pending <= EPSILON_QTY) break;
    const layerRemaining = toQty(layer.remaining_qty);
    if (layerRemaining <= EPSILON_QTY) continue;
    const consumedQty = Math.min(layerRemaining, pending);
    const unitCost = toMoney(layer.unit_cost);

    await client.query(
      `
        UPDATE inventory_fifo_layers
        SET remaining_qty = remaining_qty - $1
        WHERE id = $2
      `,
      [consumedQty, layer.id]
    );

    const insertRes = await client.query(
      `
        INSERT INTO inventory_fifo_consumptions(
          layer_id,
          product_id,
          location_id,
          qty,
          unit_cost,
          movement_reason,
          ref_type,
          ref_id,
          ref_line_id,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
      [
        layer.id,
        productId,
        locationId,
        consumedQty,
        unitCost,
        String(movementReason || "FIFO_OUT"),
        refType,
        refId,
        refLineId,
        createdBy || null,
      ]
    );

    consumptions.push({
      ...insertRes.rows[0],
      qty: consumedQty,
      unit_cost: unitCost,
      received_at: layer.received_at,
    });
    totalCost += consumedQty * unitCost;
    pending -= consumedQty;
  }

  return {
    consumptions,
    totalCost: toMoney(totalCost),
  };
}

async function restoreFifoConsumptions(
  client,
  {
    refType,
    refId,
    refLineId = null,
    deleteAfterRestore = false,
  }
) {
  const params = [refType || null, refId || null];
  let lineFilterSql = "";
  if (refLineId) {
    params.push(refLineId);
    lineFilterSql = ` AND ref_line_id = $${params.length}`;
  }

  const { rows } = await client.query(
    `
      SELECT id, layer_id, qty, unit_cost
      FROM inventory_fifo_consumptions
      WHERE ref_type = $1
        AND ref_id = $2
        ${lineFilterSql}
      ORDER BY created_at DESC, id DESC
      FOR UPDATE
    `,
    params
  );

  let totalCost = 0;
  let restoredQty = 0;

  for (const row of rows) {
    await client.query(
      `
        UPDATE inventory_fifo_layers
        SET remaining_qty = remaining_qty + $1
        WHERE id = $2
      `,
      [row.qty, row.layer_id]
    );
    restoredQty += toQty(row.qty);
    totalCost += toQty(row.qty) * toMoney(row.unit_cost);
  }

  if (deleteAfterRestore && rows.length) {
    await client.query(
      `
        DELETE FROM inventory_fifo_consumptions
        WHERE ref_type = $1
          AND ref_id = $2
          ${lineFilterSql}
      `,
      params
    );
  }

  return {
    restoredQty,
    totalCost: toMoney(totalCost),
    consumptions: rows,
  };
}

async function transferFifoLayers(
  client,
  {
    productId,
    fromLocationId,
    toLocationId,
    qty,
    refType = null,
    refId = null,
    createdBy = null,
  }
) {
  const result = await consumeFifoLayers(client, {
    productId,
    locationId: fromLocationId,
    qty,
    movementReason: "TRANSFERENCIA",
    refType,
    refId,
    createdBy,
  });

  for (const consumption of result.consumptions) {
    await createInboundLayer(client, {
      productId,
      locationId: toLocationId,
      qty: consumption.qty,
      unitCost: consumption.unit_cost,
      sourceType: "TRANSFERENCIA",
      sourceId: refId,
      sourceLineId: consumption.id,
      receivedAt: consumption.received_at,
      notes: "Capa trasladada por transferencia interna",
      createdBy,
    });
  }

  return result;
}

module.exports = {
  EPSILON_QTY,
  toQty,
  toMoney,
  ensureBalanceRow,
  getLocationIdByCode,
  getProductCost,
  createInboundLayer,
  consumeFifoLayers,
  restoreFifoConsumptions,
  transferFifoLayers,
};
