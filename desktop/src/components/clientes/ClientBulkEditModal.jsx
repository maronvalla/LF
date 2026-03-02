export default function ClientBulkEditModal({
  filteredRows,
  bulkDrafts,
  bulkSaving,
  priceLists,
  currentPage,
  totalPages,
  totalRows,
  bulkAddressRowId,
  bulkAddressLoading,
  bulkAddressOptions,
  onClose,
  onSave,
  onUpdateBulkDraft,
  onPreviousPage,
  onNextPage,
  onUpdateBulkAddressDraft,
  onFocusBulkAddressRow,
  onApplyBulkAddressOption,
  onUseBulkAddressReference,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#121212] border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-[96vw] flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-wider">Edicion Masiva de Clientes</h3>
            <p className="text-xs text-zinc-400 mt-1">
              La tabla usa el filtro actual y guarda todos los cambios juntos. Mostrando {filteredRows.length} de {totalRows} clientes.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              onClick={onClose}
              disabled={bulkSaving}
            >
              Cancelar
            </button>
            <button
              className="px-8 py-2.5 bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg text-sm font-bold shadow-lg transition-colors disabled:opacity-60"
              onClick={onSave}
              disabled={bulkSaving}
            >
              {bulkSaving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between border-b border-zinc-800 bg-[#151515] px-6 py-3">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Pagina {currentPage} de {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-40"
              onClick={onPreviousPage}
              disabled={currentPage <= 1}
            >
              Anterior
            </button>
            <button
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-40"
              onClick={onNextPage}
              disabled={currentPage >= totalPages}
            >
              Siguiente
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#1a1a1a] text-zinc-400 text-[10px] uppercase tracking-widest sticky top-0 z-10 border-b border-zinc-800/80">
              <tr>
                <th className="px-3 py-3 font-bold">Codigo</th>
                <th className="px-3 py-3 font-bold">Nombre</th>
                <th className="px-3 py-3 font-bold">CUIT / DNI</th>
                <th className="px-3 py-3 font-bold">Telefono</th>
                <th className="px-3 py-3 font-bold">Email</th>
                <th className="px-3 py-3 font-bold min-w-[320px]">Direccion</th>
                <th className="px-3 py-3 font-bold">IVA</th>
                <th className="px-3 py-3 font-bold">Lista</th>
                <th className="px-3 py-3 font-bold">Cta. Cte.</th>
                <th className="px-3 py-3 font-bold">Latitud</th>
                <th className="px-3 py-3 font-bold">Longitud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filteredRows.map((client) => {
                const current = bulkDrafts[client.id];
                if (!current) return null;

                return (
                  <tr key={client.id}>
                    <td className="px-3 py-2"><input className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-[#e85d04]" value={current.code} onChange={(event) => onUpdateBulkDraft(client.id, { code: event.target.value })} /></td>
                    <td className="px-3 py-2"><input className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-[#e85d04]" value={current.name} onChange={(event) => onUpdateBulkDraft(client.id, { name: event.target.value })} /></td>
                    <td className="px-3 py-2"><input className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-[#e85d04]" value={current.taxId} onChange={(event) => onUpdateBulkDraft(client.id, { taxId: event.target.value })} /></td>
                    <td className="px-3 py-2"><input className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-[#e85d04]" value={current.phone} onChange={(event) => onUpdateBulkDraft(client.id, { phone: event.target.value })} /></td>
                    <td className="px-3 py-2"><input className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-[#e85d04]" value={current.email} onChange={(event) => onUpdateBulkDraft(client.id, { email: event.target.value })} /></td>
                    <td className="px-3 py-2 min-w-[320px]">
                      <div className="relative" data-address-search-root="bulk">
                        <input
                          className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-[#e85d04]"
                          value={current.address}
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          onChange={(event) => onUpdateBulkAddressDraft(client.id, event.target.value)}
                          onFocus={() => onFocusBulkAddressRow(client.id, current.address)}
                        />
                        {bulkAddressLoading && bulkAddressRowId === client.id ? (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase text-zinc-400">
                            Buscando...
                          </div>
                        ) : null}
                        {bulkAddressRowId === client.id && bulkAddressOptions.length > 0 ? (
                          <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-auto rounded-lg border border-zinc-700 bg-[#181818] shadow-xl">
                            {bulkAddressOptions.map((option, index) => (
                              <button
                                key={`${option.latitude}-${option.longitude}-${index}`}
                                type="button"
                                className="w-full border-b border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800 last:border-b-0"
                                onClick={() => onApplyBulkAddressOption(client.id, option)}
                              >
                                <div className="text-xs text-zinc-100">{option.label}</div>
                                <div className="text-[10px] font-mono text-zinc-500">
                                  {Number(option.latitude).toFixed(6)}, {Number(option.longitude).toFixed(6)}
                                </div>
                              </button>
                            ))}
                            {String(current.address || "").trim().length >= 5 ? (
                              <button
                                type="button"
                                className="w-full border-t border-zinc-700 px-3 py-2 text-left hover:bg-zinc-800"
                                onClick={() => onUseBulkAddressReference(client.id, String(current.address || "").trim())}
                              >
                                <div className="text-xs font-bold text-amber-300">
                                  Usar referencia sin coordenadas
                                </div>
                                <div className="text-[10px] text-zinc-400">{String(current.address || "").trim()}</div>
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {bulkAddressRowId === client.id &&
                        !bulkAddressLoading &&
                        bulkAddressOptions.length === 0 &&
                        String(current.address || "").trim().length >= 5 ? (
                          <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-zinc-700 bg-[#181818] shadow-xl">
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-zinc-800"
                              onClick={() => onUseBulkAddressReference(client.id, String(current.address || "").trim())}
                            >
                              <div className="text-xs font-bold text-amber-300">
                                Usar referencia sin coordenadas
                              </div>
                              <div className="text-[10px] text-zinc-400">{String(current.address || "").trim()}</div>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-[#e85d04]" value={current.ivaCondition} onChange={(event) => onUpdateBulkDraft(client.id, { ivaCondition: event.target.value })}>
                        <option>Consumidor Final</option>
                        <option>Responsable Inscripto</option>
                        <option>Monotributo</option>
                        <option>Exento</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-[#e85d04]" value={current.preferred_price_list} onChange={(event) => onUpdateBulkDraft(client.id, { preferred_price_list: event.target.value })}>
                        {priceLists.map((row) => (
                          <option key={row.key} value={row.key}>
                            {row.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center justify-center rounded-lg border border-zinc-800 bg-[#1a1a1a] p-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#e85d04]"
                          checked={Boolean(current.enableCurrentAccount)}
                          onChange={(event) =>
                            onUpdateBulkDraft(client.id, {
                              enableCurrentAccount: event.target.checked,
                            })
                          }
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2"><input className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-[#e85d04]" value={current.latitude} onChange={(event) => onUpdateBulkDraft(client.id, { latitude: event.target.value })} /></td>
                    <td className="px-3 py-2"><input className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-[#e85d04]" value={current.longitude} onChange={(event) => onUpdateBulkDraft(client.id, { longitude: event.target.value })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
