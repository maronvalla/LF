import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { loadCajaConfig } from "../utils/cajaConfig";

const sanitizeDecimalInput = (value) => {
  const normalized = String(value || "").replace(",", ".");
  let out = "";
  let dotSeen = false;
  for (const ch of normalized) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if (ch === "." && !dotSeen) {
      out += ch;
      dotSeen = true;
    }
  }
  return out;
};

export default function Caja({ user, setToast }) {
  const [denominations, setDenominations] = useState(() => loadCajaConfig().denominations || []);
  const [session, setSession] = useState(null);
  const [movements, setMovements] = useState([]);
  const [canOpen, setCanOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);

  // Modal de apertura
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");

  // Modal de cierre
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [billCount, setBillCount] = useState(
    Object.fromEntries((loadCajaConfig().denominations || []).map((d) => [d, 0]))
  );
  const [consolidatedIncluded, setConsolidatedIncluded] = useState(false);
  const [consolidatedAmount, setConsolidatedAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeSummary, setCloseSummary] = useState(null);

  // Formulario de movimiento
  const [movementType, setMovementType] = useState("RETIRO");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementConcept, setMovementConcept] = useState("");
  const [movementSupplier, setMovementSupplier] = useState("");

  // Historial
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loanSummary, setLoanSummary] = useState({ meDeben: 0, debo: 0 });
  const [recentLoanPayments, setRecentLoanPayments] = useState([]);
  const [loanDirection, setLoanDirection] = useState("OTORGADO");
  const [loanCounterparty, setLoanCounterparty] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanNotes, setLoanNotes] = useState("");
  const [loanPaymentDrafts, setLoanPaymentDrafts] = useState({});
  const [savingLoan, setSavingLoan] = useState(false);
  const [savingLoanPaymentId, setSavingLoanPaymentId] = useState(null);

  const role = String(user?.role || "").toUpperCase();
  const canAccess = role === "ADMIN" || role === "CAJERO";

  useEffect(() => {
    if (!canAccess) return;
    const nextDenominations = loadCajaConfig().denominations || [];
    setDenominations(nextDenominations);
    setBillCount((prev) => {
      const next = {};
      nextDenominations.forEach((denom) => {
        next[denom] = Number(prev?.[denom] || 0);
      });
      return next;
    });
    loadToday();
    loadSuppliers();
    loadLoans();
  }, [canAccess]);

  useEffect(() => {
    if (!showOpenModal) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setShowOpenModal(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showOpenModal]);

  const loadToday = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/caja/today");
      setSession(data.session);
      setMovements(data.movements || []);
      setCanOpen(Boolean(data.canOpen));
      if (data.canOpen) {
        const carryOverAmount = Number(data.session?.closing_total || 0);
        setOpeningAmount(carryOverAmount > 0 ? carryOverAmount.toFixed(2) : "");
      }

      // Si no hay sesión ABIERTA, mostrar modal de apertura
      if (data.canOpen && (!data.session || data.session.status !== "ABIERTA")) {
        setShowOpenModal(true);
      }
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error cargando caja", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const { data } = await api.get("/suppliers");
      setSuppliers(data || []);
    } catch {
      setSuppliers([]);
    }
  };

  const loadHistory = async () => {
    try {
      const { data } = await api.get("/caja/history");
      setHistory(data || []);
      setShowHistory(true);
    } catch (err) {
      setToast?.({ message: "Error cargando historial", type: "error" });
    }
  };

  const loadLoans = async () => {
    try {
      const { data } = await api.get("/caja/loans");
      setLoans(data.loans || []);
      setLoanSummary(data.summary || { meDeben: 0, debo: 0 });
      setRecentLoanPayments(data.recentPayments || []);
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error cargando prestamos", type: "error" });
    }
  };

  const handleOpenCaja = async () => {
    const amount = Number(openingAmount) || 0;
    if (amount < 0) {
      setToast?.({ message: "El monto debe ser mayor o igual a 0", type: "error" });
      return;
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await api.post("/caja/open", {
        date: today,
        openingAmount: amount,
      });
      setSession(data.session);
      setMovements(data.movements || []);
      setCanOpen(false);
      setShowOpenModal(false);
      setOpeningAmount("");
      setToast?.({ message: "Caja abierta correctamente", type: "success" });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error abriendo caja", type: "error" });
    }
  };

  const handleAddMovement = async (e) => {
    e.preventDefault();
    const amount = Number(movementAmount);
    if (!amount || amount <= 0) {
      setToast?.({ message: "Ingrese un monto valido", type: "error" });
      return;
    }
    if (!movementConcept.trim()) {
      setToast?.({ message: "Ingrese un concepto", type: "error" });
      return;
    }

    try {
      await api.post("/caja/movement", {
        movementType,
        amount,
        concept: movementConcept.trim(),
        supplierId: movementType === "PAGO_PROVEEDOR" ? movementSupplier || null : null,
      });

      setMovementAmount("");
      setMovementConcept("");
      setMovementSupplier("");
      loadToday();
      setToast?.({ message: "Movimiento registrado", type: "success" });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error registrando movimiento", type: "error" });
    }
  };

  const handleDeleteMovement = async (id) => {
    if (!window.confirm("Eliminar este movimiento?")) return;
    try {
      await api.delete(`/caja/movement/${id}`);
      loadToday();
      setToast?.({ message: "Movimiento eliminado", type: "success" });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error eliminando movimiento", type: "error" });
    }
  };

  const handleCreateLoan = async (e) => {
    e.preventDefault();
    const amount = Number(loanAmount);
    if (!loanCounterparty.trim()) {
      setToast?.({ message: "Ingrese el nombre de la persona o entidad", type: "error" });
      return;
    }
    if (!amount || amount <= 0) {
      setToast?.({ message: "Ingrese un monto valido", type: "error" });
      return;
    }

    setSavingLoan(true);
    try {
      await api.post("/caja/loans", {
        counterpartyName: loanCounterparty.trim(),
        direction: loanDirection,
        amount,
        notes: loanNotes.trim() || null,
      });
      setLoanCounterparty("");
      setLoanAmount("");
      setLoanNotes("");
      setLoanPaymentDrafts({});
      await Promise.all([loadToday(), loadLoans()]);
      setToast?.({ message: "Prestamo registrado", type: "success" });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error registrando prestamo", type: "error" });
    } finally {
      setSavingLoan(false);
    }
  };

  const handleLoanPaymentDraftChange = (loanId, field, value) => {
    setLoanPaymentDrafts((prev) => ({
      ...prev,
      [loanId]: {
        amount: prev[loanId]?.amount ?? "",
        notes: prev[loanId]?.notes ?? "",
        [field]: value,
      },
    }));
  };

  const handleRegisterLoanPayment = async (loan) => {
    const draft = loanPaymentDrafts[loan.id] || {};
    const amount = Number(draft.amount || loan.outstanding_amount || 0);
    if (!amount || amount <= 0) {
      setToast?.({ message: "Ingrese un importe valido para registrar", type: "error" });
      return;
    }

    setSavingLoanPaymentId(loan.id);
    try {
      await api.post(`/caja/loans/${loan.id}/payment`, {
        amount,
        notes: String(draft.notes || "").trim() || null,
      });
      setLoanPaymentDrafts((prev) => {
        const next = { ...prev };
        delete next[loan.id];
        return next;
      });
      await Promise.all([loadToday(), loadLoans()]);
      setToast?.({
        message: loan.direction === "OTORGADO" ? "Cobro registrado" : "Pago registrado",
        type: "success",
      });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error registrando movimiento del prestamo", type: "error" });
    } finally {
      setSavingLoanPaymentId(null);
    }
  };

  const totalConteo = useMemo(() => {
    return denominations.reduce((sum, denom) => {
      return sum + (Number(billCount[denom] || 0) * denom);
    }, 0);
  }, [billCount, denominations]);

  const handleBillCountChange = (denom, value) => {
    const qty = Math.max(0, parseInt(value) || 0);
    setBillCount((prev) => ({ ...prev, [denom]: qty }));
  };

  const handleStartClose = async () => {
    // Preguntar si llegó el consolidado
    const llegaConsolidado = window.confirm("Llego el consolidado del dia para sumarlo?");
    setConsolidatedIncluded(llegaConsolidado);
    if (llegaConsolidado) {
      setConsolidatedAmount("");
    }
    setShowCloseModal(true);
  };

  const handleCloseCaja = async () => {
    if (consolidatedIncluded && (!consolidatedAmount || Number(consolidatedAmount) < 0)) {
      setToast?.({ message: "Ingrese el monto del consolidado", type: "error" });
      return;
    }

    try {
      const { data } = await api.post("/caja/close", {
        closingCount: billCount,
        consolidatedIncluded,
        consolidatedAmount: consolidatedIncluded ? Number(consolidatedAmount) : 0,
        notes: closeNotes,
      });

      setCloseSummary(data.summary);
      setSession(data.session);
      setToast?.({ message: "Caja cerrada correctamente", type: "success" });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error cerrando caja", type: "error" });
    }
  };

  // Calcular totales de movimientos
  const movementsSummary = useMemo(() => {
    const retiros = movements
      .filter((m) => ["RETIRO", "PAGO_DEUDA", "PAGO_PROVEEDOR"].includes(m.movement_type))
      .reduce((sum, m) => sum + Number(m.amount), 0);
    const ingresos = movements
      .filter((m) => m.movement_type === "INGRESO")
      .reduce((sum, m) => sum + Number(m.amount), 0);
    return { retiros, ingresos };
  }, [movements]);

  if (!canAccess) {
    return (
      <div className="card p-8 text-center">
        <div className="text-zinc-400">Solo ADMIN y CAJERO pueden acceder a esta seccion</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-400">Cargando...</div>
      </div>
    );
  }

  const formatMoney = (val) => `$${Number(val || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
  const displayDate = new Date(session?.date || Date.now()).toLocaleDateString("es-AR");
  const panelClass = "rounded-xl border border-[#cfcfd4] bg-[#efefef] shadow-[0_2px_8px_rgba(0,0,0,0.08)]";
  const inputClass =
    "w-full rounded-lg border border-[#cfcfd4] bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-[#d97706]";
  const whiteModalInputClass =
    "w-full rounded-lg border border-[#d7d7db] bg-white px-3 py-2.5 text-zinc-900 outline-none focus:border-[#d97706] placeholder:text-zinc-400";
  const primaryButtonClass =
    "rounded-lg bg-[#e97800] px-4 py-2.5 text-sm font-black text-white shadow-[0_2px_8px_rgba(217,119,6,0.3)] transition-colors hover:bg-[#d46f00]";
  const secondaryButtonClass =
    "rounded-lg border border-[#c89a59] bg-[#f7f2e8] px-4 py-2.5 text-sm font-black text-[#9a5a00] transition-colors hover:bg-[#efe4d1]";
  const lightOptionStyle = { color: "#18181b", backgroundColor: "#ffffff" };
  const lightSelectStyle = { colorScheme: "light" };

  return (
    <div className="h-full min-h-0 overflow-y-auto flex flex-col gap-3 rounded-2xl bg-[#e9e9ea] p-3 text-zinc-900">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-[16px] md:text-[18px] font-black leading-none text-zinc-900 uppercase tracking-tight">
              Control de Caja Diario
            </h1>
            <p className="text-xs text-zinc-600 mt-1">Apertura, movimientos y cierre.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canOpen && (
            <button className={primaryButtonClass} onClick={() => setShowOpenModal(true)}>
              Abrir Nueva Caja
            </button>
          )}
          <button className={primaryButtonClass} onClick={loadHistory}>
            Ver Historial
          </button>
        </div>
      </div>

      {/* Estado de caja */}
      {session && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className={`${panelClass} p-4`}>
            <div className="text-[10px] text-zinc-600 uppercase font-black tracking-wider">Estado</div>
            <div className={`text-xl font-black mt-1 ${session.status === "ABIERTA" ? "text-emerald-600" : "text-zinc-500"}`}>
              {session.status}
            </div>
          </div>
          <div className={`${panelClass} p-4`}>
            <div className="text-[10px] text-zinc-600 uppercase font-black tracking-wider">Saldo Inicial</div>
            <div className="text-xl font-black text-zinc-900 mt-1">{formatMoney(session.opening_amount)}</div>
          </div>
          <div className={`${panelClass} p-4`}>
            <div className="text-[10px] text-zinc-600 uppercase font-black tracking-wider">Total Retiros</div>
            <div className="text-xl font-black text-rose-500 mt-1">{formatMoney(movementsSummary.retiros)}</div>
          </div>
          <div className={`${panelClass} p-4`}>
            <div className="text-[10px] text-zinc-600 uppercase font-black tracking-wider">Fecha</div>
            <div className="text-xl font-black text-zinc-900 mt-1">{displayDate}</div>
          </div>
        </div>
      )}

      {/* Si la caja está cerrada, mostrar resumen */}
      {session?.status === "CERRADA" && (
        <div className={`${panelClass} p-6`}>
          <div className="text-lg font-black text-zinc-900 mb-4 uppercase">Resumen de Cierre</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] text-zinc-600 uppercase font-black">Saldo Inicial</div>
              <div className="text-lg font-bold text-zinc-900">{formatMoney(session.opening_amount)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 uppercase font-black">Cobranzas Efectivo</div>
              <div className="text-lg font-bold text-emerald-600">{formatMoney(session.cash_sales_amount)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 uppercase font-black">Consolidado</div>
              <div className="text-lg font-bold text-blue-600">
                {session.consolidated_included ? formatMoney(session.consolidated_amount) : "-"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 uppercase font-black">Esperado</div>
              <div className="text-lg font-bold text-zinc-900">{formatMoney(session.expected_amount)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 uppercase font-black">Total Rendido</div>
              <div className="text-lg font-bold text-[#e85d04]">{formatMoney(session.closing_total)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 uppercase font-black">Diferencia</div>
              <div className={`text-lg font-bold ${Number(session.difference) >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                {Number(session.difference) >= 0 ? "+" : ""}{formatMoney(session.difference)}
                <span className="text-xs ml-2">
                  ({Number(session.difference) >= 0 ? "SOBRANTE" : "FALTANTE"})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Formulario de movimientos (solo si caja abierta) */}
      {session?.status === "ABIERTA" && (
        <div className={`${panelClass} p-4`}>
          <div className="text-sm font-black uppercase text-zinc-900 mb-3">Registrar Movimiento</div>
          <form onSubmit={handleAddMovement} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] text-zinc-600 uppercase font-black">Tipo</label>
              <select
                className={`${inputClass} mt-1`}
                style={lightSelectStyle}
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
              >
                <option value="RETIRO" style={lightOptionStyle}>Retiro</option>
                <option value="PAGO_DEUDA" style={lightOptionStyle}>Pago de Deuda</option>
                <option value="PAGO_PROVEEDOR" style={lightOptionStyle}>Pago a Proveedor</option>
                <option value="INGRESO" style={lightOptionStyle}>Ingreso</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase font-black">Monto</label>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[\\.]?[0-9]*"
                className={`${inputClass} mt-1`}
                placeholder="0.00"
                value={movementAmount}
                onChange={(e) => setMovementAmount(sanitizeDecimalInput(e.target.value))}
              />
            </div>
            <div className={movementType === "PAGO_PROVEEDOR" ? "" : "md:col-span-2"}>
              <label className="text-[10px] text-zinc-600 uppercase font-black">Concepto</label>
              <input
                type="text"
                className={`${inputClass} mt-1`}
                placeholder="Descripcion del movimiento"
                value={movementConcept}
                onChange={(e) => setMovementConcept(e.target.value)}
              />
            </div>
            {movementType === "PAGO_PROVEEDOR" && (
              <div>
                <label className="text-[10px] text-zinc-600 uppercase font-black">Proveedor</label>
                <select
                  className={`${inputClass} mt-1`}
                  style={lightSelectStyle}
                  value={movementSupplier}
                  onChange={(e) => setMovementSupplier(e.target.value)}
                >
                  <option value="" style={lightOptionStyle}>Seleccionar...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id} style={lightOptionStyle}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-end">
              <button type="submit" className={`${primaryButtonClass} w-full`}>
                Agregar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={`${panelClass} p-4 shrink-0`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black uppercase text-zinc-900">Prestamos y Deudores</div>
            <p className="mt-1 text-xs text-zinc-600">Registra prestamos hechos o recibidos y sus cobros/pagos.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-[#d4d4d8] bg-white px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Me deben</div>
              <div className="mt-1 text-xl font-black text-emerald-600">{formatMoney(loanSummary.meDeben)}</div>
            </div>
            <div className="rounded-lg border border-[#d4d4d8] bg-white px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Debo</div>
              <div className="mt-1 text-xl font-black text-rose-500">{formatMoney(loanSummary.debo)}</div>
            </div>
          </div>
        </div>

        {session?.status === "ABIERTA" ? (
          <form onSubmit={handleCreateLoan} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] text-zinc-600 uppercase font-black">Tipo</label>
              <select
                className={`${inputClass} mt-1`}
                style={lightSelectStyle}
                value={loanDirection}
                onChange={(e) => setLoanDirection(e.target.value)}
              >
                <option value="OTORGADO" style={lightOptionStyle}>Prestamo hecho</option>
                <option value="RECIBIDO" style={lightOptionStyle}>Prestamo recibido</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase font-black">Nombre</label>
              <input
                className={`${inputClass} mt-1`}
                placeholder="Persona o entidad"
                value={loanCounterparty}
                onChange={(e) => setLoanCounterparty(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase font-black">Monto</label>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[\\.]?[0-9]*"
                className={`${inputClass} mt-1`}
                placeholder="0.00"
                value={loanAmount}
                onChange={(e) => setLoanAmount(sanitizeDecimalInput(e.target.value))}
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase font-black">Detalle</label>
              <input
                className={`${inputClass} mt-1`}
                placeholder="Motivo o referencia"
                value={loanNotes}
                onChange={(e) => setLoanNotes(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className={`${primaryButtonClass} w-full`} disabled={savingLoan}>
                {savingLoan ? "Guardando..." : "Registrar prestamo"}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-lg border border-[#d4d4d8] bg-white px-4 py-3 text-sm text-zinc-600">
            Para registrar prestamos o devoluciones necesitas una caja abierta.
          </div>
        )}

        <div className="mt-4 max-h-[260px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#e6e6e7] text-[10px] uppercase text-zinc-600">
              <tr>
                <th className="px-3 py-3 text-left">Nombre</th>
                <th className="px-3 py-3 text-left">Tipo</th>
                <th className="px-3 py-3 text-right">Original</th>
                <th className="px-3 py-3 text-right">Saldo</th>
                <th className="px-3 py-3 text-left">Detalle</th>
                <th className="px-3 py-3 text-right">Importe</th>
                <th className="px-3 py-3 text-left">Nota</th>
                <th className="px-3 py-3 text-right">Accion</th>
              </tr>
            </thead>
            <tbody>
              {loans
                .filter((loan) => loan.status === "ACTIVO")
                .map((loan) => {
                  const paymentDraft = loanPaymentDrafts[loan.id] || {};
                  return (
                    <tr key={loan.id} className="border-t border-[#d9d9dd] bg-white/75 align-top">
                      <td className="px-3 py-3 font-bold text-zinc-900">{loan.counterparty_name}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-black ${
                            loan.direction === "OTORGADO"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {loan.direction === "OTORGADO" ? "Me deben" : "Debo"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-zinc-700">{formatMoney(loan.original_amount)}</td>
                      <td className="px-3 py-3 text-right font-black text-zinc-900">{formatMoney(loan.outstanding_amount)}</td>
                      <td className="px-3 py-3 text-zinc-600">{loan.notes || "-"}</td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[\\.]?[0-9]*"
                          className={`${inputClass} max-w-[120px] ml-auto text-right`}
                          placeholder={String(Number(loan.outstanding_amount || 0).toFixed(2))}
                          value={paymentDraft.amount ?? ""}
                          onChange={(e) => handleLoanPaymentDraftChange(loan.id, "amount", sanitizeDecimalInput(e.target.value))}
                          disabled={session?.status !== "ABIERTA"}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className={`${inputClass} min-w-[180px]`}
                          placeholder="Nota opcional"
                          value={paymentDraft.notes ?? ""}
                          onChange={(e) => handleLoanPaymentDraftChange(loan.id, "notes", e.target.value)}
                          disabled={session?.status !== "ABIERTA"}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          className={primaryButtonClass}
                          disabled={session?.status !== "ABIERTA" || savingLoanPaymentId === loan.id}
                          onClick={() => handleRegisterLoanPayment(loan)}
                        >
                          {savingLoanPaymentId === loan.id
                            ? "Guardando..."
                            : loan.direction === "OTORGADO"
                              ? "Registrar cobro"
                              : "Registrar pago"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              {!loans.filter((loan) => loan.status === "ACTIVO").length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                    No hay prestamos activos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!!recentLoanPayments.length && (
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">
              Ultimos cobros y pagos
            </div>
            <div className="space-y-2">
              {recentLoanPayments.slice(0, 6).map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d4d4d8] bg-white px-3 py-2 text-sm"
                >
                  <div className="font-bold text-zinc-900">{payment.counterparty_name}</div>
                  <div className="text-zinc-600">
                    {payment.direction === "OTORGADO" ? "Cobro de prestamo" : "Pago de prestamo"}
                  </div>
                  <div className="font-black text-zinc-900">{formatMoney(payment.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lista de movimientos */}
      <div className={`${panelClass} overflow-hidden flex-1 min-h-[320px]`}>
        <div className="px-4 py-3 border-b border-[#d4d4d8] text-sm font-black uppercase text-zinc-900">
          Movimientos del Dia
        </div>
        <div className="overflow-auto flex-1 min-h-[280px]">
          <table className="w-full text-sm">
            <thead className="text-zinc-600 uppercase text-[10px] bg-[#e6e6e7] sticky top-0">
              <tr>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Concepto</th>
                <th className="text-left px-4 py-3">Proveedor</th>
                <th className="text-right px-4 py-3">Monto</th>
                <th className="text-center px-4 py-3">Hora</th>
                {session?.status === "ABIERTA" && <th className="text-center px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-t border-[#d9d9dd] hover:bg-[#f5f5f6]">
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                      m.movement_type === "RETIRO" ? "bg-yellow-100 text-yellow-700" :
                      m.movement_type === "PAGO_DEUDA" ? "bg-rose-100 text-rose-700" :
                      m.movement_type === "PAGO_PROVEEDOR" ? "bg-violet-100 text-violet-700" :
                      "bg-emerald-100 text-emerald-700"
                    }`}>
                      {m.movement_type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-900">{m.concept}</td>
                  <td className="px-4 py-3 text-zinc-600">{m.supplier_name || "-"}</td>
                  <td className={`px-4 py-3 text-right font-bold ${
                    ["RETIRO", "PAGO_DEUDA", "PAGO_PROVEEDOR"].includes(m.movement_type) ? "text-rose-500" : "text-emerald-600"
                  }`}>
                    {["RETIRO", "PAGO_DEUDA", "PAGO_PROVEEDOR"].includes(m.movement_type) ? "-" : "+"}
                    {formatMoney(m.amount)}
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-600">
                    {new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  {session?.status === "ABIERTA" && (
                    <td className="px-4 py-3 text-center">
                      <button
                        className="text-rose-500 hover:text-rose-600 text-xs font-bold"
                        onClick={() => handleDeleteMovement(m.id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!movements.length && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-zinc-500">No hay movimientos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Boton de cierre */}
      {session?.status === "ABIERTA" && (
        <div className="flex justify-end">
          <button className={`${primaryButtonClass} px-8 py-3 text-base`} onClick={handleStartClose}>
            Realizar Cierre de Caja
          </button>
        </div>
      )}

      {/* Modal de apertura */}
      {showOpenModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#121212] border border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="text-xl font-black text-[#e85d04]">APERTURA DE CAJA</div>
            <p className="text-zinc-400 text-sm">Ingrese el saldo inicial para comenzar el dia</p>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-black">Saldo Inicial</label>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[\\.]?[0-9]*"
                className={`${whiteModalInputClass} mt-1 text-2xl font-bold`}
                placeholder="0.00"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(sanitizeDecimalInput(e.target.value))}
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-4">
              <button className="btn btn-muted flex-1 py-3" onClick={() => setShowOpenModal(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary flex-1 py-3" onClick={handleOpenCaja}>
                Abrir Caja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cierre */}
      {showCloseModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-[#121212] border border-zinc-800 rounded-2xl p-6 space-y-4 my-4">
            {!closeSummary ? (
              <>
                <div className="text-xl font-black text-[#e85d04]">CIERRE DE CAJA - CONTEO DE BILLETES</div>
                <p className="text-zinc-400 text-sm">Complete el conteo de billetes para cerrar la caja</p>

                {/* Tabla de conteo de billetes */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-zinc-700">
                    <thead className="bg-zinc-800">
                      <tr>
                        <th className="border border-zinc-700 px-4 py-2 text-left text-zinc-400 uppercase text-xs">Billetes</th>
                        <th className="border border-zinc-700 px-4 py-2 text-center text-zinc-400 uppercase text-xs">Cantidades</th>
                        <th className="border border-zinc-700 px-4 py-2 text-right text-zinc-400 uppercase text-xs">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {denominations.map((denom) => (
                        <tr key={denom} className="hover:bg-zinc-800/40">
                          <td className="border border-zinc-700 px-4 py-2 font-bold text-white">{denom.toLocaleString("es-AR")}</td>
                          <td className="border border-zinc-700 px-4 py-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className={`${whiteModalInputClass} w-24 mx-auto text-center font-bold`}
                              value={billCount[denom] || ""}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "");
                                handleBillCountChange(denom, val);
                              }}
                              placeholder="0"
                            />
                          </td>
                          <td className="border border-zinc-700 px-4 py-2 text-right font-mono text-emerald-400">
                            ${(Number(billCount[denom] || 0) * denom).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-zinc-800">
                        <td className="border border-zinc-700 px-4 py-2"></td>
                        <td className="border border-zinc-700 px-4 py-2"></td>
                        <td className="border border-zinc-700 px-4 py-2"></td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e85d04]/20">
                        <td colSpan={2} className="border border-zinc-700 px-4 py-3 text-right font-black text-lg text-white">
                          TOTAL RENDIDO
                        </td>
                        <td className="border border-zinc-700 px-4 py-3 text-right font-black text-2xl text-[#e85d04]">
                          ${totalConteo.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Consolidado */}
                {consolidatedIncluded && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <label className="text-[10px] text-blue-400 uppercase font-black">Monto del Consolidado</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*[\\.]?[0-9]*"
                      className={`${whiteModalInputClass} mt-1 text-xl font-bold`}
                      placeholder="0.00"
                      value={consolidatedAmount}
                      onChange={(e) => setConsolidatedAmount(sanitizeDecimalInput(e.target.value))}
                    />
                  </div>
                )}

                {/* Notas */}
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-black">Notas (opcional)</label>
                  <textarea
                    className={`${whiteModalInputClass} mt-1 min-h-[88px]`}
                    rows={2}
                    placeholder="Observaciones del cierre..."
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <button className="btn btn-muted flex-1" onClick={() => { setShowCloseModal(false); setCloseSummary(null); }}>
                    Cancelar
                  </button>
                  <button className="btn btn-primary flex-1 py-3 font-bold" onClick={handleCloseCaja}>
                    Guardar Cierre
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-xl font-black text-emerald-400">CAJA CERRADA CORRECTAMENTE</div>

                {/* Resumen final */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Saldo Inicial:</span>
                      <span className="font-bold text-white">{formatMoney(closeSummary.openingAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Retiros/Pagos:</span>
                      <span className="font-bold text-rose-400">-{formatMoney(closeSummary.retiros)}</span>
                    </div>
                    {closeSummary.consolidado > 0 && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Consolidado:</span>
                        <span className="font-bold text-blue-400">+{formatMoney(closeSummary.consolidado)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Cobranzas Efectivo:</span>
                      <span className="font-bold text-emerald-400">+{formatMoney(closeSummary.cashSales)}</span>
                    </div>
                    {typeof closeSummary.recoveredCapital === "number" && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Capital recuperado:</span>
                        <span className="font-bold text-zinc-300">{formatMoney(closeSummary.recoveredCapital)}</span>
                      </div>
                    )}
                    {typeof closeSummary.estimatedProfit === "number" && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Utilidad estimada:</span>
                        <span className="font-bold text-emerald-300">{formatMoney(closeSummary.estimatedProfit)}</span>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-zinc-700 pt-3 mt-3">
                    <div className="flex justify-between text-lg">
                      <span className="text-zinc-300 font-bold">ESPERADO:</span>
                      <span className="font-black text-white">{formatMoney(closeSummary.expectedAmount)}</span>
                    </div>
                    <div className="flex justify-between text-lg mt-2">
                      <span className="text-zinc-300 font-bold">RENDIDO:</span>
                      <span className="font-black text-[#e85d04]">{formatMoney(closeSummary.closingTotal)}</span>
                    </div>
                  </div>
                  <div className={`border-t-2 pt-4 mt-4 ${closeSummary.difference >= 0 ? "border-emerald-500" : "border-rose-500"}`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-xl font-black ${closeSummary.difference >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {closeSummary.difference >= 0 ? "SOBRANTE" : "FALTANTE"}:
                      </span>
                      <span className={`text-3xl font-black ${closeSummary.difference >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {closeSummary.difference >= 0 ? "+" : ""}{formatMoney(closeSummary.difference)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button className="btn btn-primary flex-1 py-3" onClick={() => { setShowCloseModal(false); setCloseSummary(null); }}>
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de historial */}
      {showHistory && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-[#121212] border border-zinc-800 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center">
              <div className="text-xl font-black text-[#e85d04]">HISTORIAL DE CAJAS</div>
              <button className="btn btn-muted" onClick={() => setShowHistory(false)}>Cerrar</button>
            </div>

            <table className="w-full text-sm">
              <thead className="text-zinc-400 uppercase text-[10px] bg-[#1a1a1a]">
                <tr>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-right px-4 py-3">Apertura</th>
                  <th className="text-right px-4 py-3">Rendido</th>
                  <th className="text-right px-4 py-3">Esperado</th>
                  <th className="text-right px-4 py-3">Diferencia</th>
                  <th className="text-left px-4 py-3">Cerrado por</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/20">
                    <td className="px-4 py-3 font-bold text-white">{h.date}</td>
                    <td className="px-4 py-3">
                      <span className={`chip ${h.status === "CERRADA" ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                        {h.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">{formatMoney(h.opening_amount)}</td>
                    <td className="px-4 py-3 text-right text-[#e85d04] font-bold">{h.closing_total ? formatMoney(h.closing_total) : "-"}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{h.expected_amount ? formatMoney(h.expected_amount) : "-"}</td>
                    <td className={`px-4 py-3 text-right font-bold ${Number(h.difference) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {h.difference != null ? (Number(h.difference) >= 0 ? "+" : "") + formatMoney(h.difference) : "-"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{h.closed_by_name || "-"}</td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-zinc-500">No hay registros</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
