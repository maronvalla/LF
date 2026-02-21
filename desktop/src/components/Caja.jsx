import { useEffect, useMemo, useState } from "react";
import api from "../api";

const DENOMINACIONES = [10, 20, 50, 100, 200, 500, 1000, 2000, 10000, 20000];

export default function Caja({ user, setToast }) {
  const [session, setSession] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);

  // Modal de apertura
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");

  // Modal de cierre
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [billCount, setBillCount] = useState(
    DENOMINACIONES.reduce((acc, d) => ({ ...acc, [d]: 0 }), {})
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

  const role = String(user?.role || "").toUpperCase();
  const canAccess = role === "ADMIN" || role === "CAJERO";

  useEffect(() => {
    if (!canAccess) return;
    loadToday();
    loadSuppliers();
  }, [canAccess]);

  const loadToday = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/caja/today");
      setSession(data.session);
      setMovements(data.movements || []);

      // Si no hay sesión, mostrar modal de apertura
      if (!data.session) {
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

  const totalConteo = useMemo(() => {
    return DENOMINACIONES.reduce((sum, denom) => {
      return sum + (Number(billCount[denom] || 0) * denom);
    }, 0);
  }, [billCount]);

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

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold leading-none text-white tracking-tight">Caja</h1>
          <p className="text-xs text-zinc-400 mt-1">Control de caja diario - Apertura, movimientos y cierre</p>
        </div>
        <button className="btn btn-muted" onClick={loadHistory}>
          Ver Historial
        </button>
      </div>

      {/* Estado de caja */}
      {session && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-4">
            <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">Estado</div>
            <div className={`text-xl font-black mt-1 ${session.status === "ABIERTA" ? "text-emerald-400" : "text-zinc-400"}`}>
              {session.status}
            </div>
          </div>
          <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-4">
            <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">Saldo Inicial</div>
            <div className="text-xl font-black text-white mt-1">{formatMoney(session.opening_amount)}</div>
          </div>
          <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-4">
            <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">Total Retiros</div>
            <div className="text-xl font-black text-rose-400 mt-1">{formatMoney(movementsSummary.retiros)}</div>
          </div>
          <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-4">
            <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">Fecha</div>
            <div className="text-xl font-black text-white mt-1">{session.date}</div>
          </div>
        </div>
      )}

      {/* Si la caja está cerrada, mostrar resumen */}
      {session?.status === "CERRADA" && (
        <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-6">
          <div className="text-lg font-black text-[#e85d04] mb-4">RESUMEN DE CIERRE</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase font-black">Saldo Inicial</div>
              <div className="text-lg font-bold text-white">{formatMoney(session.opening_amount)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase font-black">Ventas Efectivo</div>
              <div className="text-lg font-bold text-emerald-400">{formatMoney(session.cash_sales_amount)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase font-black">Consolidado</div>
              <div className="text-lg font-bold text-blue-400">
                {session.consolidated_included ? formatMoney(session.consolidated_amount) : "-"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase font-black">Esperado</div>
              <div className="text-lg font-bold text-white">{formatMoney(session.expected_amount)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase font-black">Total Rendido</div>
              <div className="text-lg font-bold text-[#e85d04]">{formatMoney(session.closing_total)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase font-black">Diferencia</div>
              <div className={`text-lg font-bold ${Number(session.difference) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
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
        <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-4">
          <div className="text-sm font-black uppercase text-[#e85d04] mb-3">Registrar Movimiento</div>
          <form onSubmit={handleAddMovement} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-black">Tipo</label>
              <select
                className="input mt-1 w-full"
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
              >
                <option value="RETIRO">Retiro</option>
                <option value="PAGO_DEUDA">Pago de Deuda</option>
                <option value="PAGO_PROVEEDOR">Pago a Proveedor</option>
                <option value="INGRESO">Ingreso</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-black">Monto</label>
              <input
                type="number"
                className="input mt-1 w-full"
                placeholder="0.00"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            <div className={movementType === "PAGO_PROVEEDOR" ? "" : "md:col-span-2"}>
              <label className="text-[10px] text-zinc-500 uppercase font-black">Concepto</label>
              <input
                type="text"
                className="input mt-1 w-full"
                placeholder="Descripcion del movimiento"
                value={movementConcept}
                onChange={(e) => setMovementConcept(e.target.value)}
              />
            </div>
            {movementType === "PAGO_PROVEEDOR" && (
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-black">Proveedor</label>
                <select
                  className="input mt-1 w-full"
                  value={movementSupplier}
                  onChange={(e) => setMovementSupplier(e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary w-full">
                Agregar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de movimientos */}
      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg overflow-hidden flex-1">
        <div className="px-4 py-3 border-b border-zinc-800 text-sm font-black uppercase text-[#e85d04]">
          Movimientos del Dia
        </div>
        <div className="overflow-auto max-h-64">
          <table className="w-full text-sm">
            <thead className="text-zinc-400 uppercase text-[10px] bg-[#1a1a1a] sticky top-0">
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
                <tr key={m.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/20">
                  <td className="px-4 py-3">
                    <span className={`chip ${
                      m.movement_type === "RETIRO" ? "bg-yellow-500/20 text-yellow-400" :
                      m.movement_type === "PAGO_DEUDA" ? "bg-rose-500/20 text-rose-400" :
                      m.movement_type === "PAGO_PROVEEDOR" ? "bg-purple-500/20 text-purple-400" :
                      "bg-emerald-500/20 text-emerald-400"
                    }`}>
                      {m.movement_type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-200">{m.concept}</td>
                  <td className="px-4 py-3 text-zinc-400">{m.supplier_name || "-"}</td>
                  <td className="px-4 py-3 text-right font-bold text-rose-400">
                    {["RETIRO", "PAGO_DEUDA", "PAGO_PROVEEDOR"].includes(m.movement_type) ? "-" : "+"}
                    {formatMoney(m.amount)}
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-500">
                    {new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  {session?.status === "ABIERTA" && (
                    <td className="px-4 py-3 text-center">
                      <button
                        className="text-rose-400 hover:text-rose-300 text-xs"
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
                  <td colSpan={6} className="text-center py-8 text-zinc-500">No hay movimientos registrados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Boton de cierre */}
      {session?.status === "ABIERTA" && (
        <div className="flex justify-end">
          <button className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white px-8 py-3 text-lg font-bold" onClick={handleStartClose}>
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
                type="number"
                className="input mt-1 w-full text-2xl font-bold"
                placeholder="0.00"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                min="0"
                step="0.01"
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-4">
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
                      {DENOMINACIONES.map((denom) => (
                        <tr key={denom} className="hover:bg-zinc-800/40">
                          <td className="border border-zinc-700 px-4 py-2 font-bold text-white">{denom.toLocaleString("es-AR")}</td>
                          <td className="border border-zinc-700 px-4 py-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="input w-24 mx-auto text-center"
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
                      type="number"
                      className="input mt-1 w-full text-xl font-bold"
                      placeholder="0.00"
                      value={consolidatedAmount}
                      onChange={(e) => setConsolidatedAmount(e.target.value)}
                      min="0"
                      step="0.01"
                    />
                  </div>
                )}

                {/* Notas */}
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-black">Notas (opcional)</label>
                  <textarea
                    className="input mt-1 w-full"
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
                      <span className="text-zinc-400">Ventas Efectivo:</span>
                      <span className="font-bold text-emerald-400">+{formatMoney(closeSummary.cashSales)}</span>
                    </div>
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
