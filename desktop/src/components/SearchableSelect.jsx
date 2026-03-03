import { useState, useRef, useEffect } from "react";

export default function SearchableSelect({
    options, // array of { id, label, subtext }
    value, // current selected id
    onChange, // function(id)
    placeholder = "Buscar...",
    className = "",
    inputRef = null,
    inputClassName = "",
    dropdownClassName = "",
    optionClassName = "",
    freeTextValue = "",
    onFreeTextChange = null,
    theme = "dark",
    forceOpenSignal = 0,
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef(null);
    const dropdownRef = useRef(null);

    const selectedOption = options.find(o => o.id === value);
    const displayValue = open
        ? query
        : (selectedOption ? selectedOption.label : (freeTextValue || ""));

    const filtered = query.trim() === ""
        ? options
        : options.filter(o =>
            (o.label || "").toLowerCase().includes(query.toLowerCase()) ||
            (o.subtext || "").toLowerCase().includes(query.toLowerCase())
        ).slice(0, 50);

    const normalizedQuery = String(query || "").trim();
    const freeTextEnabled = Boolean(onFreeTextChange && normalizedQuery);
    const exactMatchExists = filtered.some(
        (opt) => String(opt.label || "").trim().toLowerCase() === normalizedQuery.toLowerCase()
    );
    const showFreeTextOption = freeTextEnabled && !exactMatchExists;
    const totalItems = filtered.length + (showFreeTextOption ? 1 : 0);
    const isLight = theme === "light";
    const dropdownBaseClass = isLight
        ? "bg-white border-[#cfcfd4] shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
        : "bg-[#1a1a1a] border-zinc-800/80 shadow-[0_10px_40px_rgba(0,0,0,0.8)]";
    const idleOptionClass = isLight
        ? "text-zinc-800 hover:bg-amber-50"
        : "text-zinc-300 hover:bg-zinc-800/70";
    const activeOptionClass = isLight
        ? "bg-[#e85d04] text-white"
        : "bg-[#e85d04] text-white";
    const idleSubtextClass = isLight ? "text-zinc-500 font-mono" : "text-zinc-500 font-mono";
    const activeSubtextClass = isLight ? "text-white/85" : "text-white/80";
    const emptyClass = isLight ? "text-zinc-500" : "text-zinc-500";

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!open || !dropdownRef.current) return;
        const highlightedNode = dropdownRef.current.querySelector(`[data-option-index="${highlightedIndex}"]`);
        highlightedNode?.scrollIntoView({ block: "nearest" });
    }, [highlightedIndex, open]);

    useEffect(() => {
        if (!forceOpenSignal) return;
        inputRef?.current?.focus();
        setOpen(true);
        setQuery("");
        setHighlightedIndex(0);
    }, [forceOpenSignal, inputRef]);

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
            setHighlightedIndex(prev => (prev < totalItems - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (showFreeTextOption && highlightedIndex === 0) {
                onChange("");
                onFreeTextChange(query);
                setOpen(false);
                return;
            }

            const optionIndex = showFreeTextOption ? highlightedIndex - 1 : highlightedIndex;
            if (filtered[optionIndex]) {
                onChange(filtered[optionIndex].id);
                if (onFreeTextChange) onFreeTextChange(filtered[optionIndex].label);
                setOpen(false);
                setQuery("");
            } else if (onFreeTextChange) {
                onChange("");
                onFreeTextChange(query);
                setOpen(false);
            }
        }
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <input
                ref={inputRef}
                type="text"
                className={`w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2.5 text-xs font-bold text-white outline-none focus:border-[#e85d04] placeholder-zinc-500 ${inputClassName}`}
                placeholder={selectedOption ? selectedOption.label : placeholder}
                value={displayValue}
                onChange={(e) => {
                    setQuery(e.target.value);
                    if (onFreeTextChange) {
                        onChange("");
                        onFreeTextChange(e.target.value);
                    }
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
                <div
                    ref={dropdownRef}
                    className={`absolute z-[60] top-full left-0 right-0 mt-1 border rounded-lg max-h-60 overflow-y-auto ${dropdownBaseClass} ${dropdownClassName}`}
                >
                    {totalItems === 0 ? (
                        <div className={`p-3 text-xs text-center font-bold ${emptyClass}`}>Sin resultados</div>
                    ) : (
                        <>
                            {showFreeTextOption ? (
                                <div
                                    data-option-index={0}
                                    className={`p-2.5 cursor-pointer text-xs flex justify-between items-center border-b ${isLight ? "border-[#ececf1]" : "border-zinc-800/50"} ${highlightedIndex === 0 ? activeOptionClass : idleOptionClass} ${optionClassName}`}
                                    onClick={() => {
                                    onChange("");
                                    onFreeTextChange(query);
                                    setOpen(false);
                                    setQuery("");
                                }}
                            >
                                    <div className="font-bold truncate">Usar "{query}" como cliente de mostrador</div>
                                </div>
                            ) : null}
                            {filtered.map((opt, i) => (
                            (() => {
                                const optionHighlightedIndex = showFreeTextOption ? i + 1 : i;
                                return (
                            <div
                                key={opt.id}
                                data-option-index={optionHighlightedIndex}
                                className={`p-2.5 cursor-pointer text-xs flex justify-between items-center border-b ${isLight ? "border-[#ececf1]" : "border-zinc-800/50"} last:border-0 ${optionHighlightedIndex === highlightedIndex ? activeOptionClass : idleOptionClass} ${optionClassName}`}
                                onClick={() => {
                                    onChange(opt.id);
                                    if (onFreeTextChange) onFreeTextChange(opt.label);
                                    setOpen(false);
                                    setQuery("");
                                }}
                                onMouseEnter={() => setHighlightedIndex(optionHighlightedIndex)}
                            >
                                <div className="font-bold truncate">{opt.label}</div>
                                {opt.subtext && <div className={`text-[10px] ml-2 shrink-0 ${optionHighlightedIndex === highlightedIndex ? activeSubtextClass : idleSubtextClass}`}>{opt.subtext}</div>}
                            </div>
                                );
                            })()
                        ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
