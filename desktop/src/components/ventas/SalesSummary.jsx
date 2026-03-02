export default function SalesSummary({
  subtotal,
  itemCount,
  selectedIdx,
  hasItems,
  onRemoveSelected,
  onSubmitBudget,
  onPrimaryAction,
  primaryLabel = "Registrar venta",
  disableRemove = false,
  disableBudget = false,
}) {
  return (
    <div className="bg-[#ededee] border border-[#d1d1d4] rounded-xl px-3 py-2 shrink-0">
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 items-center">
          <div>
            <div className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Subtotal Neto</div>
            <div className="text-sm md:text-base font-bold text-zinc-900">${subtotal.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Descuento Global</div>
            <div className="text-sm md:text-base font-bold text-zinc-900">$0.00</div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Items</div>
            <div className="text-sm md:text-base font-bold text-[#d97706]">{itemCount}</div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Total General</div>
            <div className="text-xl md:text-2xl font-black text-zinc-900">${subtotal.toFixed(2)}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row lg:justify-end gap-2 lg:min-w-[420px]">
          {selectedIdx >= 0 && hasItems && !disableRemove ? (
            <button
              className="bg-white hover:bg-zinc-50 text-rose-600 border border-rose-300 font-black px-3 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase"
              onClick={onRemoveSelected}
            >
              Quitar Seleccion
            </button>
          ) : null}
          <button
            className="bg-white hover:bg-zinc-50 text-[#b26a1e] border border-[#caa57f] font-black px-4 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onSubmitBudget}
            disabled={!hasItems || disableBudget}
          >
            Presupuesto
          </button>
          <button
            className="bg-[#f07c0f] hover:bg-[#df6f08] text-white font-black px-4 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onPrimaryAction}
            disabled={!hasItems}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
