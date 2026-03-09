import React, { useEffect, useState } from "react";

const normalizeMoneyInput = (value) =>
  String(value || "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");

const parseMoneyInput = (value) => {
  const normalized = normalizeMoneyInput(value);
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const closeEnoughMoney = (left, right) => Math.abs(Number(left || 0) - Number(right || 0)) <= 0.01;

export default function PaymentModal({
  total,
  onClose,
  onConfirm,
  title = "Confirmar Cobro",
  confirmLabel = "Confirmar",
  requireCashGiven = true,
  requireProof = true,
  allowCurrentAccount = false,
  allowedMethods = ["EFECTIVO", "TRANSFERENCIA", "MIXTO"],
  initialMethod = "EFECTIVO",
  initialCashAmount = "",
  initialTransferAmount = "",
}) {
  const resolvedAllowedMethods = Array.isArray(allowedMethods) && allowedMethods.length
    ? allowedMethods
    : ["EFECTIVO", "TRANSFERENCIA", "MIXTO"];
  const resolvedInitialMethod = resolvedAllowedMethods.includes(initialMethod)
    ? initialMethod
    : resolvedAllowedMethods[0];

  const [method, setMethod] = useState(resolvedInitialMethod);
  const [cashGiven, setCashGiven] = useState("");
  const [mixedCash, setMixedCash] = useState(String(initialCashAmount || ""));
  const [mixedTransfer, setMixedTransfer] = useState(String(initialTransferAmount || ""));
  const [proofDataUrl, setProofDataUrl] = useState("");
  const [proofName, setProofName] = useState("");

  const whiteInputClass =
    "w-full mt-1 rounded-lg border border-[#d7d7db] bg-white px-3 py-2.5 text-zinc-900 outline-none focus:border-[#d97706] placeholder:text-zinc-400";
  const whiteSelectClass =
    "w-full mt-1 rounded-lg border border-[#d7d7db] bg-white px-3 py-2.5 font-bold text-zinc-900 outline-none focus:border-[#d97706]";
  const lightOptionStyle = { color: "#18181b", backgroundColor: "#ffffff" };
  const lightSelectStyle = { colorScheme: "light" };

  const cashGivenValue = parseMoneyInput(cashGiven);
  const mixedCashValue = parseMoneyInput(mixedCash);
  const mixedTransferValue = parseMoneyInput(mixedTransfer);
  const change = method === "EFECTIVO" && cashGiven ? cashGivenValue - total : 0;
  const isMixedValid =
    method === "MIXTO" && closeEnoughMoney(mixedCashValue + mixedTransferValue, total);
  const transferNeedsProof =
    requireProof && (method === "TRANSFERENCIA" || (method === "MIXTO" && mixedTransferValue > 0));

  const canConfirm =
    method === "TRANSFERENCIA" ||
    method === "CUENTA_CORRIENTE" ||
    (method === "EFECTIVO" && (requireCashGiven ? cashGivenValue >= total : true)) ||
    (method === "MIXTO" && isMixedValid);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    setMethod(resolvedInitialMethod);
    setCashGiven("");
    setMixedCash(String(initialCashAmount || ""));
    setMixedTransfer(String(initialTransferAmount || ""));
    setProofDataUrl("");
    setProofName("");
  }, [resolvedInitialMethod, initialCashAmount, initialTransferAmount]);

  const handleProofChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProofDataUrl(String(reader.result || ""));
      setProofName(file.name || "comprobante");
      event.target.value = "";
    };
    reader.onerror = () => {
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canConfirm) return;

    const efectivoMixto = method === "MIXTO" ? mixedCashValue : 0;
    const transferenciaMixto = method === "MIXTO" ? mixedTransferValue : 0;
    const abonaCon =
      method === "EFECTIVO"
        ? requireCashGiven
          ? cashGivenValue
          : Number(total || 0)
        : 0;
    const [proofHeader, proofBase64 = ""] = String(proofDataUrl || "").split(",");
    const proofMimeType = proofHeader.startsWith("data:")
      ? proofHeader.slice(5).split(";")[0]
      : "";

    onConfirm({
      paymentMethod: method,
      cashAmount: method === "MIXTO" ? efectivoMixto : method === "EFECTIVO" ? total : 0,
      transferAmount:
        method === "MIXTO" ? transferenciaMixto : method === "TRANSFERENCIA" ? total : 0,
      cashGiven: abonaCon,
      changeAmount: method === "EFECTIVO" ? Math.max(0, abonaCon - total) : 0,
      proofImageBase64: proofBase64,
      proofImageMimeType: proofMimeType,
      proofImageName: proofName || null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-graphite-950 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-xl font-black text-burnt-500 mb-4 uppercase text-center">
          {title}
        </h2>

        <div className="text-center mb-6">
          <div className="text-sm text-zinc-500 uppercase font-bold">Total a Pagar</div>
          <div className="text-4xl font-mono text-white font-black">${total.toFixed(2)}</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-500 uppercase font-bold">Metodo de Pago</label>
            <select
              className={whiteSelectClass}
              style={lightSelectStyle}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {resolvedAllowedMethods.includes("EFECTIVO") ? (
                <option value="EFECTIVO" style={lightOptionStyle}>
                  EFECTIVO
                </option>
              ) : null}
              {resolvedAllowedMethods.includes("TRANSFERENCIA") ? (
                <option value="TRANSFERENCIA" style={lightOptionStyle}>
                  TRANSFERENCIA
                </option>
              ) : null}
              {resolvedAllowedMethods.includes("MIXTO") ? (
                <option value="MIXTO" style={lightOptionStyle}>
                  MIXTO
                </option>
              ) : null}
              {allowCurrentAccount && resolvedAllowedMethods.includes("CUENTA_CORRIENTE") ? (
                <option value="CUENTA_CORRIENTE" style={lightOptionStyle}>
                  CUENTA CORRIENTE
                </option>
              ) : null}
            </select>
          </div>

          {method === "EFECTIVO" && (
            <div className="space-y-3">
              {requireCashGiven ? (
                <div>
                  <label className="text-xs text-zinc-500 uppercase font-bold">
                    Abona con $
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className={`${whiteInputClass} text-lg font-mono font-bold`}
                    value={cashGiven}
                    onChange={(e) => setCashGiven(normalizeMoneyInput(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    autoFocus
                  />
                </div>
              ) : (
                <div className="bg-zinc-900 p-3 rounded border border-zinc-800 text-sm text-zinc-300">
                  Cobro en efectivo exacto por ${Number(total || 0).toFixed(2)}
                </div>
              )}
              <div className="bg-zinc-900 p-3 rounded border border-zinc-800 flex justify-between items-center">
                <span className="text-sm uppercase font-bold text-zinc-400">Vuelto:</span>
                <span
                  className={`text-xl font-mono font-black ${
                    change >= 0 ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
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
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={whiteInputClass}
                  value={mixedCash}
                  onChange={(e) => setMixedCash(normalizeMoneyInput(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold">
                  Transferencia
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={whiteInputClass}
                  value={mixedTransfer}
                  onChange={(e) => setMixedTransfer(normalizeMoneyInput(e.target.value))}
                  onFocus={(e) => e.target.select()}
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

          {transferNeedsProof && (
            <div className="space-y-2 rounded border border-zinc-800 bg-zinc-900/50 p-3">
              <label className="text-[10px] text-zinc-500 uppercase font-bold">
                Comprobante de transferencia
              </label>
              <input
                id="payment-proof-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProofChange}
              />
              <div className="flex flex-wrap gap-2">
                <label
                  htmlFor="payment-proof-input"
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-[#caa57f] bg-white px-3 py-2 text-[11px] font-black uppercase text-[#b26a1e] hover:bg-zinc-50"
                >
                  {proofDataUrl ? "Cambiar comprobante" : "Cargar comprobante"}
                </label>
                {proofDataUrl ? (
                  <button
                    type="button"
                    className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-[11px] font-black uppercase text-rose-600 hover:bg-zinc-50"
                    onClick={() => {
                      setProofDataUrl("");
                      setProofName("");
                    }}
                  >
                    Quitar
                  </button>
                ) : null}
              </div>
              {proofName ? <div className="text-xs text-zinc-400">{proofName}</div> : null}
              {proofDataUrl ? (
                <img
                  src={proofDataUrl}
                  alt="Comprobante"
                  className="max-h-40 w-full rounded-lg border border-zinc-800 bg-zinc-950 object-contain"
                />
              ) : (
                <div className="text-xs font-bold text-zinc-400">
                  Opcional. Puedes confirmar ahora y adjuntarlo mas tarde.
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn bg-zinc-800 hover:bg-zinc-700 w-full"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canConfirm}
              className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
