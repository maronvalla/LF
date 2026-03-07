import { useEffect, useMemo, useState } from "react";
import api from "../api";

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatPercent(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0%";
  return (
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: parsed >= 10 ? 0 : 1,
      maximumFractionDigits: parsed >= 10 ? 0 : 1,
    }).format(parsed) + "%"
  );
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toInputDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromInputDateTime(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function isPastDate(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

function getLabel(value) {
  return String(value || "").replaceAll("_", " ");
}

function getRelationshipStyles(status) {
  switch (String(status || "").toUpperCase()) {
    case "ACTIVO":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "EN_RIESGO":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "CON_DEUDA":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    case "CON_PEDIDOS":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
  }
}

function getPriorityStyles(priority) {
  switch (String(priority || "").toUpperCase()) {
    case "ALTA":
      return "text-rose-300";
    case "MEDIA":
      return "text-amber-300";
    default:
      return "text-zinc-400";
  }
}

function getStageBadgeStyles(stage) {
  switch (String(stage || "").toUpperCase()) {
    case "PROSPECTO":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "CONTACTO":
      return "border-indigo-500/30 bg-indigo-500/10 text-indigo-200";
    case "NEGOCIACION":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "CLIENTE_ACTIVO":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "REACTIVACION":
      return "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200";
    default:
      return "border-zinc-700 bg-zinc-800/60 text-zinc-200";
  }
}

function getActionRecommendation(customer) {
  if (isPastDate(customer.crm_next_follow_up_at)) {
    return {
      priority: 0,
      label: "Contactar hoy",
      detail: `Seguimiento vencido desde ${formatDate(customer.crm_next_follow_up_at)}`,
    };
  }

  if (customer.crm_stage === "PROSPECTO" && toNumber(customer.budgets_count) > 0) {
    return {
      priority: 1,
      label: "Retomar presupuesto",
      detail: customer.last_budget_at
        ? `Ultimo presupuesto ${formatDate(customer.last_budget_at)}`
        : "Prospecto originado por presupuesto",
    };
  }

  if (customer.relationship_status === "EN_RIESGO") {
    return {
      priority: 2,
      label: "Reactivar compra",
      detail:
        customer.days_since_last_sale === null
          ? "Sin compra reciente"
          : `${customer.days_since_last_sale} dias sin venta`,
    };
  }

  if (toNumber(customer.current_account_balance) > 0) {
    return {
      priority: 3,
      label: "Coordinar cobranza",
      detail: `Saldo ${formatCurrency(customer.current_account_balance)}`,
    };
  }

  if (customer.is_frequent_buyer) {
    return {
      priority: 4,
      label: "Cuidar cuenta",
      detail: `${toNumber(customer.sales_last_90_days)} pedidos en 90 dias`,
    };
  }

  return {
    priority: 5,
    label: "Actualizar ficha",
    detail: customer.crm_next_follow_up_at ? "Seguimiento cargado" : "Falta proximo paso",
  };
}

function SummaryCard({ label, value, helper, tone = "default" }) {
  const toneClass =
    tone === "accent"
      ? "border-[#e85d04]/40 bg-[linear-gradient(180deg,rgba(232,93,4,0.18),rgba(15,15,16,0.95))]"
      : tone === "success"
        ? "border-emerald-500/30 bg-[linear-gradient(180deg,rgba(16,64,49,0.5),rgba(15,15,16,0.95))]"
        : "border-zinc-800 bg-[linear-gradient(180deg,#151515,#0f0f10)]";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-400">{helper}</div>
    </div>
  );
}

function SectionButton({ active, label, helper, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition-all ${
        active ? "border-[#e85d04] bg-[#24150d]" : "border-zinc-800 bg-[#111112] hover:border-zinc-700"
      }`}
    >
      <div className="text-xs font-black uppercase tracking-[0.18em] text-white">{label}</div>
      <div className="mt-1 text-xs text-zinc-400">{helper}</div>
    </button>
  );
}

function StageCard({ stage, count, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition-all ${
        selected ? "border-[#e85d04] bg-[#1b120c]" : "border-zinc-800 bg-[#101010] hover:border-zinc-700"
      }`}
    >
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {getLabel(stage)}
      </div>
      <div className="mt-2 text-2xl font-black text-white">{count}</div>
    </button>
  );
}

function Panel({ title, subtitle, right, children, className = "" }) {
  return (
    <section
      className={`rounded-3xl border border-zinc-800 bg-[linear-gradient(180deg,#141414,#0d0d0e)] p-5 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-zinc-400">{subtitle}</div> : null}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}

export default function CRM({ setToast }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [frequentCustomers, setFrequentCustomers] = useState([]);
  const [crmStages, setCrmStages] = useState([]);
  const [crmPriorities, setCrmPriorities] = useState([]);
  const [interactionTypes, setInteractionTypes] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("TODOS");
  const [activeSection, setActiveSection] = useState("resumen");
  const [prospectsFromBudgets, setProspectsFromBudgets] = useState([]);
  const [profileDraft, setProfileDraft] = useState({
    crmStage: "CLIENTE_ACTIVO",
    crmPriority: "MEDIA",
    crmNextFollowUpAt: "",
    crmCommercialNotes: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [interactionDraft, setInteractionDraft] = useState({
    interactionType: "NOTA",
    summary: "",
    notes: "",
    happenedAt: "",
  });
  const [savingInteraction, setSavingInteraction] = useState(false);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/crm/customers");
      const nextCustomers = Array.isArray(data?.customers) ? data.customers : [];
      setSummary(data?.summary || null);
      setCustomers(nextCustomers);
      setFrequentCustomers(Array.isArray(data?.frequentCustomers) ? data.frequentCustomers : []);
      setProspectsFromBudgets(Array.isArray(data?.prospectsFromBudgets) ? data.prospectsFromBudgets : []);
      setCrmStages(Array.isArray(data?.crmStages) ? data.crmStages : []);
      setCrmPriorities(Array.isArray(data?.crmPriorities) ? data.crmPriorities : []);
      setSelectedId((current) => current || nextCustomers[0]?.id || "");
    } catch {
      setSummary(null);
      setCustomers([]);
      setFrequentCustomers([]);
      setProspectsFromBudgets([]);
      setToast?.({ message: "No se pudo cargar el CRM", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (customerId) => {
    if (!customerId) {
      setDetail(null);
      return;
    }

    try {
      setDetailLoading(true);
      const { data } = await api.get(`/crm/customers/${customerId}`);
      setDetail(data);
      setCrmStages(Array.isArray(data?.crmStages) ? data.crmStages : crmStages);
      setCrmPriorities(Array.isArray(data?.crmPriorities) ? data.crmPriorities : crmPriorities);
      setInteractionTypes(
        Array.isArray(data?.interactionTypes) ? data.interactionTypes : interactionTypes
      );
      setProfileDraft({
        crmStage: data?.customer?.crm_stage || "CLIENTE_ACTIVO",
        crmPriority: data?.customer?.crm_priority || "MEDIA",
        crmNextFollowUpAt: toInputDateTime(data?.customer?.crm_next_follow_up_at),
        crmCommercialNotes: data?.customer?.crm_commercial_notes || "",
      });
    } catch {
      setDetail(null);
      setToast?.({ message: "No se pudo cargar la ficha del cliente", type: "error" });
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  useEffect(() => {
    fetchDetail(selectedId);
  }, [selectedId]);

  const totalOrders90d = useMemo(
    () => customers.reduce((acc, customer) => acc + toNumber(customer.sales_last_90_days), 0),
    [customers]
  );

  const selectedCustomerOverview = useMemo(
    () => customers.find((customer) => customer.id === selectedId) || null,
    [customers, selectedId]
  );

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesStage = stageFilter === "TODOS" || customer.crm_stage === stageFilter;
      if (!matchesStage) return false;
      if (!query) return true;
      return [
        customer.name,
        customer.code,
        customer.phone,
        customer.email,
        customer.address,
        customer.crm_stage,
      ]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [customers, search, stageFilter]);

  useEffect(() => {
    if (!filteredCustomers.some((customer) => customer.id === selectedId)) {
      setSelectedId(filteredCustomers[0]?.id || "");
    }
  }, [filteredCustomers, selectedId]);

  const frequentCustomersRanked = useMemo(() => {
    if (frequentCustomers.length) return frequentCustomers;

    return customers
      .filter((customer) => customer.is_frequent_buyer)
      .sort((a, b) => {
        const ordersDiff = toNumber(b.sales_last_90_days) - toNumber(a.sales_last_90_days);
        if (ordersDiff !== 0) return ordersDiff;
        return toNumber(b.total_sales_count) - toNumber(a.total_sales_count);
      })
      .slice(0, 12)
      .map((customer) => ({
        ...customer,
        orders_share_90d_pct:
          totalOrders90d > 0 ? (toNumber(customer.sales_last_90_days) / totalOrders90d) * 100 : 0,
      }));
  }, [customers, frequentCustomers, totalOrders90d]);

  const overdueFollowUps = useMemo(
    () =>
      customers
        .filter((customer) => isPastDate(customer.crm_next_follow_up_at))
        .sort(
          (a, b) =>
            new Date(a.crm_next_follow_up_at).getTime() - new Date(b.crm_next_follow_up_at).getTime()
        )
        .slice(0, 10),
    [customers]
  );

  const reactivationTargets = useMemo(
    () =>
      customers
        .filter(
          (customer) =>
            toNumber(customer.total_sales_count) > 0 &&
            (customer.relationship_status === "EN_RIESGO" || customer.relationship_status === "INACTIVO")
        )
        .sort((a, b) => toNumber(b.days_since_last_sale) - toNumber(a.days_since_last_sale))
        .slice(0, 10),
    [customers]
  );

  const actionQueue = useMemo(
    () =>
      customers
        .map((customer) => ({
          customer,
          action: getActionRecommendation(customer),
        }))
        .sort((a, b) => {
          if (a.action.priority !== b.action.priority) {
            return a.action.priority - b.action.priority;
          }

          const aFollowUp = a.customer.crm_next_follow_up_at
            ? new Date(a.customer.crm_next_follow_up_at).getTime()
            : Number.MAX_SAFE_INTEGER;
          const bFollowUp = b.customer.crm_next_follow_up_at
            ? new Date(b.customer.crm_next_follow_up_at).getTime()
            : Number.MAX_SAFE_INTEGER;

          return aFollowUp - bFollowUp;
        })
        .slice(0, 10),
    [customers]
  );

  const saveProfile = async () => {
    if (!selectedId) return;

    try {
      setSavingProfile(true);
      await api.patch(`/crm/customers/${selectedId}/profile`, {
        crmStage: profileDraft.crmStage,
        crmPriority: profileDraft.crmPriority,
        crmNextFollowUpAt: fromInputDateTime(profileDraft.crmNextFollowUpAt),
        crmCommercialNotes: profileDraft.crmCommercialNotes.trim() || null,
      });
      setToast?.({ message: "Ficha comercial actualizada", type: "success" });
      await Promise.all([fetchOverview(), fetchDetail(selectedId)]);
    } catch {
      setToast?.({ message: "No se pudo actualizar la ficha comercial", type: "error" });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveInteraction = async () => {
    if (!selectedId) return;
    if (!interactionDraft.summary.trim()) {
      setToast?.({ message: "La interaccion necesita un resumen", type: "warning" });
      return;
    }

    try {
      setSavingInteraction(true);
      await api.post(`/crm/customers/${selectedId}/interactions`, {
        interactionType: interactionDraft.interactionType,
        summary: interactionDraft.summary.trim(),
        notes: interactionDraft.notes.trim() || null,
        happenedAt: fromInputDateTime(interactionDraft.happenedAt),
      });
      setInteractionDraft((current) => ({
        interactionType: current.interactionType,
        summary: "",
        notes: "",
        happenedAt: "",
      }));
      setToast?.({ message: "Interaccion registrada", type: "success" });
      await Promise.all([fetchOverview(), fetchDetail(selectedId)]);
    } catch {
      setToast?.({ message: "No se pudo registrar la interaccion", type: "error" });
    } finally {
      setSavingInteraction(false);
    }
  };

  const openCustomer = (customerId) => {
    setSelectedId(customerId);
    setActiveSection("ficha");
  };

  const openPipeline = (stage = "TODOS") => {
    setStageFilter(stage);
    setActiveSection("pipeline");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden text-white">
      <section className="rounded-3xl border border-zinc-800 bg-[linear-gradient(180deg,#141414,#0d0d0e)] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">CRM</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Base comercial y seguimiento</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">
              Separado por secciones para trabajar mejor: resumen ejecutivo, pipeline completo y ficha del
              cliente.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <SectionButton
                active={activeSection === "resumen"}
                label="Resumen"
                helper="Indicadores, clientes frecuentes y prioridades"
                onClick={() => setActiveSection("resumen")}
              />
              <SectionButton
                active={activeSection === "pipeline"}
                label="Pipeline"
                helper="Listado completo a pantalla ancha"
                onClick={() => setActiveSection("pipeline")}
              />
              <SectionButton
                active={activeSection === "ficha"}
                label="Ficha"
                helper={selectedCustomerOverview ? selectedCustomerOverview.name : "Sin cliente seleccionado"}
                onClick={() => setActiveSection("ficha")}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente..."
              className="min-w-[260px] rounded-xl border border-zinc-800 bg-[#121212] px-4 py-2.5 text-sm outline-none focus:border-[#e85d04]"
            />
            <button
              type="button"
              onClick={fetchOverview}
              className="rounded-xl bg-[#e85d04] px-4 py-2.5 text-sm font-black uppercase tracking-wide text-white transition-colors hover:bg-[#d14f00]"
            >
              Actualizar
            </button>
          </div>
        </div>
      </section>

      {activeSection === "resumen" ? (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <SummaryCard
                label="Clientes"
                value={loading ? "--" : summary?.totalCustomers ?? 0}
                helper="Base total registrada"
              />
              <SummaryCard
                label="Activos"
                value={loading ? "--" : summary?.activeCustomers ?? 0}
                helper="Clientes con compra reciente"
                tone="success"
              />
              <SummaryCard
                label="Frecuentes"
                value={loading ? "--" : summary?.frequentBuyersCount ?? 0}
                helper={
                  loading
                    ? "Clientes con 2+ pedidos en 90 dias"
                    : `${formatPercent(summary?.frequentBuyersPct)} de la base con 2+ pedidos en 90 dias`
                }
                tone="accent"
              />
              <SummaryCard
                label="Pedidos 90d"
                value={loading ? "--" : summary?.totalOrders90Days ?? totalOrders90d}
                helper="Volumen usado para medir concentracion"
              />
              <SummaryCard
                label="Seguimientos vencidos"
                value={loading ? "--" : summary?.followUpsOverdue ?? overdueFollowUps.length}
                helper="Clientes para contactar hoy"
              />
              <SummaryCard
                label="Reactivacion"
                value={loading ? "--" : summary?.reactivationCandidatesCount ?? reactivationTargets.length}
                helper="Clientes con venta historica a recuperar"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
              <StageCard stage="TODOS" count={customers.length} selected={stageFilter === "TODOS"} onClick={() => openPipeline("TODOS")} />
              {crmStages.map((stage) => (
                <StageCard
                  key={stage}
                  stage={stage}
                  count={summary?.stageCounts?.[stage] ?? 0}
                  selected={stageFilter === stage}
                  onClick={() => openPipeline(stage)}
                />
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <Panel
                title="Clientes que sostienen pedidos"
                subtitle="Top de clientes con 2+ pedidos en 90 dias y su peso sobre el total"
                right={
                  <span className="rounded-full border border-[#e85d04]/30 bg-[#e85d04]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#ffb36c]">
                    {formatPercent(summary?.frequentBuyersPct)} de la base
                  </span>
                }
              >
                <div className="space-y-3">
                  {frequentCustomersRanked.length ? (
                    frequentCustomersRanked.map((customer, index) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => openCustomer(customer.id)}
                        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-[#101010] px-4 py-3 text-left transition-all hover:border-zinc-700"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#1b120c] text-sm font-black text-[#ffb36c]">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-white">{customer.name}</div>
                            <div className="mt-1 text-xs text-zinc-400">
                              {customer.phone || "Sin telefono"} - ultima venta {formatDate(customer.last_sale_at)}
                            </div>
                          </div>
                        </div>
                        <div className="grid shrink-0 grid-cols-3 gap-4 text-right text-xs text-zinc-400">
                          <div>
                            <div className="text-zinc-500">Pedidos 90d</div>
                            <div className="mt-1 text-sm font-black text-white">{toNumber(customer.sales_last_90_days)}</div>
                          </div>
                          <div>
                            <div className="text-zinc-500">Participacion</div>
                            <div className="mt-1 text-sm font-black text-[#ffb36c]">
                              {formatPercent(customer.orders_share_90d_pct)}
                            </div>
                          </div>
                          <div>
                            <div className="text-zinc-500">Facturacion</div>
                            <div className="mt-1 text-sm font-black text-white">
                              {formatCurrency(customer.total_sales_amount)}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <EmptyState message="Todavia no hay clientes con 2 o mas pedidos en los ultimos 90 dias." />
                  )}
                </div>
              </Panel>

              <Panel
                title="Cola de accion"
                subtitle="Ordena el trabajo comercial por urgencia para no perder seguimiento"
              >
                <div className="space-y-3">
                  {actionQueue.length ? (
                    actionQueue.map(({ customer, action }) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => openCustomer(customer.id)}
                        className="w-full rounded-2xl border border-zinc-800 bg-[#101010] p-4 text-left transition-all hover:border-zinc-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-white">{customer.name}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
                              {getLabel(customer.crm_stage)} - {customer.crm_priority}
                            </div>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getRelationshipStyles(customer.relationship_status)}`}>
                            {getLabel(customer.relationship_status || "SIN_VENTAS")}
                          </span>
                        </div>
                        <div className="mt-3 text-sm font-semibold text-[#ffb36c]">{action.label}</div>
                        <div className="mt-1 text-xs text-zinc-400">{action.detail}</div>
                      </button>
                    ))
                  ) : (
                    <EmptyState message="Sin clientes pendientes de accion por ahora." />
                  )}
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel
                title="Prospectos desde presupuesto"
                subtitle="Presupuestos que generaron o alimentaron una ficha comercial"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {prospectsFromBudgets.length ? (
                    prospectsFromBudgets.map((prospect) => (
                      <button
                        key={prospect.id}
                        type="button"
                        onClick={() => openCustomer(prospect.id)}
                        className="rounded-2xl border border-zinc-800 bg-[#101010] p-4 text-left transition-all hover:border-zinc-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-white">{prospect.name}</div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                              {prospect.last_budget_number || "Sin numero"}
                            </div>
                          </div>
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getStageBadgeStyles(prospect.crm_stage)}`}>
                            {getLabel(prospect.crm_stage)}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-400">
                          <div>
                            <div className="text-zinc-500">Ultimo presupuesto</div>
                            <div className="mt-1 font-semibold text-zinc-200">{formatDate(prospect.last_budget_at)}</div>
                          </div>
                          <div>
                            <div className="text-zinc-500">Monto</div>
                            <div className="mt-1 font-semibold text-zinc-200">
                              {formatCurrency(prospect.last_budget_amount)}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <EmptyState message="Todavia no hay prospectos originados desde presupuestos." />
                  )}
                </div>
              </Panel>

              <Panel
                title="Clientes para reactivar"
                subtitle="Base historica con compras previas pero menor frecuencia reciente"
              >
                <div className="space-y-3">
                  {reactivationTargets.length ? (
                    reactivationTargets.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => openCustomer(customer.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-[#101010] px-4 py-3 text-left transition-all hover:border-zinc-700"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-white">{customer.name}</div>
                          <div className="mt-1 text-xs text-zinc-400">
                            Ultima venta {formatDate(customer.last_sale_at)} - ticket medio {formatCurrency(customer.average_ticket)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">Dias sin compra</div>
                          <div className="mt-1 text-xl font-black text-amber-300">
                            {customer.days_since_last_sale ?? 0}
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <EmptyState message="No hay clientes claros para reactivacion con la base actual." />
                  )}
                </div>
              </Panel>
            </div>

            <Panel
              title="Disciplina CRM"
              subtitle="Utilidades operativas incorporadas para trabajar mejor el embudo"
            >
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                  <div className="text-sm font-black text-white">Seguimiento con fecha</div>
                  <div className="mt-2 text-sm text-zinc-400">
                    Se destacan los seguimientos vencidos para que el pipeline no se convierta en una lista muerta.
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                  <div className="text-sm font-black text-white">Concentracion de pedidos</div>
                  <div className="mt-2 text-sm text-zinc-400">
                    Ahora se ve quienes explican la mayor parte de los pedidos de 90 dias y cuanto pesan sobre la base.
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                  <div className="text-sm font-black text-white">Reactivacion separada</div>
                  <div className="mt-2 text-sm text-zinc-400">
                    Los clientes frios salen como cola de trabajo aparte para no mezclarlos con oportunidades activas.
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {activeSection === "pipeline" ? (
        <section className="min-h-0 flex-1 rounded-3xl border border-zinc-800 bg-[linear-gradient(180deg,#141414,#0d0d0e)] p-5">
          <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Pipeline</div>
                <div className="mt-1 text-sm text-zinc-400">
                  {filteredCustomers.length} clientes visibles sobre {summary?.totalCustomers ?? customers.length} registrados.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStageFilter("TODOS")}
                  className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${
                    stageFilter === "TODOS"
                      ? "border-[#e85d04] bg-[#24150d] text-white"
                      : "border-zinc-800 bg-[#111112] text-zinc-300"
                  }`}
                >
                  Todos
                </button>
                {crmStages.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setStageFilter(stage)}
                    className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${
                      stageFilter === stage
                        ? "border-[#e85d04] bg-[#24150d] text-white"
                        : "border-zinc-800 bg-[#111112] text-zinc-300"
                    }`}
                  >
                    {getLabel(stage)} ({summary?.stageCounts?.[stage] ?? 0})
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-zinc-800 bg-[#0d0d0e]">
              <table className="min-w-[1240px] w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#0d0d0e]">
                  <tr className="border-b border-zinc-800 text-left text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Etapa</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Pedidos 90d</th>
                    <th className="px-4 py-3">Participacion</th>
                    <th className="px-4 py-3">Ultima venta</th>
                    <th className="px-4 py-3">Proximo seguimiento</th>
                    <th className="px-4 py-3">Cuenta cte</th>
                    <th className="px-4 py-3">Siguiente accion</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length ? (
                    filteredCustomers.map((customer) => {
                      const action = getActionRecommendation(customer);
                      const selected = customer.id === selectedId;
                      const ordersShare =
                        totalOrders90d > 0 ? (toNumber(customer.sales_last_90_days) / totalOrders90d) * 100 : 0;

                      return (
                        <tr
                          key={customer.id}
                          className={`border-b border-zinc-900/80 transition-colors ${
                            selected ? "bg-[#1b120c]/80" : "hover:bg-white/[0.03]"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-black text-white">{customer.name}</div>
                            <div className="mt-1 text-xs text-zinc-400">
                              {(customer.phone || "Sin telefono") + " - " + (customer.code || "Sin codigo")}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getStageBadgeStyles(customer.crm_stage)}`}>
                                {getLabel(customer.crm_stage)}
                              </span>
                              <span className={`text-xs font-black uppercase tracking-[0.14em] ${getPriorityStyles(customer.crm_priority)}`}>
                                {customer.crm_priority}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getRelationshipStyles(customer.relationship_status)}`}>
                              {getLabel(customer.relationship_status || "SIN_VENTAS")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white">{toNumber(customer.sales_last_90_days)}</td>
                          <td className="px-4 py-3 text-[#ffb36c]">{formatPercent(ordersShare)}</td>
                          <td className="px-4 py-3 text-zinc-300">{formatDate(customer.last_sale_at)}</td>
                          <td className="px-4 py-3">
                            <div className={isPastDate(customer.crm_next_follow_up_at) ? "font-bold text-rose-300" : "text-zinc-300"}>
                              {formatDate(customer.crm_next_follow_up_at)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-300">{formatCurrency(customer.current_account_balance)}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">{action.label}</div>
                            <div className="mt-1 text-xs text-zinc-400">{action.detail}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openCustomer(customer.id)}
                              className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition-colors hover:border-[#e85d04] hover:text-[#ffb36c]"
                            >
                              Abrir ficha
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="px-4 py-12">
                        <EmptyState message="No hay clientes que coincidan con el filtro actual." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === "ficha" ? (
        <section className="min-h-0 flex-1 rounded-3xl border border-zinc-800 bg-[linear-gradient(180deg,#141414,#0d0d0e)] p-5">
          {detailLoading ? (
            <div className="flex h-full items-center justify-center text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">
              Cargando ficha...
            </div>
          ) : detail?.customer ? (
            <div className="h-full overflow-y-auto pr-1">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Ficha de cliente</div>
                    <h2 className="mt-2 text-4xl font-black tracking-tight text-white">{detail.customer.name}</h2>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                      <span>{detail.customer.code || "Sin codigo"}</span>
                      <span>{detail.customer.phone || "Sin telefono"}</span>
                      <span>{detail.customer.email || "Sin email"}</span>
                      <span>{detail.customer.address || "Sin direccion"}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] ${getStageBadgeStyles(detail.customer.crm_stage)}`}>
                      {getLabel(detail.customer.crm_stage)}
                    </span>
                    <span className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] ${getRelationshipStyles(detail.customer.relationship_status)}`}>
                      {getLabel(detail.customer.relationship_status || "SIN_VENTAS")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveSection("pipeline")}
                      className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-zinc-200"
                    >
                      Volver al pipeline
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <SummaryCard label="Ventas recientes" value={detail.metrics?.recentSalesCount ?? 0} helper="Ultimas 10 ventas" />
                  <SummaryCard label="Monto reciente" value={formatCurrency(detail.metrics?.recentSalesAmount)} helper="Facturacion reciente" />
                  <SummaryCard label="Cuenta corriente" value={formatCurrency(detail.metrics?.currentAccountBalance)} helper="Saldo cliente" />
                  <SummaryCard
                    label="Pedidos 90d"
                    value={selectedCustomerOverview?.sales_last_90_days ?? 0}
                    helper={
                      totalOrders90d > 0
                        ? `${formatPercent((toNumber(selectedCustomerOverview?.sales_last_90_days) / totalOrders90d) * 100)} del total 90d`
                        : "Sin peso sobre pedidos recientes"
                    }
                  />
                  <SummaryCard label="Ticket medio" value={formatCurrency(selectedCustomerOverview?.average_ticket)} helper="Promedio por venta" />
                  <SummaryCard label="Alta cliente" value={formatDate(detail.customer.created_at)} helper="Fecha de registro" />
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Panel
                    title="Ficha comercial"
                    subtitle="Etapa, prioridad y proximo seguimiento"
                    right={
                      <button
                        type="button"
                        onClick={saveProfile}
                        disabled={savingProfile}
                        className="rounded-xl bg-[#e85d04] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-60"
                      >
                        {savingProfile ? "Guardando..." : "Guardar ficha"}
                      </button>
                    }
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="text-sm">
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Etapa</div>
                        <select
                          value={profileDraft.crmStage}
                          onChange={(event) =>
                            setProfileDraft((prev) => ({ ...prev, crmStage: event.target.value }))
                          }
                          className="w-full rounded-xl border border-zinc-800 bg-[#151515] px-3 py-2.5 outline-none focus:border-[#e85d04]"
                        >
                          {crmStages.map((stage) => (
                            <option key={stage} value={stage}>
                              {getLabel(stage)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Prioridad</div>
                        <select
                          value={profileDraft.crmPriority}
                          onChange={(event) =>
                            setProfileDraft((prev) => ({ ...prev, crmPriority: event.target.value }))
                          }
                          className="w-full rounded-xl border border-zinc-800 bg-[#151515] px-3 py-2.5 outline-none focus:border-[#e85d04]"
                        >
                          {crmPriorities.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm md:col-span-2">
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Proximo seguimiento</div>
                        <input
                          type="datetime-local"
                          value={profileDraft.crmNextFollowUpAt}
                          onChange={(event) =>
                            setProfileDraft((prev) => ({
                              ...prev,
                              crmNextFollowUpAt: event.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-zinc-800 bg-[#151515] px-3 py-2.5 outline-none focus:border-[#e85d04]"
                        />
                      </label>
                      <label className="text-sm md:col-span-2">
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Notas comerciales</div>
                        <textarea
                          rows={6}
                          value={profileDraft.crmCommercialNotes}
                          onChange={(event) =>
                            setProfileDraft((prev) => ({
                              ...prev,
                              crmCommercialNotes: event.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-zinc-800 bg-[#151515] px-3 py-2.5 outline-none focus:border-[#e85d04]"
                          placeholder="Observaciones, acuerdos, objeciones, condiciones..."
                        />
                      </label>
                    </div>
                  </Panel>

                  <Panel title="Registrar interaccion" subtitle="Cada contacto debe dejar rastro y proximo paso">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="text-sm">
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Tipo</div>
                        <select
                          value={interactionDraft.interactionType}
                          onChange={(event) =>
                            setInteractionDraft((prev) => ({
                              ...prev,
                              interactionType: event.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-zinc-800 bg-[#151515] px-3 py-2.5 outline-none focus:border-[#e85d04]"
                        >
                          {interactionTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Fecha y hora</div>
                        <input
                          type="datetime-local"
                          value={interactionDraft.happenedAt}
                          onChange={(event) =>
                            setInteractionDraft((prev) => ({ ...prev, happenedAt: event.target.value }))
                          }
                          className="w-full rounded-xl border border-zinc-800 bg-[#151515] px-3 py-2.5 outline-none focus:border-[#e85d04]"
                        />
                      </label>
                      <label className="text-sm md:col-span-2">
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Resumen</div>
                        <input
                          value={interactionDraft.summary}
                          onChange={(event) =>
                            setInteractionDraft((prev) => ({ ...prev, summary: event.target.value }))
                          }
                          className="w-full rounded-xl border border-zinc-800 bg-[#151515] px-3 py-2.5 outline-none focus:border-[#e85d04]"
                          placeholder="Ej: llamo para pedir lista nueva"
                        />
                      </label>
                      <label className="text-sm md:col-span-2">
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Detalle</div>
                        <textarea
                          rows={4}
                          value={interactionDraft.notes}
                          onChange={(event) =>
                            setInteractionDraft((prev) => ({ ...prev, notes: event.target.value }))
                          }
                          className="w-full rounded-xl border border-zinc-800 bg-[#151515] px-3 py-2.5 outline-none focus:border-[#e85d04]"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={saveInteraction}
                      disabled={savingInteraction}
                      className="mt-4 rounded-xl bg-zinc-100 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-900 disabled:opacity-60"
                    >
                      {savingInteraction ? "Registrando..." : "Registrar interaccion"}
                    </button>
                  </Panel>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Panel title="Historial comercial" subtitle="Interacciones registradas con el cliente">
                    <div className="space-y-3">
                      {detail.interactions?.length ? (
                        detail.interactions.map((interaction) => (
                          <div key={interaction.id} className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-black text-white">{interaction.summary}</div>
                                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                                  {interaction.interaction_type} - {interaction.created_by_name || "Sistema"}
                                </div>
                                <div className="mt-2 text-sm text-zinc-300">
                                  {interaction.notes || "Sin detalle adicional"}
                                </div>
                              </div>
                              <div className="text-right text-[11px] text-zinc-500">
                                {formatDateTime(interaction.happened_at)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState message="Sin interacciones cargadas." />
                      )}
                    </div>
                  </Panel>

                  <Panel title="Ventas recientes" subtitle="Ultimas operaciones cargadas en sistema">
                    <div className="space-y-3">
                      {detail.recentSales?.length ? (
                        detail.recentSales.map((sale) => (
                          <div key={sale.id} className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-black text-white">{sale.sale_number || sale.id}</div>
                                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                                  {sale.sale_type} - {sale.status}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-black text-[#ffb36c]">{formatCurrency(sale.total_amount)}</div>
                                <div className="mt-1 text-[11px] text-zinc-500">{formatDateTime(sale.created_at)}</div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState message="Sin ventas registradas en la ficha actual." />
                      )}
                    </div>
                  </Panel>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Panel title="Cuenta corriente" subtitle="Movimientos recientes del cliente">
                    <div className="space-y-3">
                      {detail.currentAccountEntries?.length ? (
                        detail.currentAccountEntries.map((entry) => (
                          <div key={entry.id} className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-black text-white">
                                  {String(entry.entry_type || "").toUpperCase() === "DEBITO" ? "Debito" : "Pago"}
                                </div>
                                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                                  {entry.payment_method || "Sin metodo"}
                                </div>
                                <div className="mt-1 text-xs text-zinc-400">
                                  {entry.description || "Sin descripcion"}
                                </div>
                              </div>
                              <div className="text-right">
                                <div
                                  className={`text-sm font-black ${
                                    String(entry.entry_type || "").toUpperCase() === "DEBITO"
                                      ? "text-rose-300"
                                      : "text-emerald-300"
                                  }`}
                                >
                                  {formatCurrency(entry.amount)}
                                </div>
                                <div className="mt-1 text-[11px] text-zinc-500">{formatDateTime(entry.created_at)}</div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState message="Sin movimientos de cuenta corriente." />
                      )}
                    </div>
                  </Panel>

                  <Panel title="Presupuestos recientes" subtitle="Presupuestos asociados a este cliente">
                    <div className="space-y-3">
                      {detail.recentBudgets?.length ? (
                        detail.recentBudgets.map((budget) => (
                          <div key={budget.id} className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-black text-white">{budget.budget_number}</div>
                                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                                  {budget.sale_type} - {budget.customer_phone || "Sin celular"}
                                </div>
                                <div className="mt-1 text-xs text-zinc-400">
                                  {budget.delivery_address || "Sin direccion cargada"}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-black text-[#ffb36c]">
                                  {formatCurrency(budget.total_amount)}
                                </div>
                                <div className="mt-1 text-[11px] text-zinc-500">
                                  {formatDateTime(budget.created_at)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState message="Sin presupuestos registrados para este cliente." />
                      )}
                    </div>
                  </Panel>
                </div>

                <Panel title="Datos base" subtitle="Informacion estructural del cliente en la distribuidora">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">Direccion</div>
                      <div className="mt-1 text-sm text-zinc-200">{detail.customer.address || "Sin direccion"}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">Lista de precios</div>
                      <div className="mt-1 text-sm text-zinc-200">{detail.customer.preferred_price_list || "Sin lista"}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">Notas generales</div>
                      <div className="mt-1 text-sm text-zinc-200">{detail.customer.notes || "Sin notas"}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">Cuenta corriente habilitada</div>
                      <div className="mt-1 text-sm text-zinc-200">
                        {detail.customer.enable_current_account ? "Si" : "No"}
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <EmptyState message="Selecciona un cliente desde el pipeline para ver su ficha." />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
