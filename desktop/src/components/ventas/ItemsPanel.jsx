import { useEffect, useRef, useState } from "react";

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
  onSelectSuggestion,
  onSelectItem,
  getProductPrice,
  onAddCurrent,
  disabled = false,
}) {
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0);
  const rowRefs = useRef([]);
  const showSuggestions = Boolean(search && filteredProducts.length > 0);

  useEffect(() => {
    setHighlightedSuggestionIndex(0);
  }, [search, filteredProducts.length]);

  useEffect(() => {
    if (selectedIdx < 0 || selectedIdx >= draftItems.length) return;
    rowRefs.current[selectedIdx]?.scrollIntoView({ block: "nearest" });
  }, [draftItems.length, selectedIdx]);

  return (
    <div className="bg-[#ededee] border border-[#d1d1d4] rounded-xl flex-[1_1_auto] min-h-0 flex flex-col relative shrink overflow-hidden">
      <div className="p-1 border-b border-[#d8d8dc] flex flex-col gap-1 shrink-0">
        <div className="flex xl:grid xl:grid-cols-[1fr_auto_auto] gap-1 items-stretch">
          <div className="relative flex gap-1 flex-1 items-center">
            <label className="text-[10px] font-black text-zinc-700 uppercase shrink-0">Cod / F5:</label>
            <input
              ref={codeInputRef}
              className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 h-[26px] text-xs font-medium text-zinc-900 outline-none focus:border-[#d97706] placeholder:text-zinc-500"
              placeholder="Escanee o busque..."
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              disabled={disabled}
              onKeyDown={(event) => {
                if (disabled) return;
                if (event.key === "ArrowDown" && showSuggestions && filteredProducts.length > 0) {
                  event.preventDefault();
                  setHighlightedSuggestionIndex((prev) => Math.min(prev + 1, filteredProducts.length - 1));
                } else if (event.key === "ArrowUp" && showSuggestions && filteredProducts.length > 0) {
                  event.preventDefault();
                  setHighlightedSuggestionIndex((prev) => Math.max(prev - 1, 0));
                } else if (event.key === "ArrowDown" && draftItems.length > 0) {
                  event.preventDefault();
                  const nextIndex =
                    selectedIdx >= 0 && selectedIdx < draftItems.length - 1 ? selectedIdx + 1 : 0;
                  onSelectItem(nextIndex);
                } else if (event.key === "ArrowUp" && draftItems.length > 0) {
                  event.preventDefault();
                  const nextIndex =
                    selectedIdx > 0 && selectedIdx < draftItems.length ? selectedIdx - 1 : 0;
                  onSelectItem(nextIndex);
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
              className="bg-white hover:bg-zinc-50 border border-[#caa57f] text-[#b26a1e] rounded w-[26px] h-[26px] flex items-center justify-center transition-colors shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onOpenProductModal}
              title="Busqueda de articulos (F5)"
              type="button"
              disabled={disabled}
            >
              <span className="text-xs font-black">?</span>
            </button>

            {showSuggestions ? (
              <div className="absolute left-[80px] right-[48px] top-[46px] z-50 max-h-60 overflow-auto rounded-lg border border-[#d6d6da] bg-white shadow-2xl">
                {filteredProducts.map((product, index) => (
                  <button
                    key={product.id}
                    className={`flex w-full items-center justify-between border-b border-[#ececf1] px-5 py-3 text-left last:border-b-0 ${index === highlightedSuggestionIndex ? "bg-[#ffe9d2]" : "hover:bg-amber-50"
                      }`}
                    onMouseEnter={() => setHighlightedSuggestionIndex(index)}
                    onClick={() => onSelectSuggestion(product)}
                    type="button"
                  >
                    <div>
                      <div className="text-sm font-bold text-zinc-900 uppercase">{product.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                        <span>{product.codigo || product.sku || "-"}</span>
                        {Number(product.stock_local ?? product.stockLocal ?? 0) > 0 ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">
                            Stock {Number(product.stock_local ?? product.stockLocal ?? 0)}
                          </span>
                        ) : (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700">
                            Sin stock
                          </span>
                        )}
                      </div>
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
            className="bg-[#f07c0f] hover:bg-[#df6f08] text-white font-black rounded px-3 h-[26px] transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            onClick={onAddCurrent}
            type="button"
            disabled={disabled}
          >
            + Agregar
          </button>

          <button
            className="bg-white hover:bg-zinc-50 text-[#b26a1e] border border-[#caa57f] rounded px-2 h-[26px] transition-colors text-[10px] font-black uppercase disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            onClick={onOpenProductModal}
            type="button"
            disabled={disabled}
          >
            Buscar
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[11px] md:text-xs text-left min-w-[520px]">
          <thead className="text-[9px] uppercase text-zinc-600 tracking-wide bg-[#f5f5f6] border-b border-[#d8d8dc] sticky top-0 z-10">
            <tr>
              <th className="px-3 py-1 font-black w-16">CANT</th>
              <th className="px-3 py-1 font-black w-28">CODIGO</th>
              <th className="px-3 py-1 font-black">DESCRIPCION</th>
              <th className="px-3 py-1 font-black w-24 text-right">PRECIO</th>
              <th className="px-3 py-1 font-black w-16 text-center">DTO%</th>
              <th className="px-3 py-1 font-black w-24 text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {draftItems.map((item, idx) => (
              <tr
                key={`${item.productId}-${idx}`}
                ref={(node) => {
                  rowRefs.current[idx] = node;
                }}
                onClick={() => onSelectItem(idx)}
                className={`border-b border-[#e5e5e8] cursor-pointer ${selectedIdx === idx ? "bg-[#ffe9d2]" : "hover:bg-[#f8f8f9]"}`}
              >
                <td className="px-3 py-1 text-zinc-800 font-medium">{item.qty}</td>
                <td className="px-3 py-1 text-zinc-600">{item.codigo || "-"}</td>
                <td className="px-3 py-1 font-semibold text-zinc-900 uppercase">{item.name}</td>
                <td className="px-3 py-1 text-right text-zinc-700">${Number(item.unitPrice).toFixed(2)}</td>
                <td className="px-3 py-1 text-center text-zinc-500">{Number(item.discount || 0).toFixed(0)}</td>
                <td className="px-3 py-1 text-right font-bold text-zinc-900">
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
