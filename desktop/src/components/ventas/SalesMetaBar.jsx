export default function SalesMetaBar({
  draft,
  vendedoresActivos,
  listaActiva,
  priceLists,
  onSellerChange,
  onPriceListChange,
  readOnly = false,
}) {
  const lightSelectStyle = { colorScheme: "light" };
  const lightOptionStyle = { color: "#18181b", backgroundColor: "#ffffff" };

  return (
    <div className="bg-[#ededee] border border-[#d1d1d4] rounded-xl p-2.5 grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
      <div>
        <label className="text-[9px] text-zinc-600 uppercase font-black tracking-wide mb-1 block">
          Comprobante
        </label>
        <div className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-xs md:text-sm font-black text-[#d97706] min-h-[38px] flex items-center">
          {draft.invoiceType}
        </div>
      </div>
      <div>
        <label className="text-[9px] text-zinc-600 uppercase font-black tracking-wide mb-1 block">
          Vendedor
        </label>
        <select
          className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-xs md:text-sm font-semibold text-zinc-800 outline-none focus:border-[#d97706]"
          style={lightSelectStyle}
          value={draft.sellerId}
          onChange={(event) => onSellerChange(event.target.value)}
          disabled={readOnly}
        >
          {vendedoresActivos.map((user) => (
            <option key={user.id} value={user.id} style={lightOptionStyle}>
              {String(user.full_name || user.fullName || user.username || "SIN NOMBRE").toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[9px] text-zinc-600 uppercase font-black tracking-wide mb-1 block">
          Cond. Pago / Lista
        </label>
        <select
          className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-xs md:text-sm font-semibold text-zinc-800 outline-none focus:border-[#d97706]"
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
      <div>
        <label className="text-[9px] text-zinc-600 uppercase font-black tracking-wide mb-1 block">
          Fecha
        </label>
        <div className="w-full px-3 py-2 text-xs md:text-sm text-zinc-700 font-semibold flex items-center h-[38px] bg-white border border-[#cfcfd4] rounded-lg">
          {new Date().toLocaleDateString("es-AR")}
        </div>
      </div>
    </div>
  );
}
