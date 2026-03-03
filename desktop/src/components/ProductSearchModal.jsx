import { useEffect, useRef, useState } from "react";
import { productMatchesSearch } from "../utils/productSearch";

const getProductLocalStock = (product) => Number(product?.stock_local ?? product?.stockLocal ?? 0);
const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export default function ProductSearchModal({ products, onClose, onSelect }) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const tableContainerRef = useRef(null);

  const filtered =
    search.trim() === ""
      ? products
          .slice()
          .sort((a, b) => {
            const stockDiff = getProductLocalStock(b) - getProductLocalStock(a);
            if (stockDiff !== 0) return stockDiff;
            return String(a.name || "").localeCompare(String(b.name || ""));
          })
          .slice(0, 100)
      : products
          .filter((product) => productMatchesSearch(product, search))
          .sort((a, b) => {
            const normalizedQuery = normalizeSearchText(search);
            const aStock = getProductLocalStock(a);
            const bStock = getProductLocalStock(b);
            const aAvailable = aStock > 0 ? 1 : 0;
            const bAvailable = bStock > 0 ? 1 : 0;
            if (aAvailable !== bAvailable) return bAvailable - aAvailable;

            const aName = normalizeSearchText(a.name);
            const bName = normalizeSearchText(b.name);
            const aStartsWithName = aName.startsWith(normalizedQuery) ? 1 : 0;
            const bStartsWithName = bName.startsWith(normalizedQuery) ? 1 : 0;
            if (aStartsWithName !== bStartsWithName) return bStartsWithName - aStartsWithName;

            const aIncludesName = aName.includes(normalizedQuery) ? 1 : 0;
            const bIncludesName = bName.includes(normalizedQuery) ? 1 : 0;
            if (aIncludesName !== bIncludesName) return bIncludesName - aIncludesName;

            return aName.localeCompare(bName);
          })
          .slice(0, 100);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (!tableContainerRef.current) return;
    const activeRow = tableContainerRef.current.querySelector(`tr[data-index="${selectedIndex}"]`);
    activeRow?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex]);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="flex h-[600px] max-h-[85vh] w-full max-w-[980px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-900/10 animate-in zoom-in-95 duration-200"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-6 py-4">
          <h2 className="flex items-center gap-3 text-lg font-bold tracking-tight text-zinc-800">
            <svg className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span>Busqueda de Articulos</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-2 border-b border-zinc-200 bg-white px-6 py-5">
          <div className="relative flex items-center">
            <input
              ref={inputRef}
              type="text"
              className="w-full rounded-xl border-2 border-zinc-200 bg-zinc-50/50 px-4 py-3 pl-12 text-base font-semibold text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 placeholder:font-medium focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10"
              placeholder="Tipea descripcion, codigo o SKU..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <svg className="absolute left-4 h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        <div ref={tableContainerRef} className="flex-1 overflow-auto bg-zinc-50/50 p-6">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-100/80 text-xs font-bold uppercase tracking-wider text-zinc-600 backdrop-blur-md">
                <tr>
                  <th className="w-32 px-5 py-3.5">Codigo / SKU</th>
                  <th className="px-5 py-3.5">Descripcion</th>
                  <th className="w-32 px-5 py-3.5 text-right">P. Minorista</th>
                  <th className="w-32 px-5 py-3.5 text-right">P. Mayorista</th>
                  <th className="w-32 px-5 py-3.5 text-right">Stock (Local)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-sm font-semibold uppercase tracking-wide text-zinc-400"
                    >
                      No se encontraron articulos
                    </td>
                  </tr>
                ) : (
                  filtered.map((product, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <tr
                        key={product.id}
                        data-index={index}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-amber-50 shadow-[inset_2px_0_0_#d97706]"
                            : "bg-white hover:bg-zinc-50"
                        }`}
                        onClick={() => onSelect(product)}
                      >
                        <td
                          className={`px-5 py-3 font-mono text-xs font-bold ${
                            isSelected ? "text-amber-900" : "text-zinc-500"
                          }`}
                        >
                          {product.codigo || product.sku || product.id}
                        </td>
                        <td
                          className={`px-5 py-3 font-bold uppercase ${
                            isSelected ? "text-amber-900" : "text-zinc-800"
                          }`}
                        >
                          {product.name}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-medium ${
                            isSelected ? "text-amber-700" : "text-emerald-600"
                          }`}
                        >
                          <span className="font-bold">
                            ${Number(product.priceMinorista || 0).toLocaleString()}
                          </span>
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-medium ${
                            isSelected ? "text-amber-700" : "text-emerald-600"
                          }`}
                        >
                          {product.priceMayorista != null && product.priceMayorista > 0 ? (
                            <span className="font-bold">
                              ${Number(product.priceMayorista).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-zinc-400">-</span>
                          )}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-bold xl:text-base ${
                            isSelected ? "text-amber-900" : "text-zinc-700"
                          }`}
                        >
                          {getProductLocalStock(product)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 bg-white px-6 py-4">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
          </span>
          <div className="flex gap-6">
            <span className="flex items-center gap-2 text-xs font-bold text-zinc-500">
              <div className="flex gap-1">
                <kbd className="flex h-5 min-w-[20px] items-center justify-center rounded border border-zinc-300 bg-zinc-100 px-1 font-mono text-[10px] text-zinc-600 shadow-sm">
                  ↑
                </kbd>
                <kbd className="flex h-5 min-w-[20px] items-center justify-center rounded border border-zinc-300 bg-zinc-100 px-1 font-mono text-[10px] text-zinc-600 shadow-sm">
                  ↓
                </kbd>
              </div>
              Navegar
            </span>
            <span className="flex items-center gap-2 text-xs font-bold text-zinc-500">
              <kbd className="flex h-5 min-w-[36px] items-center justify-center rounded border border-amber-300 bg-amber-100 px-1.5 font-mono text-[10px] text-amber-800 shadow-sm">
                ENTER
              </kbd>
              Seleccionar
            </span>
            <span className="flex items-center gap-2 text-xs font-bold text-zinc-500">
              <kbd className="flex h-5 min-w-[28px] items-center justify-center rounded border border-zinc-300 bg-zinc-100 px-1.5 font-mono text-[10px] text-zinc-600 shadow-sm">
                ESC
              </kbd>
              Salir
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
