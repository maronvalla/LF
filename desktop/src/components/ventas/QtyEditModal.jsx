import { useEffect, useRef } from "react";

export default function QtyEditModal({
  value,
  onChange,
  onCancel,
  onApply,
  title = "Editar cantidad",
  label = "Nueva cantidad",
  min = "1",
  step = "1",
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#121212] p-4 space-y-3">
        <div className="text-sm font-black uppercase tracking-wider text-[#e85d04]">{title}</div>
        <div>
          <label className="text-[10px] uppercase font-bold text-zinc-500">{label}</label>
          <input
            ref={inputRef}
            className="input mt-1 text-white placeholder:text-zinc-500"
            type="number"
            min={min}
            step={step}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onApply();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-muted" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={onApply}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
