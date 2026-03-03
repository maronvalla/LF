export default function SalesMetaBar({
  draft,
  sellerOptions,
  selectedSellerOption,
  listaActiva,
  priceLists,
  onSellerChange,
  onPriceListChange,
  onInvoiceTypeChange,
  readOnly = false,
}) {
  const lightSelectStyle = { colorScheme: "light" };
  const lightOptionStyle = { color: "#18181b", backgroundColor: "#ffffff" };

  return (
    <div className="bg-[#ededee] border border-[#d1d1d4] rounded flex flex-wrap lg:flex-nowrap gap-2 p-1 px-2 shrink-0">
      <div className="flex-1 min-w-[120px]">
        <label className="text-[9px] text-zinc-600 uppercase font-black tracking-wide mb-0 block">
          Comprobante
        </label>
        <input
          className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 text-xs font-black text-[#d97706] h-[24px] outline-none focus:border-[#d97706]"
          value={draft.invoiceType}
          onChange={(event) => onInvoiceTypeChange(event.target.value)}
          disabled={readOnly}
        />
      </div>
      <div className="flex-1 min-w-[120px]">
        <label className="text-[9px] text-zinc-600 uppercase font-black tracking-wide mb-0 block">
          Vendedor
        </label>
        <select
          className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 text-xs font-semibold text-zinc-800 h-[24px] outline-none focus:border-[#d97706]"
          style={lightSelectStyle}
          value={selectedSellerOption}
          onChange={(event) => onSellerChange(event.target.value)}
          disabled={readOnly}
        >
          {sellerOptions.map((option) => (
            <option key={option.key} value={option.key} style={lightOptionStyle}>
              {String(option.label || "SIN NOMBRE").toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[150px]">
        <label className="text-[9px] text-zinc-600 uppercase font-black tracking-wide mb-0 block">
          Cond. Pago / Lista
        </label>
        <select
          className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 text-xs font-semibold text-zinc-800 h-[24px] outline-none focus:border-[#d97706]"
          style={lightSelectStyle}
          value={listaActiva}
          onChange={(event) => onPriceListChange(event.target.value)}
          disabled={readOnly}
        >
          {(priceLists || []).map((row) => (
            <option key={row.key} value={row.key} style={lightOptionStyle}>
              {`EFECTIVO (${String(row.label || row.key).toUpperCase()})`}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[100px]">
        <label className="text-[9px] text-zinc-600 uppercase font-black tracking-wide mb-0 block">
          Fecha
        </label>
        <div className="w-full px-2 py-0 text-xs text-zinc-700 font-semibold flex items-center h-[24px] bg-white border border-[#cfcfd4] rounded">
          {new Date().toLocaleDateString("es-AR")}
        </div>
      </div>
    </div>
  );
}
