export default function PrintPromptModal({
  title,
  lines,
  availablePrinters,
  selectedPrinter,
  onPrinterChange,
  onCancel,
  onConfirm,
}) {
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
          <div className="mx-auto w-[58mm] font-mono text-[11px] leading-tight">
            {lines.map((line, idx) => (
              <div key={`${line}-${idx}`} className="whitespace-pre">
                {line}
              </div>
            ))}
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
