import { useEffect, useMemo, useState } from "react";
import api from "../api";

const EMPTY_SUMMARY = { customers: [], suppliers: [] };

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getInitials(name) {
  if (!name) return "?";
  return name.substring(0, 2).toUpperCase();
}

function EntryRow({ entry, type }) {
  const isDebit = String(entry.entry_type || "").toUpperCase() === "DEBITO";

  return (
    <tr className="border-b border-zinc-800/40 last:border-0 hover:bg-white/[0.02] transition-colors">
      <td className="px-5 py-4 text-sm text-zinc-400 font-medium">
        {new Date(entry.created_at).toLocaleDateString("es-AR", {
          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
        })}
      </td>
      <td className="px-5 py-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${isDebit
            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
            }`}
        >
          {isDebit ? (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {isDebit ? (type === "customers" ? "Me debe" : "Debo") : "Pago"}
        </span>
      </td>
      <td className="px-5 py-4 text-sm text-zinc-300 font-medium">{entry.description || "-"}</td>
      <td className="px-5 py-4 text-right">
        <div className={`text-base font-black ${isDebit ? 'text-amber-400' : 'text-emerald-400'}`}>
          {isDebit ? "+" : "-"}{formatCurrency(entry.amount)}
        </div>
      </td>
    </tr>
  );
}

export default function CuentaCorriente({ setToast }) {
  const [activeType, setActiveType] = useState("customers");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState({
    amount: "",
    description: "",
    paymentMethod: "EFECTIVO",
  });

  const activeRows = summary[activeType] || [];
  const activeLabel = activeType === "customers" ? "Clientes" : "Proveedores";
  const balanceLabel = activeType === "customers" ? "Me deben" : "Debo";

  const selectedRow = useMemo(
    () => activeRows.find((row) => row.id === selectedId) || null,
    [activeRows, selectedId]
  );

  const fetchSummary = async (preferredType = activeType, preferredId = selectedId) => {
    try {
      const { data } = await api.get("/current-account/summary");
      const nextSummary = {
        customers: Array.isArray(data?.customers) ? data.customers : [],
        suppliers: Array.isArray(data?.suppliers) ? data.suppliers : [],
      };
      setSummary(nextSummary);

      const nextRows = nextSummary[preferredType] || [];
      const nextSelectedId =
        preferredId && nextRows.some((row) => row.id === preferredId)
          ? preferredId
          : nextRows[0]?.id || "";
      setSelectedId(nextSelectedId);
    } catch {
      setSummary(EMPTY_SUMMARY);
      setSelectedId("");
      setToast?.({ message: "No se pudo cargar cuenta corriente", type: "error" });
    }
  };

  const fetchDetail = async (type, id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      setLoadingDetail(true);
      const { data } = await api.get(`/current-account/${type}/${id}`);
      setDetail(data || null);
    } catch {
      setDetail(null);
      setToast?.({ message: "No se pudo cargar el detalle de cuenta corriente", type: "error" });
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    const rows = summary[activeType] || [];
    if (!rows.length) {
      setSelectedId("");
      setDetail(null);
      return;
    }
    if (!selectedId || !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0]?.id || "");
    }
  }, [activeType, selectedId, summary]);

  useEffect(() => {
    fetchDetail(activeType, selectedId);
  }, [activeType, selectedId]);

  const registerPayment = async () => {
    const amount = Number(String(paymentDraft.amount || "").replace(",", "."));
    if (!selectedId) {
      setToast?.({
        message: `Selecciona un ${activeType === "customers" ? "cliente" : "proveedor"}`,
        type: "error",
      });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast?.({ message: "Ingresa un importe valido", type: "error" });
      return;
    }

    try {
      await api.post(`/current-account/${activeType}/${selectedId}/payment`, {
        amount,
        description: paymentDraft.description || null,
        paymentMethod: paymentDraft.paymentMethod,
      });
      setToast?.({ message: "Movimiento registrado", type: "success" });
      setPaymentDraft({ amount: "", description: "", paymentMethod: "EFECTIVO" });
      await fetchSummary(activeType, selectedId);
      await fetchDetail(activeType, selectedId);
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo registrar el movimiento",
        type: "error",
      });
    }
  };

  const totalOwed = activeRows.reduce((sum, row) => sum + Number(row.balance || 0), 0);

  return (
    <div className="h-full flex flex-col gap-6 text-white p-2 xl:overflow-hidden overflow-y-auto overflow-x-hidden">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6 px-2">
        <div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
            Cuenta Corriente
          </h1>
          <p className="mt-2 text-sm text-zinc-400 font-medium">
            Gestión y seguimiento de saldos de clientes y proveedores.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-md">
          {[
            { key: "customers", label: "Clientes", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
            { key: "suppliers", label: "Proveedores", icon: "M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveType(tab.key)}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-300 ${activeType === tab.key
                ? "bg-[#e85d04] text-white shadow-[0_0_20px_rgba(232,93,4,0.3)] ring-1 ring-[#e85d04]"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid flex-1 grid-cols-1 gap-6 xl:grid-cols-[400px_1fr] xl:min-h-0">

        {/* Left Sidebar - List */}
        <div className="flex flex-col rounded-3xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl shadow-2xl overflow-hidden relative min-h-[400px] xl:min-h-0">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

          <div className="relative z-10 border-b border-white/5 px-6 py-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#e85d04]">
                Directorio de {activeLabel}
              </div>
              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                {activeRows.length} Registros
              </div>
            </div>
            {activeRows.length > 0 && (
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Total {balanceLabel}</div>
                <div className="text-sm font-black text-amber-400">{formatCurrency(totalOwed)}</div>
              </div>
            )}
          </div>

          <div className="relative z-10 flex-1 overflow-auto p-3 flex flex-col gap-1.5 custom-scrollbar">
            {activeRows.length ? (
              activeRows.map((row) => {
                const isSelected = row.id === selectedId;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full group flex items-center gap-4 rounded-2xl p-4 text-left transition-all duration-300 ${isSelected
                      ? "bg-gradient-to-r from-zinc-800/80 to-zinc-800/40 border border-[#e85d04]/30 shadow-[0_4px_20px_rgba(0,0,0,0.2)] ring-1 ring-[#e85d04]/50"
                      : "border border-transparent hover:bg-white/5 hover:border-white/10"
                      }`}
                  >
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-black transition-colors ${isSelected ? "bg-[#e85d04] text-white" : "bg-zinc-800 text-zinc-400 group-hover:text-white"
                      }`}>
                      {getInitials(row.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-black uppercase truncate transition-colors ${isSelected ? "text-white" : "text-zinc-300 group-hover:text-white"}`}>
                        {row.name}
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-zinc-500 truncate">
                        {row.code || row.cuit || row.phone || "Sin identificación"}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`text-sm font-black ${isSelected ? "text-amber-400" : "text-zinc-400 group-hover:text-amber-400/70"}`}>
                        {formatCurrency(row.balance)}
                      </div>
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full opacity-50 px-6 text-center">
                <svg className="w-12 h-12 text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <div className="text-sm font-bold text-zinc-400">
                  No hay {activeLabel.toLowerCase()} con cuenta corriente habilitada.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex flex-col gap-6 min-h-[600px] xl:min-h-0">

          {/* Top Panel: Summary & Quick Actions */}
          <div className="rounded-3xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#e85d04]/5 rounded-full blur-[80px] pointer-events-none" />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 relative z-10">
              <div className="flex flex-col justify-center">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">
                  {activeType === "customers" ? "Cliente Seleccionado" : "Proveedor Seleccionado"}
                </div>
                <div className="text-xl font-black text-white truncate drop-shadow-md">
                  {selectedRow?.name || "-"}
                </div>
              </div>

              <div className="flex flex-col justify-center lg:border-l lg:border-white/10 lg:pl-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">
                  Saldo Actual ({balanceLabel})
                </div>
                <div className="text-3xl font-black text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                  {formatCurrency(detail?.balance || selectedRow?.balance || 0)}
                </div>
              </div>

              <div className="flex flex-col justify-center lg:border-l lg:border-white/10 lg:pl-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">
                  Total Movimientos
                </div>
                <div className="text-3xl font-black text-white drop-shadow-md">
                  {detail?.entries?.length ?? selectedRow?.movements ?? 0}
                </div>
              </div>
            </div>

            {/* Payment Form Strip */}
            <div className="mt-8 pt-6 border-t border-white/5 relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-[#e85d04]">
                  {activeType === "customers" ? "Registrar Nuevo Cobro" : "Registrar Pago a Proveedor"}
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1 md:max-w-[180px]">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-zinc-500">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-3.5 pl-8 pr-4 text-sm font-bold text-white outline-none transition-all focus:border-[#e85d04] focus:bg-[#1a1a1a] focus:ring-1 focus:ring-[#e85d04]/50 placeholder:text-zinc-500"
                    placeholder="Importe"
                    value={paymentDraft.amount}
                    onChange={(event) => setPaymentDraft((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                </div>
                <select
                  className="flex-shrink-0 md:w-48 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 text-sm font-bold text-white outline-none transition-all focus:border-[#e85d04] focus:bg-[#1a1a1a] focus:ring-1 focus:ring-[#e85d04]/50 appearance-none cursor-pointer"
                  value={paymentDraft.paymentMethod}
                  onChange={(event) => setPaymentDraft((prev) => ({ ...prev, paymentMethod: event.target.value }))}
                >
                  <option value="EFECTIVO" className="bg-zinc-900">💵 EFECTIVO</option>
                  <option value="TRANSFERENCIA" className="bg-zinc-900">🏦 TRANSFERENCIA</option>
                  <option value="OTRO" className="bg-zinc-900">📝 OTRO</option>
                </select>
                <input
                  type="text"
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 text-sm font-bold text-white outline-none transition-all focus:border-[#e85d04] focus:bg-[#1a1a1a] focus:ring-1 focus:ring-[#e85d04]/50 placeholder:text-zinc-500"
                  placeholder="Descripción (Opcional)..."
                  value={paymentDraft.description}
                  onChange={(event) => setPaymentDraft((prev) => ({ ...prev, description: event.target.value }))}
                />
                <button
                  type="button"
                  className="flex-shrink-0 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#e85d04] to-[#f77f00] px-8 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(232,93,4,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(232,93,4,0.5)] active:scale-[0.98]"
                  onClick={registerPayment}
                >
                  <span>{activeType === "customers" ? "Guardar cobro" : "Guardar pago"}</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Movements Table */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl shadow-2xl flex flex-col relative">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none z-0" />
            <div className="border-b border-white/5 px-6 py-5 relative z-10 flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse" />
                Historial de Movimientos
              </div>
            </div>

            <div className="flex-1 overflow-auto relative z-10">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur-md z-20 border-b border-white/10 shadow-sm">
                  <tr>
                    <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 w-48">Fecha y Hora</th>
                    <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 w-32">Naturaleza</th>
                    <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Detalles</th>
                    <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 text-right w-40">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loadingDetail ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center">
                        <div className="inline-flex items-center gap-3 text-zinc-400 font-bold text-sm bg-black/20 px-4 py-2 rounded-full border border-white/5">
                          <svg className="animate-spin h-4 w-4 text-[#e85d04]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Cargando historial...
                        </div>
                      </td>
                    </tr>
                  ) : detail?.entries?.length ? (
                    detail.entries.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} type={activeType} />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center">
                        <div className="flex flex-col flex-center items-center gap-3 opacity-60">
                          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-zinc-500">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <span className="text-zinc-500 font-bold text-sm">Sin movimientos registrados.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {/* Added global styles specifically for this view to hide standard webkit scrollbars for a cleaner look */}
      <style>{`
  .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent; 
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1); 
      border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2); 
  }
`}</style>
    </div>
  );
}
