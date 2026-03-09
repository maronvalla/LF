import { Fragment } from "react";
import SignaturePad from "./SignaturePad";

export default function ControlModal({
  isOpen,
  isDark,
  onClose,
  controlStep,
  setControlStep,
  consolidatedSections,
  checklistByProduct,
  setChecklistByProduct,
  checklistDoneCount,
  consolidated,
  allChecklistDone,
  allPickPlanValid,
  cashierName,
  setCashierName,
  cashierSignature,
  setCashierSignature,
  driverName,
  setDriverName,
  driverSignature,
  setDriverSignature,
  savingControl,
  onSave,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-zinc-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div
        className={`w-full max-w-5xl border rounded-2xl p-5 md:p-8 space-y-6 my-auto shadow-xl ${
          isDark ? "bg-[#121212] border-zinc-800" : "bg-white border-zinc-200"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="text-base md:text-lg font-black uppercase text-[#e85d04] tracking-tight">
            Control Secuencial de Consolidado
          </div>
          <button
            className={`btn w-full sm:w-auto ${
              isDark
                ? "btn-muted"
                : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200"
            }`}
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[10px] md:text-xs font-black uppercase">
          {["checklist", "cashier", "driver"].map((step, i) => (
            <div
              key={step}
              className={`p-2.5 rounded-lg flex items-center justify-center transition-colors ${
                controlStep === step
                  ? "bg-[#e85d04] text-white shadow-md"
                  : isDark
                  ? "bg-zinc-900 text-zinc-400"
                  : "bg-zinc-100 text-zinc-500 border border-zinc-200"
              }`}
            >
              {i + 1}. {step === "checklist" ? "Checklist" : step === "cashier" ? "Firma Cajero" : "Firma Chofer"}
            </div>
          ))}
        </div>

        {controlStep === "checklist" ? (
          <div className="space-y-4">
            <div className={`text-sm font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              Marcar con tilde la mercaderia verificada ({checklistDoneCount}/{consolidated.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-2 pb-2">
              {consolidatedSections.map((section) => (
                <div key={`section-check-${section.key}`} className="space-y-3">
                  <div
                    className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-[0.16em] ${
                      isDark
                        ? "bg-zinc-900 text-[#ffb36c]"
                        : "bg-[#fff7f1] text-[#b45309] border border-[#f5d0a9]"
                    }`}
                  >
                    {section.label}
                  </div>
                  {section.items.map((row) => (
                    <label
                      key={row.product_id}
                      className={`flex items-center gap-3 border rounded-xl p-3.5 cursor-pointer hover:border-[#e85d04]/50 transition-all shadow-sm ${
                        isDark
                          ? "bg-zinc-900 border-zinc-800 text-zinc-200"
                          : "bg-white border-zinc-200 text-zinc-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5 md:h-4 md:w-4 accent-[#e85d04] cursor-pointer"
                        checked={Boolean(checklistByProduct[row.product_id])}
                        onChange={(e) =>
                          setChecklistByProduct((prev) => ({
                            ...prev,
                            [row.product_id]: e.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm md:text-xs font-bold line-clamp-2 leading-tight">
                        {row.name}
                      </span>
                      <span
                        className={`ml-auto text-sm font-black ${
                          isDark ? "text-emerald-400" : "text-emerald-500"
                        }`}
                      >
                        {Boolean(checklistByProduct[row.product_id]) ? "OK" : ""}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-3">
              <button
                className="btn btn-primary w-full sm:w-auto py-3 md:py-2.5 px-6 text-sm font-bold shadow-md"
                disabled={!allChecklistDone || !allPickPlanValid}
                onClick={() => setControlStep("cashier")}
              >
                Confirmar checklist
              </button>
            </div>
          </div>
        ) : null}

        {controlStep === "cashier" ? (
          <div className="space-y-5">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">
                Nombre Cajero
              </label>
              <input
                className={`input mt-1.5 w-full focus:border-[#e85d04] ${
                  isDark
                    ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                    : "bg-zinc-50 border-zinc-200 text-zinc-900"
                }`}
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
              />
            </div>
            <SignaturePad
              label="Firma Cajero"
              initialDataUrl={cashierSignature}
              onChange={setCashierSignature}
            />
            <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4">
              <button
                className={`btn w-full sm:w-auto py-3 md:py-2 ${
                  isDark
                    ? "btn-muted"
                    : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200"
                }`}
                onClick={() => setControlStep("checklist")}
              >
                Volver
              </button>
              <button
                className="btn btn-primary w-full sm:w-auto py-3 md:py-2 font-bold px-6 shadow-md"
                disabled={!cashierName.trim() || !cashierSignature}
                onClick={() => setControlStep("driver")}
              >
                Continuar a firma chofer
              </button>
            </div>
          </div>
        ) : null}

        {controlStep === "driver" ? (
          <div className="space-y-5">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">
                Nombre Chofer
              </label>
              <input
                className={`input mt-1.5 w-full focus:border-[#e85d04] ${
                  isDark
                    ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                    : "bg-zinc-50 border-zinc-200 text-zinc-900"
                }`}
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
            </div>
            <SignaturePad
              label="Firma Chofer"
              initialDataUrl={driverSignature}
              onChange={setDriverSignature}
            />
            <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4">
              <button
                className={`btn w-full sm:w-auto py-3 md:py-2 ${
                  isDark
                    ? "btn-muted"
                    : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200"
                }`}
                onClick={() => setControlStep("cashier")}
              >
                Volver
              </button>
              <button
                className="btn btn-primary w-full sm:w-auto py-3 md:py-2 font-bold px-6 shadow-md"
                disabled={savingControl || !driverName.trim() || !driverSignature}
                onClick={onSave}
              >
                {savingControl ? "Guardando..." : "Guardar control firmado"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
