import React, { useState, useEffect } from "react";

export default function PaymentModal({ total, onClose, onConfirm }) {
  const [method, setMethod] = useState("EFECTIVO");
  const [cashGiven, setCashGiven] = useState("");
  const [mixedCash, setMixedCash] = useState("");
  const [mixedTransfer, setMixedTransfer] = useState("");

  // Calcular vuelto para efectivo
  const change = method === "EFECTIVO" && cashGiven ? Number(cashGiven) - total : 0;

  // Validar si la suma mixta da el total exacto
  const isMixedValid = method === "MIXTO" && (Number(mixedCash) + Number(mixedTransfer) === total);

  // Habilitar o deshabilitar el botón de confirmar
  const canConfirm = 
    method === "TRANSFERENCIA" || 
    (method === "EFECTIVO" && Number(cashGiven) >= total) || 
    isMixedValid;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canConfirm) return;

    onConfirm({
      paymentMethod: method,
      cashAmount: method === "MIXTO" ? Number(mixedCash) : (method === "EFECTIVO" ? total : 0),
      transferAmount: method === "MIXTO" ? Number(mixedTransfer) : (method === "TRANSFERENCIA" ? total : 0),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-graphite-950 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-xl font-black text-burnt-500 mb-4 uppercase text-center">Confirmar Cobro</h2>
        
        <div className="text-center mb-6">
          <div className="text-sm text-zinc-500 uppercase font-bold">Total a Pagar</div>
          <div className="text-4xl font-mono text-white font-black">${total.toFixed(2)}</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-500 uppercase font-bold">Método de Pago</label>
            <select 
              className="input w-full mt-1 font-bold"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="EFECTIVO">EFECTIVO</option>
              <option value="TRANSFERENCIA">TRANSFERENCIA</option>
              <option value="MIXTO">MIXTO</option>
            </select>
          </div>

          {method === "EFECTIVO" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 uppercase font-bold">Abona con $</label>
                <input 
                  type="number" 
                  className="input w-full mt-1 text-lg font-mono"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="bg-zinc-900 p-3 rounded border border-zinc-800 flex justify-between items-center">
                <span className="text-sm uppercase font-bold text-zinc-400">Vuelto:</span>
                <span className={`text-xl font-mono font-black ${change >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  ${Math.max(0, change).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {method === "MIXTO" && (
            <div className="grid grid-cols-2 gap-3 bg-zinc-900/50 p-3 rounded border border-zinc-800">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Efectivo</label>
                <input 
                  type="number" 
                  className="input w-full mt-1"
                  value={mixedCash}
                  onChange={(e) => setMixedCash(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Transferencia</label>
                <input 
                  type="number" 
                  className="input w-full mt-1"
                  value={mixedTransfer}
                  onChange={(e) => setMixedTransfer(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              {!isMixedValid && mixedCash && mixedTransfer && (
                <div className="col-span-2 text-xs text-rose-500 text-center font-bold">
                  La suma debe dar exactamente ${total.toFixed(2)}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn bg-zinc-800 hover:bg-zinc-700 w-full">
              Cancelar
            </button>
            <button type="submit" disabled={!canConfirm} className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}