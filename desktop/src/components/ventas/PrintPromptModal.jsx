export default function PrintPromptModal({
  title,
  lines,
  availablePrinters,
  selectedPrinter,
  onPrinterChange,
  onCancel,
  onConfirm,
}) {
  const classifyLine = (line) => {
    const raw = String(line ?? "");
    const trimmed = raw.trim();
    const leadingSpaces = raw.match(/^\s+/)?.[0]?.length || 0;
    if (!trimmed) return "min-h-[4px]";
    if (/^[-.]{6,}$/.test(trimmed)) return "text-center tracking-[0.18em] text-[0.78em] leading-none text-zinc-500 my-1";
    if (/^TOTAL\b/i.test(trimmed)) return "font-black text-[1.08em] mt-2";
    if (/^\d+\s*x\s*\$/.test(trimmed)) return "font-bold text-zinc-900";
    if (leadingSpaces > 0) return "text-center tracking-[0.04em]";
    if (!trimmed.includes(":") && trimmed === trimmed.toUpperCase() && trimmed.length > 6) {
      return "font-bold mt-1";
    }
    return "";
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-xl border border-zinc-800 bg-[#121212] p-5 space-y-4">
        <div className="text-lg font-black uppercase tracking-wider text-[#e85d04]">{title}</div>
        <div className="text-sm text-zinc-300">Vista previa y confirmacion de impresion</div>
        <div>
          <label className="text-[10px] uppercase font-bold text-zinc-500">Impresora</label>
          <select className="input mt-1" value={selectedPrinter} onChange={(event) => onPrinterChange(event.target.value)}>
            {!availablePrinters.length ? <option value="">Predeterminada del sistema</option> : null}
            {availablePrinters.map((printer) => (
              <option key={printer.name} value={printer.name}>
                {printer.displayName || printer.name}
              </option>
            ))}
          </select>
        </div>
        <div className="border border-zinc-800 rounded-lg bg-white text-black p-3 max-h-80 overflow-auto">
          <div className="mx-auto w-[58mm] font-['Segoe_UI',Arial,sans-serif] text-[11px] leading-[1.18] font-semibold">
            {lines.map((line, idx) => {
              const raw = String(line ?? "");
              const sepIdx = raw.indexOf("\x1e");
              if (sepIdx >= 0) {
                return (
                  <div key={`${raw}-${idx}`} className="flex justify-between w-full gap-1">
                    <span className="overflow-hidden text-ellipsis min-w-0">{raw.slice(0, sepIdx)}</span>
                    <span className="shrink-0">{raw.slice(sepIdx + 1)}</span>
                  </div>
                );
              }
              return (
                <div key={`${raw}-${idx}`} className={`whitespace-pre-wrap break-words ${classifyLine(line)}`}>
                  {raw.trim() || " "}
                </div>
              );
            })}
          </div>
        </div>
        <div className="text-xs text-zinc-500">
          Atajos: <span className="font-black text-zinc-300">Y</span> = SI, <span className="font-black text-zinc-300">N</span> = NO
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-muted" onClick={onCancel}>
            No (N)
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Si (Y)
          </button>
        </div>
      </div>
    </div>
  );
}
