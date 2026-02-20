import { useState, useRef, useEffect } from "react";

export default function SearchableSelect({
    options, // array of { id, label, subtext }
    value, // current selected id
    onChange, // function(id)
    placeholder = "Buscar...",
    className = "",
    inputRef = null
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef(null);

    const selectedOption = options.find(o => o.id === value);

    const filtered = query.trim() === ""
        ? options
        : options.filter(o =>
            (o.label || "").toLowerCase().includes(query.toLowerCase()) ||
            (o.subtext || "").toLowerCase().includes(query.toLowerCase())
        ).slice(0, 50);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleKeyDown = (e) => {
        if (!open) {
            if (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ") {
                e.preventDefault();
                setOpen(true);
            }
            return;
        }

        if (e.key === "Escape") {
            setOpen(false);
            inputRef?.current?.blur();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[highlightedIndex]) {
                onChange(filtered[highlightedIndex].id);
                setOpen(false);
                setQuery("");
            }
        }
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <input
                ref={inputRef}
                type="text"
                className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2.5 text-xs font-bold text-white outline-none focus:border-[#e85d04] placeholder-zinc-500"
                placeholder={selectedOption ? selectedOption.label : placeholder}
                value={open ? query : (selectedOption ? selectedOption.label : "")}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                    setHighlightedIndex(0);
                }}
                onFocus={() => {
                    setOpen(true);
                    setQuery("");
                    setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
            />

            {open && (
                <div className="absolute z-[60] top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-zinc-800/80 rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.8)] max-h-60 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="p-3 text-xs text-zinc-500 text-center font-bold">Sin resultados</div>
                    ) : (
                        filtered.map((opt, i) => (
                            <div
                                key={opt.id}
                                className={`p-2.5 cursor-pointer text-xs flex justify-between items-center border-b border-zinc-800/50 last:border-0 ${i === highlightedIndex ? "bg-[#e85d04] text-white" : "text-zinc-300 hover:bg-zinc-800/70"}`}
                                onClick={() => {
                                    onChange(opt.id);
                                    setOpen(false);
                                    setQuery("");
                                }}
                                onMouseEnter={() => setHighlightedIndex(i)}
                            >
                                <div className="font-bold truncate">{opt.label}</div>
                                {opt.subtext && <div className={`text-[10px] ml-2 shrink-0 ${i === highlightedIndex ? "text-white/80" : "text-zinc-500 font-mono"}`}>{opt.subtext}</div>}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
