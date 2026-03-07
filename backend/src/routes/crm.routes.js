const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");

const router = express.Router();

const CRM_STAGE_VALUES = [
  "PROSPECTO",
  "CONTACTO",
  "NEGOCIACION",
  "CLIENTE_ACTIVO",
  "REACTIVACION",
  "PAUSADO",
];

const CRM_PRIORITY_VALUES = ["BAJA", "MEDIA", "ALTA"];
const CRM_INTERACTION_TYPE_VALUES = [
  "LLAMADA",
  "WHATSAPP",
  "VISITA",
  "VENTA",
  "COBRANZA",
  "NOTA",
];

const customerProfileSchema = z.object({
  crmStage: z.enum(CRM_STAGE_VALUES),
  crmPriority: z.enum(CRM_PRIORITY_VALUES),
  crmNextFollowUpAt: z.string().datetime().nullable().optional(),
  crmCommercialNotes: z.string().trim().max(4000).nullable().optional(),
});

const interactionSchema = z.object({
  interactionType: z.enum(CRM_INTERACTION_TYPE_VALUES),
  summary: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(4000).nullable().optional(),
  happenedAt: z.string().datetime().nullable().optional(),
});

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRelationshipStatus(customer) {
  const balance = toNumber(customer.current_account_balance);
  const pendingOrders = toNumber(customer.pending_orders_count);
  const daysSinceLastSale =
    customer.days_since_last_sale === null ? null : toNumber(customer.days_since_last_sale);

  if (balance > 0) return "CON_DEUDA";
  if (pendingOrders > 0) return "CON_PEDIDOS";
  if (daysSinceLastSale === null) return "SIN_VENTAS";
  if (daysSinceLastSale <= 30) return "ACTIVO";
  if (daysSinceLastSale <= 60) return "EN_RIESGO";
  return "INACTIVO";
}

function buildCustomerDto(row) {
  const totalSalesCount = toNumber(row.total_sales_count);
  const totalSalesAmount = toNumber(row.total_sales_amount);

  return {
    ...row,
    average_ticket: totalSalesCount > 0 ? totalSalesAmount / totalSalesCount : 0,
    relationship_status: getRelationshipStatus(row),
  };
}

async function loadCustomerBase(customerId, client = pool) {
  const customerRes = await client.query(
    `
      SELECT
        c.id,
        c.name,
        c.code,
        c.tax_id,
        c.phone,
        c.email,
        c.address,
        c.notes,
        c.preferred_price_list,
        c.enable_current_account,
        c.created_at,
        c.crm_stage,
        c.crm_priority,
        c.crm_next_follow_up_at,
        c.crm_last_contact_at,
        c.crm_commercial_notes
      FROM customers c
      WHERE c.id = $1
      LIMIT 1
    `,
    [customerId]
  );

  return customerRes.rows[0] || null;
}

router.get(
  "/meta",
  requirePermission("customers.manage"),
  asyncHandler(async (_req, res) => {
    res.json({
      crmStages: CRM_STAGE_VALUES,
      crmPriorities: CRM_PRIORITY_VALUES,
      interactionTypes: CRM_INTERACTION_TYPE_VALUES,
    });
  })
);

router.get(
  "/customers",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim();
    const params = [];
    let where = "";

    if (search) {
      params.push(`%${search}%`);
      where = `
        WHERE (
          c.name ILIKE $1 OR
          COALESCE(c.code, '') ILIKE $1 OR
          COALESCE(c.phone, '') ILIKE $1 OR
          COALESCE(c.email, '') ILIKE $1 OR
          COALESCE(c.address, '') ILIKE $1
        )
      `;
    }

    const { rows } = await pool.query(
      `
        WITH sale_totals AS (
          SELECT
            s.id,
            s.customer_id,
            s.status,
            s.created_at,
            COALESCE(SUM(si.line_total), 0)::numeric AS total_amount
          FROM sales s
          LEFT JOIN sale_items si ON si.sale_id = s.id
          WHERE s.customer_id IS NOT NULL
          GROUP BY s.id
        ),
        sales_summary AS (
          SELECT
            s.customer_id,
            COUNT(*) FILTER (WHERE s.status <> 'ANULADO')::int AS total_sales_count,
            COALESCE(SUM(s.total_amount) FILTER (WHERE s.status <> 'ANULADO'), 0)::numeric AS total_sales_amount,
            MAX(s.created_at) FILTER (WHERE s.status <> 'ANULADO') AS last_sale_at,
            COUNT(*) FILTER (
              WHERE s.status <> 'ANULADO'
                AND s.created_at >= now() - interval '30 days'
            )::int AS sales_last_30_days,
            COUNT(*) FILTER (
              WHERE s.status <> 'ANULADO'
                AND s.created_at >= now() - interval '90 days'
            )::int AS sales_last_90_days,
            COUNT(*) FILTER (WHERE s.status = 'PENDIENTE')::int AS pending_orders_count,
            COUNT(*) FILTER (WHERE s.status = 'PREPARADO')::int AS prepared_orders_count
          FROM sale_totals s
          GROUP BY s.customer_id
        ),
        current_account_summary AS (
          SELECT
            e.customer_id,
            COALESCE(SUM(CASE WHEN e.entry_type = 'DEBITO' THEN e.amount ELSE -e.amount END), 0)::int AS current_account_balance,
            MAX(e.created_at) FILTER (WHERE e.entry_type = 'PAGO') AS last_payment_at,
            COUNT(*)::int AS current_account_movements
          FROM customer_current_account_entries e
          GROUP BY e.customer_id
        ),
        budgets_summary AS (
          SELECT
            b.customer_id,
            COUNT(*)::int AS budgets_count,
            MAX(b.created_at) AS last_budget_at,
            (ARRAY_AGG(b.budget_number ORDER BY b.created_at DESC))[1] AS last_budget_number,
            (ARRAY_AGG(b.total_amount ORDER BY b.created_at DESC))[1] AS last_budget_amount
          FROM budgets b
          WHERE b.customer_id IS NOT NULL
          GROUP BY b.customer_id
        )
        SELECT
          c.id,
          c.name,
          c.code,
          c.phone,
          c.email,
          c.address,
          c.notes,
          c.preferred_price_list,
          c.enable_current_account,
          c.created_at,
          c.crm_stage,
          c.crm_priority,
          c.crm_next_follow_up_at,
          c.crm_last_contact_at,
          c.crm_commercial_notes,
          COALESCE(bs.budgets_count, 0) AS budgets_count,
          bs.last_budget_at,
          bs.last_budget_number,
          COALESCE(bs.last_budget_amount, 0) AS last_budget_amount,
          COALESCE(ss.total_sales_count, 0) AS total_sales_count,
          COALESCE(ss.total_sales_amount, 0)::numeric AS total_sales_amount,
          ss.last_sale_at,
          COALESCE(ss.sales_last_30_days, 0) AS sales_last_30_days,
          COALESCE(ss.sales_last_90_days, 0) AS sales_last_90_days,
          COALESCE(ss.pending_orders_count, 0) AS pending_orders_count,
          COALESCE(ss.prepared_orders_count, 0) AS prepared_orders_count,
          COALESCE(ca.current_account_balance, 0) AS current_account_balance,
          ca.last_payment_at,
          COALESCE(ca.current_account_movements, 0) AS current_account_movements,
          CASE
            WHEN ss.last_sale_at IS NULL THEN NULL
            ELSE FLOOR(EXTRACT(EPOCH FROM (now() - ss.last_sale_at)) / 86400)::int
          END AS days_since_last_sale
        FROM customers c
        LEFT JOIN sales_summary ss ON ss.customer_id = c.id
        LEFT JOIN current_account_summary ca ON ca.customer_id = c.id
        LEFT JOIN budgets_summary bs ON bs.customer_id = c.id
        ${where}
        ORDER BY
          CASE c.crm_priority WHEN 'ALTA' THEN 0 WHEN 'MEDIA' THEN 1 ELSE 2 END,
          COALESCE(c.crm_next_follow_up_at, ss.last_sale_at, c.created_at) ASC,
          c.name ASC
      `,
      params
    );

    const customers = rows.map(buildCustomerDto);

    const summary = customers.reduce(
      (acc, customer) => {
        acc.totalCustomers += 1;
        acc.activeCustomers += customer.relationship_status === "ACTIVO" ? 1 : 0;
        acc.atRiskCustomers += customer.relationship_status === "EN_RIESGO" ? 1 : 0;
        acc.inactiveCustomers +=
          customer.relationship_status === "INACTIVO" || customer.relationship_status === "SIN_VENTAS" ? 1 : 0;
        acc.customersWithDebt += toNumber(customer.current_account_balance) > 0 ? 1 : 0;
        acc.totalOutstandingBalance += toNumber(customer.current_account_balance);
        acc.salesLast30Days += toNumber(customer.sales_last_30_days);
        acc.stageCounts[customer.crm_stage] = (acc.stageCounts[customer.crm_stage] || 0) + 1;
        return acc;
      },
      {
        totalCustomers: 0,
        activeCustomers: 0,
        atRiskCustomers: 0,
        inactiveCustomers: 0,
        customersWithDebt: 0,
        totalOutstandingBalance: 0,
        salesLast30Days: 0,
        stageCounts: Object.fromEntries(CRM_STAGE_VALUES.map((stage) => [stage, 0])),
      }
    );

    const prospectsFromBudgets = customers
      .filter((customer) => toNumber(customer.budgets_count) > 0)
      .sort((a, b) => {
        const aTime = a.last_budget_at ? new Date(a.last_budget_at).getTime() : 0;
        const bTime = b.last_budget_at ? new Date(b.last_budget_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 12);

    res.json({
      summary,
      crmStages: CRM_STAGE_VALUES,
      crmPriorities: CRM_PRIORITY_VALUES,
      customers,
      prospectsFromBudgets,
    });
  })
);

router.get(
  "/customers/:id",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const customer = await loadCustomerBase(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    const [salesRes, currentAccountRes, interactionsRes, budgetsRes] = await Promise.all([
      pool.query(
        `
          SELECT
            s.id,
            s.sale_number,
            s.sale_type,
            s.status,
            s.payment_method,
            s.created_at,
            COALESCE(SUM(si.line_total), 0)::numeric AS total_amount
          FROM sales s
          LEFT JOIN sale_items si ON si.sale_id = s.id
          WHERE s.customer_id = $1
          GROUP BY s.id
          ORDER BY s.created_at DESC
          LIMIT 10
        `,
        [req.params.id]
      ),
      pool.query(
        `
          SELECT
            id,
            entry_type,
            amount,
            payment_method,
            description,
            created_at,
            sale_id
          FROM customer_current_account_entries
          WHERE customer_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 10
        `,
        [req.params.id]
      ),
      pool.query(
        `
          SELECT
            i.id,
            i.interaction_type,
            i.summary,
            i.notes,
            i.happened_at,
            i.created_at,
            i.created_by,
            COALESCE(u.full_name, u.username) AS created_by_name
          FROM customer_crm_interactions i
          LEFT JOIN users u ON u.id = i.created_by
          WHERE i.customer_id = $1
          ORDER BY i.happened_at DESC, i.created_at DESC
          LIMIT 30
        `,
        [req.params.id]
      ),
      pool.query(
        `
          SELECT
            id,
            budget_number,
            customer_phone,
            sale_type,
            total_amount,
            created_at,
            delivery_address
          FROM budgets
          WHERE customer_id = $1
          ORDER BY created_at DESC
          LIMIT 10
        `,
        [req.params.id]
      ),
    ]);

    const sales = salesRes.rows;
    const currentAccountEntries = currentAccountRes.rows;
    const interactions = interactionsRes.rows;
    const totalSalesAmount = sales.reduce((acc, sale) => acc + toNumber(sale.total_amount), 0);
    const currentAccountBalance = currentAccountEntries.reduce(
      (acc, entry) =>
        String(entry.entry_type || "").toUpperCase() === "DEBITO"
          ? acc + toNumber(entry.amount)
          : acc - toNumber(entry.amount),
      0
    );

    res.json({
      customer: {
        ...customer,
        relationship_status: getRelationshipStatus({
          current_account_balance: currentAccountBalance,
          pending_orders_count: sales.filter(
            (sale) => String(sale.status || "").toUpperCase() === "PENDIENTE"
          ).length,
          days_since_last_sale: sales[0]
            ? Math.floor((Date.now() - new Date(sales[0].created_at).getTime()) / 86400000)
            : null,
        }),
      },
      crmStages: CRM_STAGE_VALUES,
      crmPriorities: CRM_PRIORITY_VALUES,
      interactionTypes: CRM_INTERACTION_TYPE_VALUES,
      metrics: {
        recentSalesCount: sales.length,
        recentSalesAmount: totalSalesAmount,
        currentAccountBalance,
      },
      recentSales: sales,
      recentBudgets: budgetsRes.rows,
      currentAccountEntries,
      interactions,
    });
  })
);

router.patch(
  "/customers/:id/profile",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const parsed = customerProfileSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos" });
    }

    const before = await loadCustomerBase(req.params.id);
    if (!before) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    const data = parsed.data;
    const { rows } = await pool.query(
      `
        UPDATE customers
        SET
          crm_stage = $2,
          crm_priority = $3,
          crm_next_follow_up_at = $4,
          crm_commercial_notes = $5
        WHERE id = $1
        RETURNING
          id,
          crm_stage,
          crm_priority,
          crm_next_follow_up_at,
          crm_last_contact_at,
          crm_commercial_notes
      `,
      [
        req.params.id,
        data.crmStage,
        data.crmPriority,
        data.crmNextFollowUpAt || null,
        data.crmCommercialNotes || null,
      ]
    );

    await logAudit({
      actorUserId: req.user.id,
      action: "CUSTOMER_CRM_PROFILE_UPDATE",
      entity: "customers",
      entityId: req.params.id,
      metadata: {
        before: {
          crm_stage: before.crm_stage,
          crm_priority: before.crm_priority,
          crm_next_follow_up_at: before.crm_next_follow_up_at,
          crm_commercial_notes: before.crm_commercial_notes,
        },
        after: rows[0],
      },
    });

    res.json(rows[0]);
  })
);

router.post(
  "/customers/:id/interactions",
  requirePermission("customers.manage"),
  asyncHandler(async (req, res) => {
    const parsed = interactionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos" });
    }

    const customer = await loadCustomerBase(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    const data = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const interactionRes = await client.query(
        `
          INSERT INTO customer_crm_interactions(
            customer_id,
            interaction_type,
            summary,
            notes,
            happened_at,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          req.params.id,
          data.interactionType,
          data.summary,
          data.notes || null,
          data.happenedAt || new Date().toISOString(),
          req.user.id,
        ]
      );

      await client.query(
        `
          UPDATE customers
          SET crm_last_contact_at = $2
          WHERE id = $1
        `,
        [req.params.id, data.happenedAt || new Date().toISOString()]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "CUSTOMER_CRM_INTERACTION_CREATE",
        entity: "customer_crm_interactions",
        entityId: interactionRes.rows[0].id,
        metadata: { after: interactionRes.rows[0], customerName: customer.name },
        client,
      });

      await client.query("COMMIT");
      res.status(201).json(interactionRes.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
