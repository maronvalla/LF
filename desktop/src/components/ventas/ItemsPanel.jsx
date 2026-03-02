import { useEffect, useState } from "react";

export default function ItemsPanel({
  codeInputRef,
  search,
  filteredProducts,
  draftItems,
  selectedIdx,
  listaActiva,
  onSearchChange,
  onSearchEnter,
  onOpenProductModal,
  onQtyChange,
  onSelectSuggestion,
  onSelectItem,
  getProductPrice,
  onAddCurrent,
  disabled = false,
}) {
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0);
  const showSuggestions = Boolean(search && filteredProducts.length > 0);

  useEffect(() => {
    setHighlightedSuggestionIndex(0);
  }, [search, filteredProducts.length]);

  return (
    <div className="bg-[#ededee] border border-[#d1d1d4] rounded-xl flex-[1_1_auto] min-h-0 flex flex-col relative shrink overflow-hidden">
      <div className="p-2.5 border-b border-[#d8d8dc] flex flex-col gap-2 shrink-0">
        <div className="text-[16px] md:text-[18px] leading-none font-black text-zinc-900">Carga Rapida de Items</div>
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_auto] gap-2 items-end">
          <div className="relative flex gap-2 w-full items-center">
            <label className="text-[11px] font-black text-zinc-700 uppercase mr-2 shrink-0">Codigo:</label>
            <input
              ref={codeInputRef}
              className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus:border-[#d97706] placeholder:text-zinc-500"
              placeholder="Escanee o tipee el codigo..."
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              disabled={disabled}
              onKeyDown={(event) => {
                if (disabled) return;
                if (event.key === "ArrowDown" && filteredProducts.length > 0) {
                  event.preventDefault();
                  setHighlightedSuggestionIndex((prev) => Math.min(prev + 1, filteredProducts.length - 1));
                } else if (event.key === "ArrowUp" && filteredProducts.length > 0) {
                  event.preventDefault();
                  setHighlightedSuggestionIndex((prev) => Math.max(prev - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  if (showSuggestions && filteredProducts[highlightedSuggestionIndex]) {
                    onSelectSuggestion(filteredProducts[highlightedSuggestionIndex]);
                  } else {
                    onSearchEnter();
                  }
                } else if (event.key === "F5") {
                  event.preventDefault();
                  onOpenProductModal();
                }
              }}
              autoComplete="off"
            />
            <button
              className="bg-white hover:bg-zinc-50 border border-[#caa57f] text-[#b26a1e] rounded-lg w-[38px] h-[38px] flex items-center justify-center transition-colors shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onOpenProductModal}
              title="Busqueda de articulos (F5)"
              type="button"
              disabled={disabled}
            >
              <span className="text-lg font-black">?</span>
            </button>

            {showSuggestions ? (
              <div className="absolute left-[80px] right-[48px] top-[46px] z-50 max-h-60 overflow-auto rounded-lg border border-[#d6d6da] bg-white shadow-2xl">
                {filteredProducts.map((product, index) => (
                  <button
                    key={product.id}
                    className={`flex w-full items-center justify-between border-b border-[#ececf1] px-5 py-3 text-left last:border-b-0 ${
                      index === highlightedSuggestionIndex ? "bg-[#ffe9d2]" : "hover:bg-amber-50"
                    }`}
                    onMouseEnter={() => setHighlightedSuggestionIndex(index)}
                    onClick={() => onSelectSuggestion(product)}
                    type="button"
                  >
                    <div>
                      <div className="text-sm font-bold text-zinc-900 uppercase">{product.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{product.codigo || product.sku || "-"}</div>
                    </div>
                    <div className="text-lg font-bold text-[#d97706]">
                      ${Number(getProductPrice(product, listaActiva) || 0).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            className="w-full xl:w-auto bg-[#f07c0f] hover:bg-[#df6f08] text-white font-black rounded-lg px-4 h-[38px] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onAddCurrent}
            type="button"
            disabled={disabled}
          >
            + Agregar
          </button>

          <button
            className="w-full xl:w-auto bg-white hover:bg-zinc-50 text-[#b26a1e] border border-[#caa57f] rounded-lg px-4 h-[38px] transition-colors text-[11px] md:text-xs font-black uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onOpenProductModal}
            type="button"
            disabled={disabled}
          >
            Buscar Producto (F3)
          </button>
        </div>

      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[11px] md:text-xs text-left min-w-[520px]">
          <thead className="text-[9px] uppercase text-zinc-600 tracking-wide bg-[#f5f5f6] border-b border-[#d8d8dc] sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2.5 font-black w-16">CANT</th>
              <th className="px-3 py-2.5 font-black w-28">CODIGO</th>
              <th className="px-3 py-2.5 font-black">DESCRIPCION</th>
              <th className="px-3 py-2.5 font-black w-24 text-right">PRECIO</th>
              <th className="px-3 py-2.5 font-black w-16 text-center">DTO%</th>
              <th className="px-3 py-2.5 font-black w-24 text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {draftItems.map((item, idx) => (
              <tr
                key={`${item.productId}-${idx}`}
                onClick={() => onSelectItem(idx)}
                className={`border-b border-[#e5e5e8] cursor-pointer ${selectedIdx === idx ? "bg-[#ffe9d2]" : "hover:bg-[#f8f8f9]"}`}
              >
                <td className="px-3 py-2.5 text-zinc-800 font-medium">{item.qty}</td>
                <td className="px-3 py-2.5 text-zinc-600">{item.codigo || "-"}</td>
                <td className="px-3 py-2.5 font-semibold text-zinc-900 uppercase">{item.name}</td>
                <td className="px-3 py-2.5 text-right text-zinc-700">${Number(item.unitPrice).toFixed(2)}</td>
                <td className="px-3 py-2.5 text-center text-zinc-500">{Number(item.discount || 0).toFixed(0)}</td>
                <td className="px-3 py-2.5 text-right font-bold text-zinc-900">
                  ${(Number(item.qty) * Number(item.unitPrice)).toFixed(2)}
                </td>
              </tr>
            ))}
            {!draftItems.length ? (
              <tr className="hover:bg-transparent">
                <td colSpan={6} className="text-center py-6 text-zinc-400 focus:outline-none" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
