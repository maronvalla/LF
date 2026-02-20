import { useState, useEffect, useRef } from "react";

export default function ProductSearchModal({ products, onClose, onSelect }) {
    const [search, setSearch] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);

    // Filter products
    const filtered = search.trim() === ""
        ? products.slice(0, 100)
        : products.filter(p =>
            (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
            (p.sku || "").toLowerCase().includes(search.toLowerCase())
        ).slice(0, 100);

    useEffect(() => {
        // Auto focus the input when modal opens
        setTimeout(() => inputRef.current?.focus(), 50);
    }, []);

    // Reset selection when search changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [search]);

    const handleKeyDown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[selectedIndex]) {
                onSelect(filtered[selectedIndex]);
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div
                className="bg-[#121212] border border-zinc-800/80 rounded-2xl w-full max-w-5xl shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col h-[600px] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onKeyDown={handleKeyDown}
            >
                {/* Header */}
                <div className="bg-[#1a1a1a] px-6 py-4 border-b border-zinc-800/80 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-[#e85d04] tracking-tight flex items-center gap-2">
                        <span className="text-2xl">🔍</span> Búsqueda de Artículos
                    </h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1 bg-zinc-800/50 hover:bg-zinc-700/50 rounded">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search Bar */}
                <div className="p-4 bg-[#151515] border-b border-zinc-800/80 flex items-center gap-4">
                    <label className="text-xs font-black uppercase tracking-widest text-zinc-400 whitespace-nowrap">Artículo:</label>
                    <input
                        ref={inputRef}
                        type="text"
                        className="flex-1 bg-[#1a1a1a] border border-zinc-800/80 rounded-lg p-3 text-lg font-bold text-white outline-none focus:border-[#e85d04] placeholder-zinc-600 transition-colors"
                        placeholder="Tipeá descripción o código..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-auto bg-[#121212] relative">
                    <table className="w-full text-xs text-left select-none">
                        <thead className="text-[10px] uppercase text-zinc-500 tracking-widest border-b border-zinc-800/80 sticky top-0 bg-[#151515] z-10 shadow-md">
                            <tr>
                                <th className="px-4 py-3 font-black w-24">Código</th>
                                <th className="px-4 py-3 font-black">Descripción</th>
                                <th className="px-4 py-3 font-black w-32">Marca/Rubro</th>
                                <th className="px-4 py-3 font-black w-24 text-right">Stock (Local)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="text-center py-10 text-zinc-600 font-bold uppercase tracking-widest">
                                        No se encontraron artículos
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((p, i) => (
                                    <tr
                                        key={p.id}
                                        className={`cursor-pointer transition-colors border-b border-zinc-800/30 ${i === selectedIndex ? "bg-[#e85d04] text-white" : "text-zinc-300 hover:bg-zinc-800/40"
                                            }`}
                                        onClick={() => onSelect(p)}
                                    >
                                        <td className={`px-4 py-2.5 font-mono font-bold ${i === selectedIndex ? "text-white" : "text-zinc-400"}`}>
                                            {p.sku || p.id}
                                        </td>
                                        <td className="px-4 py-2.5 font-bold text-sm uppercase">
                                            {p.name}
                                        </td>
                                        <td className={`px-4 py-2.5 ${i === selectedIndex ? "text-white/80" : "text-zinc-500"}`}>
                                            {p.category || "-"}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-bold text-[13px]">
                                            {p.stock_local ?? p.stock ?? 0}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="bg-[#151515] border-t border-zinc-800/80 px-6 py-3 flex justify-between items-center text-xs font-black tracking-widest text-zinc-500 uppercase">
                    <span>{filtered.length} Registros</span>
                    <div className="flex gap-4">
                        <span className="flex items-center gap-1.5"><kbd className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded font-mono">↑↓</kbd> Navegar</span>
                        <span className="flex items-center gap-1.5"><kbd className="bg-[#e85d04]/20 text-[#e85d04] px-1.5 py-0.5 rounded font-mono">ENTER</kbd> Seleccionar</span>
                        <span className="flex items-center gap-1.5"><kbd className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded font-mono">ESC</kbd> Salir</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
