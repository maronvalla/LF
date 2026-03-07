import { useEffect, useMemo, useState } from "react";
import api from "../api";

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
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

function SummaryCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[linear-gradient(180deg,#151515,#0f0f10)] p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-400">{helper}</div>
    </div>
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
        {stage.replaceAll("_", " ")}
      </div>
      <div className="mt-2 text-2xl font-black text-white">{count}</div>
    </button>
  );
}

export default function CRM({ setToast }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [crmStages, setCrmStages] = useState([]);
  const [crmPriorities, setCrmPriorities] = useState([]);
  const [interactionTypes, setInteractionTypes] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("TODOS");
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
      setProspectsFromBudgets(Array.isArray(data?.prospectsFromBudgets) ? data.prospectsFromBudgets : []);
      setCrmStages(Array.isArray(data?.crmStages) ? data.crmStages : []);
      setCrmPriorities(Array.isArray(data?.crmPriorities) ? data.crmPriorities : []);
      setSelectedId((current) => current || nextCustomers[0]?.id || "");
    } catch {
      setSummary(null);
      setCustomers([]);
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
      setInteractionDraft({
        interactionType: interactionDraft.interactionType,
        summary: "",
        notes: "",
        happenedAt: "",
      });
      setToast?.({ message: "Interaccion registrada", type: "success" });
      await Promise.all([fetchOverview(), fetchDetail(selectedId)]);
    } catch {
      setToast?.({ message: "No se pudo registrar la interaccion", type: "error" });
    } finally {
      setSavingInteraction(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 text-white">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">CRM</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Embudo comercial y ficha del cliente enlazados a la base actual.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente..."
            className="min-w-[240px] rounded-xl border border-zinc-800 bg-[#121212] px-4 py-2.5 text-sm outline-none focus:border-[#e85d04]"
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Clientes" value={loading ? "--" : summary?.totalCustomers ?? 0} helper="Base total registrada" />
        <SummaryCard label="Activos" value={loading ? "--" : summary?.activeCustomers ?? 0} helper="Compra reciente" />
        <SummaryCard label="En riesgo" value={loading ? "--" : summary?.atRiskCustomers ?? 0} helper="Sin compra reciente" />
        <SummaryCard label="Con deuda" value={loading ? "--" : summary?.customersWithDebt ?? 0} helper={loading ? "Saldo pendiente" : formatCurrency(summary?.totalOutstandingBalance)} />
        <SummaryCard label="Ventas 30d" value={loading ? "--" : summary?.salesLast30Days ?? 0} helper="Ventas vinculadas" />
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StageCard
          stage="TODOS"
          count={filteredCustomers.length}
          selected={stageFilter === "TODOS"}
          onClick={() => setStageFilter("TODOS")}
        />
        {crmStages.map((stage) => (
          <StageCard
            key={stage}
            stage={stage}
            count={summary?.stageCounts?.[stage] ?? 0}
            selected={stageFilter === stage}
            onClick={() => setStageFilter(stage)}
          />
        ))}
      </div>

      <section className="rounded-3xl border border-zinc-800 bg-[linear-gradient(180deg,#141414,#0d0d0e)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
              Prospectos creados desde presupuesto
            </div>
            <div className="mt-1 text-sm text-zinc-400">
              Ultimos presupuestos que originaron o alimentaron prospectos
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {prospectsFromBudgets.length ? (
            prospectsFromBudgets.map((prospect) => (
              <button
                key={prospect.id}
                type="button"
                onClick={() => setSelectedId(prospect.id)}
                className="rounded-2xl border border-zinc-800 bg-[#101010] p-4 text-left transition-all hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-white">{prospect.name}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                      {prospect.last_budget_number || "Sin numero"}
                    </div>
                  </div>
                  <span className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-300">
                    {prospect.crm_stage?.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <div>
                    <div className="text-zinc-500">Ultimo presupuesto</div>
                    <div className="mt-1 font-semibold text-zinc-200">
                      {prospect.last_budget_at ? formatDate(prospect.last_budget_at) : "Sin fecha"}
                    </div>
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
            <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500 md:col-span-2 xl:col-span-4">
              Todavia no hay prospectos originados desde presupuestos.
            </div>
          )}
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="min-h-0 rounded-3xl border border-zinc-800 bg-[linear-gradient(180deg,#141414,#0d0d0e)]">
          <div className="border-b border-zinc-800 px-5 py-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Pipeline</div>
            <div className="mt-1 text-sm text-zinc-400">
              {filteredCustomers.length} clientes visibles
            </div>
          </div>
          <div className="max-h-[calc(100vh-360px)] overflow-y-auto px-3 py-3">
            {filteredCustomers.map((customer) => {
              const selected = customer.id === selectedId;
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedId(customer.id)}
                  className={`mb-2 w-full rounded-2xl border p-4 text-left transition-all ${
                    selected ? "border-[#e85d04] bg-[#1b120c]" : "border-zinc-800 bg-[#101010] hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-black text-white">{customer.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
                        {customer.crm_stage?.replaceAll("_", " ")} ·{" "}
                        <span className={getPriorityStyles(customer.crm_priority)}>
                          {customer.crm_priority}
                        </span>
                      </div>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getRelationshipStyles(customer.relationship_status)}`}>
                      {String(customer.relationship_status || "SIN_VENTAS").replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                    <div>
                      <div className="text-zinc-500">Proximo seguimiento</div>
                      <div className="mt-1 font-semibold text-zinc-200">
                        {customer.crm_next_follow_up_at ? formatDate(customer.crm_next_follow_up_at) : "Sin fecha"}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Ultimo contacto</div>
                      <div className="mt-1 font-semibold text-zinc-200">
                        {customer.crm_last_contact_at ? formatDate(customer.crm_last_contact_at) : "Sin contacto"}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Cuenta corriente</div>
                      <div className="mt-1 font-semibold text-zinc-200">
                        {formatCurrency(customer.current_account_balance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Ultima venta</div>
                      <div className="mt-1 font-semibold text-zinc-200">
                        {customer.last_sale_at ? formatDate(customer.last_sale_at) : "Sin ventas"}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="min-h-0 rounded-3xl border border-zinc-800 bg-[linear-gradient(180deg,#141414,#0d0d0e)] p-5">
          {detailLoading ? (
            <div className="flex h-full items-center justify-center text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">
              Cargando ficha...
            </div>
          ) : detail?.customer ? (
            <div className="flex h-full flex-col gap-4 overflow-y-auto">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Ficha de cliente</div>
                  <h2 className="mt-2 text-3xl font-black tracking-tight">{detail.customer.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
                    <span>{detail.customer.code || "Sin codigo"}</span>
                    <span>{detail.customer.phone || "Sin telefono"}</span>
                    <span>{detail.customer.email || "Sin email"}</span>
                  </div>
                </div>
                <span className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] ${getRelationshipStyles(detail.customer.relationship_status)}`}>
                  {String(detail.customer.relationship_status || "SIN_VENTAS").replaceAll("_", " ")}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Ventas recientes" value={detail.metrics?.recentSalesCount ?? 0} helper="Ultimas 10 ventas" />
                <SummaryCard label="Monto reciente" value={formatCurrency(detail.metrics?.recentSalesAmount)} helper="Facturacion reciente" />
                <SummaryCard label="Cuenta corriente" value={formatCurrency(detail.metrics?.currentAccountBalance)} helper="Saldo cliente" />
                <SummaryCard label="Alta cliente" value={formatDate(detail.customer.created_at)} helper="Fecha de registro" />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                      Ficha comercial
                    </div>
                    <button
                      type="button"
                      onClick={saveProfile}
                      disabled={savingProfile}
                      className="rounded-xl bg-[#e85d04] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-60"
                    >
                      {savingProfile ? "Guardando..." : "Guardar ficha"}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                            {stage.replaceAll("_", " ")}
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
                        placeholder="Observaciones, acuerdos, condiciones, objeciones..."
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Registrar interaccion
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Historial comercial</div>
                  <div className="mt-4 space-y-3">
                    {detail.interactions?.length ? (
                      detail.interactions.map((interaction) => (
                        <div key={interaction.id} className="rounded-2xl border border-zinc-800 bg-[#141414] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-black text-white">{interaction.summary}</div>
                              <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                                {interaction.interaction_type} · {interaction.created_by_name || "Sistema"}
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
                      <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
                        Sin interacciones cargadas.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Actividad financiera y ventas</div>
                  <div className="mt-4 space-y-3">
                    {detail.recentSales?.map((sale) => (
                      <div key={sale.id} className="rounded-2xl border border-zinc-800 bg-[#141414] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-white">{sale.sale_number || sale.id}</div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                              {sale.sale_type} · {sale.status}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-black text-[#ffb36c]">{formatCurrency(sale.total_amount)}</div>
                            <div className="mt-1 text-[11px] text-zinc-500">{formatDateTime(sale.created_at)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {detail.currentAccountEntries?.map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-zinc-800 bg-[#141414] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-white">
                              {String(entry.entry_type || "").toUpperCase() === "DEBITO" ? "Debito" : "Pago"}
                            </div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                              {entry.payment_method || "SIN_METODO"}
                            </div>
                            <div className="mt-1 text-xs text-zinc-400">
                              {entry.description || "Sin descripcion"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-black ${String(entry.entry_type || "").toUpperCase() === "DEBITO" ? "text-rose-300" : "text-emerald-300"}`}>
                              {formatCurrency(entry.amount)}
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-500">{formatDateTime(entry.created_at)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  Presupuestos recientes
                </div>
                <div className="mt-4 space-y-3">
                  {detail.recentBudgets?.length ? (
                    detail.recentBudgets.map((budget) => (
                      <div key={budget.id} className="rounded-2xl border border-zinc-800 bg-[#141414] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-white">{budget.budget_number}</div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                              {budget.sale_type} · {budget.customer_phone || "Sin celular"}
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
                    <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
                      Sin presupuestos registrados para este cliente.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-[#101010] p-4">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Datos base</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
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
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-sm text-zinc-500">
              Selecciona un cliente para ver su ficha.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
