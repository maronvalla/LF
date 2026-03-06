import { useEffect, useState } from 'react';
import api from '../../api';

export default function ClientFormModal({
  editingClient,
  activeTab,
  setActiveTab,
  draft,
  updateDraft,
  addressSearch,
  setAddressSearch,
  addressDropdownOpen,
  setAddressDropdownOpen,
  addressLoading,
  addressOptions,
  setAddressOptions,
  onRequestAddressSelection,
  priceLists,
  onClose,
  onSave,
  onOpenMapPicker,
}) {
  const [facadePhoto, setFacadePhoto] = useState(null);
  // facadePhoto: null (not loaded) | { base64: string|null, mimeType: string|null } | 'loading' | 'error'

  useEffect(() => {
    if (activeTab !== 'FACHADA' || !editingClient?.id) return;
    setFacadePhoto('loading');
    api.get(`/customers/${editingClient.id}/facade-photo`)
      .then(({ data }) => setFacadePhoto({ base64: data.base64, mimeType: data.mimeType }))
      .catch(() => setFacadePhoto('error'));
  }, [activeTab, editingClient?.id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="bg-[#121212] border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        onClick={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-wider">
              {editingClient ? "Editar Cliente" : "Nuevo Cliente"}
            </h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-zinc-800 px-6 pt-2 bg-[#1a1a1a]">
          {(editingClient ? ["DATOS", "UBICACION", "FACHADA", "OBSERVACIONES"] : ["DATOS", "UBICACION", "OBSERVACIONES"]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-[#e85d04] text-[#e85d04]"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6">
          {activeTab === "DATOS" && (
            <div className="grid grid-cols-2 gap-5">
              <div className="col-span-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">
                  Nombre / Razon Social *
                </label>
                <input
                  autoFocus
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-3 text-sm text-white focus:border-[#e85d04] outline-none"
                  value={draft.name}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Codigo</label>
                <input
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                  value={draft.code}
                  onChange={(event) => updateDraft({ code: event.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">CUIT / DNI</label>
                <input
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                  value={draft.taxId}
                  onChange={(event) => updateDraft({ taxId: event.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Condicion IVA</label>
                <select
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                  value={draft.ivaCondition}
                  onChange={(event) => updateDraft({ ivaCondition: event.target.value })}
                >
                  <option>Consumidor Final</option>
                  <option>Responsable Inscripto</option>
                  <option>Monotributo</option>
                  <option>Exento</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Telefono</label>
                <input
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                  value={draft.phone}
                  onChange={(event) => updateDraft({ phone: event.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Email</label>
                <input
                  type="email"
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                  value={draft.email}
                  onChange={(event) => updateDraft({ email: event.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Direccion</label>
                <div className="relative" data-address-search-root="single">
                  <input
                    className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                    value={draft.address}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateDraft({ address: value });
                      setAddressSearch(value);
                      setAddressDropdownOpen(true);
                    }}
                    onFocus={() => {
                      setAddressSearch(draft.address || "");
                      setAddressDropdownOpen(true);
                    }}
                    placeholder="Ej: San Martin 123, Aguilares"
                  />
                  {addressLoading ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 uppercase">
                      Buscando...
                    </div>
                  ) : null}
                  {addressOptions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-[#181818] border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-auto">
                      {addressOptions.map((option, index) => (
                        <button
                          key={option.placeId || `${option.latitude}-${option.longitude}-${index}`}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-zinc-800 border-b border-zinc-800 last:border-b-0"
                          onClick={() => onRequestAddressSelection(option)}
                        >
                          <div className="text-xs text-zinc-100">{option.label}</div>
                          {option.latitude != null && option.longitude != null ? (
                            <div className="text-[10px] text-zinc-500 font-mono">
                              {Number(option.latitude).toFixed(6)}, {Number(option.longitude).toFixed(6)}
                            </div>
                          ) : null}
                        </button>
                      ))}
                      {String(addressSearch || "").trim().length >= 5 ? (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-zinc-800 border-t border-zinc-700"
                          onClick={() => {
                            const reference = String(addressSearch || "").trim();
                            updateDraft({
                              address: reference,
                              latitude: "",
                              longitude: "",
                            });
                            setAddressSearch(reference);
                            setAddressOptions([]);
                            setAddressDropdownOpen(false);
                          }}
                        >
                          <div className="text-xs font-bold text-amber-300">
                            Usar referencia sin coordenadas
                          </div>
                          <div className="text-[10px] text-zinc-400">{String(addressSearch || "").trim()}</div>
                        </button>
                      ) : null}
                    </div>
                  )}
                  {addressDropdownOpen &&
                  !addressLoading &&
                  addressOptions.length === 0 &&
                  String(addressSearch || "").trim().length >= 5 ? (
                    <div className="absolute z-20 mt-1 w-full bg-[#181818] border border-zinc-700 rounded-lg shadow-xl">
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800"
                        onClick={() => {
                          const reference = String(addressSearch || "").trim();
                          updateDraft({
                            address: reference,
                            latitude: "",
                            longitude: "",
                          });
                          setAddressSearch(reference);
                          setAddressOptions([]);
                          setAddressDropdownOpen(false);
                        }}
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
              <div className="col-span-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Lista de Precios</label>
                <select
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none font-bold text-[#e85d04]"
                  value={draft.preferred_price_list}
                  onChange={(event) => updateDraft({ preferred_price_list: event.target.value })}
                >
                  {priceLists.map((row) => (
                    <option key={row.key} value={row.key}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-[#1a1a1a] px-3 py-3 text-sm text-white">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#e85d04]"
                    checked={Boolean(draft.enableCurrentAccount)}
                    onChange={(event) => updateDraft({ enableCurrentAccount: event.target.checked })}
                  />
                  <span className="font-bold uppercase tracking-wide">Habilitar cuenta corriente</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === "UBICACION" && (
            <div className="space-y-5">
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div>
                    <div className="text-sm font-bold text-cyan-400">Coordenadas para Rutas</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Seleccione una direccion sugerida en la pestana DATOS para completar estas coordenadas automaticamente y ubicar al cliente en el mapa.
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Latitud</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="-27.43321"
                    className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none font-mono"
                    value={draft.latitude}
                    onChange={(event) => updateDraft({ latitude: event.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Longitud</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="-65.61492"
                    className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none font-mono"
                    value={draft.longitude}
                    onChange={(event) => updateDraft({ longitude: event.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-400">Tambien puede marcar la ubicacion exacta manualmente.</div>
                <button
                  type="button"
                  className="px-3 py-2 bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg text-xs font-bold uppercase tracking-wider"
                  onClick={onOpenMapPicker}
                >
                  Ubicar en mapa
                </button>
              </div>
              {draft.latitude && draft.longitude ? (
                <div className="text-center">
                  <a
                    href={`https://www.google.com/maps?q=${draft.latitude},${draft.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Ver en Google Maps
                  </a>
                </div>
              ) : null}
            </div>
          )}

          {activeTab === "FACHADA" && (
            <div className="space-y-4">
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                <div className="text-xs font-bold text-cyan-400 mb-1">Foto de fachada</div>
                <div className="text-xs text-zinc-400">
                  Esta foto es capturada por el repartidor al momento de realizar una entrega.
                </div>
              </div>
              {facadePhoto === 'loading' && (
                <p className="text-sm text-zinc-400 text-center py-8">Cargando foto...</p>
              )}
              {facadePhoto === 'error' && (
                <p className="text-sm text-rose-400 text-center py-8">No se pudo cargar la foto.</p>
              )}
              {facadePhoto && facadePhoto !== 'loading' && facadePhoto !== 'error' && (
                facadePhoto.base64 ? (
                  <img
                    src={`data:${facadePhoto.mimeType || 'image/jpeg'};base64,${facadePhoto.base64}`}
                    alt="Fachada del negocio"
                    className="w-full rounded-xl border border-zinc-700 object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-3">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-sm">Sin foto de fachada registrada</p>
                  </div>
                )
              )}
            </div>
          )}

          {activeTab === "OBSERVACIONES" && (
            <div className="h-full flex flex-col">
              <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-2 block">Notas Internas</label>
              <textarea
                className="flex-1 w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-4 text-sm text-white focus:border-[#e85d04] outline-none resize-none"
                placeholder="Escriba comentarios u observaciones sobre este cliente..."
                value={draft.notes}
                onChange={(event) => updateDraft({ notes: event.target.value })}
              />
            </div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-800 flex justify-end gap-3 bg-[#1a1a1a] rounded-b-2xl">
          <button
            className="px-6 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            onClick={onClose}
          >
            CANCELAR
          </button>
          <button
            className="px-8 py-2.5 bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg text-sm font-bold shadow-lg transition-colors"
            onClick={onSave}
          >
            GUARDAR
          </button>
        </div>
      </div>
    </div>
  );
}
