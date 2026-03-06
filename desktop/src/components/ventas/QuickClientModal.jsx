export default function QuickClientModal({
  draft,
  saving,
  addressSearch,
  addressOptions,
  addressLoading,
  addressDropdownOpen,
  onClose,
  onChange,
  onAddressFocus,
  onAddressSearchChange,
  onAddressSelect,
  onUseAddressReference,
  onOpenMapPicker,
  onSubmit,
}) {
  const modalInputClass =
    "mt-1 w-full rounded-lg border border-zinc-800 bg-[#1a1a1a] px-3 py-2.5 text-sm text-white outline-none focus:border-[#e85d04] placeholder:text-zinc-500";

  return (
    <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-[#121212] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-black uppercase tracking-wider text-[#e85d04]">Registrar Cliente Rapido</div>
          <button className="btn btn-muted" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-[10px] uppercase font-bold text-zinc-500">Nombre *</label>
            <input className={modalInputClass} value={draft.name} onChange={(event) => onChange("name", event.target.value)} />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-500">Telefono</label>
            <input className={modalInputClass} value={draft.phone} onChange={(event) => onChange("phone", event.target.value)} />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-500">Zona</label>
            <input className={modalInputClass} value={draft.zone} onChange={(event) => onChange("zone", event.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] uppercase font-bold text-zinc-500">Direccion</label>
            <div className="relative" data-address-search-root="quick">
              <div className="flex gap-2">
                <input
                  className={modalInputClass}
                  value={draft.address}
                  onChange={(event) => onAddressSearchChange(event.target.value)}
                  onFocus={() => onAddressFocus(draft.address)}
                  placeholder="Ej: San Martin 123, Aguilares"
                />
                <button
                  type="button"
                  className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-xs font-bold text-zinc-200 transition-colors hover:bg-zinc-800"
                  onClick={onOpenMapPicker}
                >
                  Ubicar en mapa
                </button>
              </div>
              {addressLoading ? (
                <div className="absolute right-28 top-1/2 mt-0.5 -translate-y-1/2 text-[10px] uppercase text-zinc-400">
                  Buscando...
                </div>
              ) : null}
              {addressDropdownOpen && addressOptions.length > 0 ? (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-auto rounded-lg border border-zinc-700 bg-[#181818] shadow-xl">
                  {addressOptions.map((option, index) => (
                    <button
                      key={option.placeId || `${option.latitude}-${option.longitude}-${index}`}
                      type="button"
                      className="w-full border-b border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800 last:border-b-0"
                      onClick={() => onAddressSelect(option)}
                    >
                      <div className="text-xs text-zinc-100">{option.label}</div>
                      {option.latitude != null && option.longitude != null ? (
                        <div className="text-[10px] font-mono text-zinc-500">
                          {Number(option.latitude).toFixed(6)}, {Number(option.longitude).toFixed(6)}
                        </div>
                      ) : null}
                    </button>
                  ))}
                  {String(addressSearch || "").trim().length >= 5 ? (
                    <button
                      type="button"
                      className="w-full border-t border-zinc-700 px-3 py-2 text-left hover:bg-zinc-800"
                      onClick={() => onUseAddressReference(String(addressSearch || "").trim())}
                    >
                      <div className="text-xs font-bold text-amber-300">
                        Usar referencia sin coordenadas
                      </div>
                      <div className="text-[10px] text-zinc-400">{String(addressSearch || "").trim()}</div>
                    </button>
                  ) : null}
                </div>
              ) : null}
              {addressDropdownOpen &&
              !addressLoading &&
              addressOptions.length === 0 &&
              String(addressSearch || "").trim().length >= 5 ? (
                <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-zinc-700 bg-[#181818] shadow-xl">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-zinc-800"
                    onClick={() => onUseAddressReference(String(addressSearch || "").trim())}
                  >
                    <div className="text-xs font-bold text-amber-300">
                      Usar referencia sin coordenadas
                    </div>
                    <div className="text-[10px] text-zinc-400">{String(addressSearch || "").trim()}</div>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] uppercase font-bold text-zinc-500">Notas</label>
            <input className={modalInputClass} value={draft.notes} onChange={(event) => onChange("notes", event.target.value)} />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={saving}>
            {saving ? "Guardando..." : "Guardar y seleccionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
