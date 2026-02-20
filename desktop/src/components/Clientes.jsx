import { useEffect, useMemo, useState } from "react";
import api from "../api";
import ImportExportModal from "./ImportExportModal";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DEFAULT_MAP_CENTER = { lat: -27.432028, lng: -65.616528 };

const leafletDefaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = leafletDefaultIcon;

function MapClickSelect({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return (
    <Marker
      position={[position.lat, position.lng]}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const p = e.target.getLatLng();
          setPosition({ lat: p.lat, lng: p.lng });
        },
      }}
    />
  );
}

function MapRecenter({ position }) {
  const map = useMap();
  useEffect(() => {
    map.setView([position.lat, position.lng], map.getZoom());
  }, [map, position.lat, position.lng]);
  return null;
}

export default function Clientes({ setToast }) {
  const [rows, setRows] = useState([]);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [activeTab, setActiveTab] = useState("DATOS");
  const [addressSearch, setAddressSearch] = useState("");
  const [addressOptions, setAddressOptions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapPosition, setMapPosition] = useState(DEFAULT_MAP_CENTER);
  const [mapResolvingAddress, setMapResolvingAddress] = useState(false);

  const [draft, setDraft] = useState({
    name: "",
    taxId: "",
    address: "",
    zone: "",
    phone: "",
    email: "",
    ivaCondition: "Consumidor Final",
    preferred_price_list: "MINORISTA",
    notes: "",
    latitude: "",
    longitude: ""
  });

  const fetchCustomers = async () => {
    try {
      const res = await api.get("/customers");
      setRows(res.data || []);
    } catch {
      setRows([]);
      setToast?.({ message: "No se pudieron cargar clientes", type: "error" });
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [setToast]);

  useEffect(() => {
    const query = addressSearch.trim();
    if (!showModal || activeTab !== "DATOS" || query.length < 3) {
      setAddressOptions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setAddressLoading(true);
        const { data } = await api.get("/customers/address-search", { params: { q: query } });
        setAddressOptions(Array.isArray(data) ? data : []);
      } catch {
        setAddressOptions([]);
      } finally {
        setAddressLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [addressSearch, showModal, activeTab]);

  const openNew = () => {
    setEditingClient(null);
    setDraft({
      name: "",
      taxId: "",
      address: "",
      zone: "",
      phone: "",
      email: "",
      ivaCondition: "Consumidor Final",
      preferred_price_list: "MINORISTA",
      notes: "",
      latitude: "",
      longitude: ""
    });
    setActiveTab("DATOS");
    setAddressSearch("");
    setAddressOptions([]);
    setMapPosition(DEFAULT_MAP_CENTER);
    setShowModal(true);
  };

  const openEdit = (c) => {
    setEditingClient(c);
    setDraft({
      name: c.name || "",
      taxId: c.taxId || c.cuit || "",
      address: c.address || "",
      zone: c.zone || "",
      phone: c.phone || "",
      email: c.email || "",
      ivaCondition: c.ivaCondition || "Consumidor Final",
      preferred_price_list: c.preferred_price_list || "MINORISTA",
      notes: c.notes || "",
      latitude: c.latitude || "",
      longitude: c.longitude || ""
    });
    setActiveTab("DATOS");
    setAddressSearch(c.address || "");
    setAddressOptions([]);
    const lat = Number(c.latitude);
    const lng = Number(c.longitude);
    setMapPosition(
      Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : DEFAULT_MAP_CENTER
    );
    setShowModal(true);
  };

  const currentPosition = useMemo(() => {
    const lat = Number(draft.latitude);
    const lng = Number(draft.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return DEFAULT_MAP_CENTER;
  }, [draft.latitude, draft.longitude]);

  const openMapPicker = () => {
    setMapPosition(currentPosition);
    setShowMapPicker(true);
  };

  const applyMapLocation = () => {
    setDraft((prev) => ({
      ...prev,
      latitude: String(mapPosition.lat),
      longitude: String(mapPosition.lng),
    }));
    setShowMapPicker(false);
  };

  const applyMapLocationWithAddress = async () => {
    try {
      setMapResolvingAddress(true);
      const { data } = await api.get("/customers/reverse-geocode", {
        params: { lat: mapPosition.lat, lng: mapPosition.lng },
      });
      const detected = String(data?.address || "").trim();
      setDraft((prev) => ({
        ...prev,
        latitude: String(mapPosition.lat),
        longitude: String(mapPosition.lng),
        address: detected || prev.address,
      }));
      if (detected) setAddressSearch(detected);
      setShowMapPicker(false);
    } catch {
      setDraft((prev) => ({
        ...prev,
        latitude: String(mapPosition.lat),
        longitude: String(mapPosition.lng),
      }));
      setShowMapPicker(false);
      setToast?.({ message: "No se pudo completar direccion desde el mapa", type: "warning" });
    } finally {
      setMapResolvingAddress(false);
    }
  };

  const saveClient = async () => {
    try {
      if (!draft.name.trim()) {
        setToast?.({ message: "El nombre es obligatorio", type: "warning" });
        return;
      }

      const parsedLat = draft.latitude === "" ? null : Number(draft.latitude);
      const parsedLng = draft.longitude === "" ? null : Number(draft.longitude);
      const payload = {
        name: draft.name?.trim(),
        phone: draft.phone?.trim() || null,
        address: draft.address?.trim() || null,
        zone: draft.zone?.trim() || null,
        notes: draft.notes?.trim() || null,
        preferredPriceList: draft.preferred_price_list || "MINORISTA",
        latitude: Number.isFinite(parsedLat) ? parsedLat : null,
        longitude: Number.isFinite(parsedLng) ? parsedLng : null,
      };
      if (editingClient) {
        await api.put(`/customers/${editingClient.id}`, payload);
        setToast?.({ message: "Cliente actualizado", type: "success" });
      } else {
        await api.post("/customers", payload);
        setToast?.({ message: "Cliente creado", type: "success" });
      }
      setShowModal(false);
      fetchCustomers();
    } catch (error) {
      setToast?.({ message: "Error al guardar cliente", type: "error" });
    }
  };

  const deleteClient = async (id) => {
    if (!window.confirm("¿Seguro de eliminar este cliente?")) return;
    try {
      await api.delete(`/customers/${id}`);
      setToast?.({ message: "Cliente eliminado", type: "success" });
      fetchCustomers();
    } catch {
      setToast?.({ message: "Error al eliminar cliente", type: "error" });
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex justify-between items-end px-2">
        <div>
          <h1 className="text-3xl font-bold leading-none text-white tracking-tight">Clientes</h1>
          <p className="text-xs text-zinc-400 mt-1">Directorio y gestión de cuentas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportExport(true)}
            className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Importar / Exportar
          </button>
          <button
            onClick={openNew}
            className="bg-[#e85d04] hover:bg-[#d14f00] text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
          >
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[#121212] border border-zinc-800/80 rounded-xl flex flex-col min-h-0 overflow-hidden relative">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#1a1a1a] text-zinc-400 text-[10px] uppercase tracking-widest sticky top-0 z-10 shadow-sm border-b border-zinc-800/80">
              <tr>
                <th className="px-5 py-4 font-bold">Nombre / Razón Social</th>
                <th className="px-5 py-4 font-bold">Teléfono</th>
                <th className="px-5 py-4 font-bold">Dirección</th>
                <th className="px-5 py-4 font-bold">Zona</th>
                <th className="px-5 py-4 font-bold">Lista Precio</th>
                <th className="px-5 py-4 font-bold text-center">GPS</th>
                <th className="px-5 py-4 font-bold text-center w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-zinc-600">
                    No hay clientes registrados.
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-5 py-3 font-bold text-white cursor-pointer" onClick={() => openEdit(c)}>{c.name}</td>
                    <td className="px-5 py-3 text-zinc-400">{c.phone || "-"}</td>
                    <td className="px-5 py-3 text-zinc-400">{c.address || "-"}</td>
                    <td className="px-5 py-3 text-zinc-400">{c.zone || "-"}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.preferred_price_list === "MAYORISTA"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                          : "bg-blue-500/20 text-blue-400 border border-blue-500/20"
                        }`}>
                        {c.preferred_price_list || "MINORISTA"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {c.latitude && c.longitude ? (
                        <span className="text-cyan-400" title={`${c.latitude}, ${c.longitude}`}>
                          <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                          className="bg-zinc-800 hover:bg-[#e85d04] text-zinc-400 hover:text-white p-1.5 rounded transition-colors"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteClient(c.id); }}
                          className="bg-zinc-800 hover:bg-rose-500 text-zinc-400 hover:text-white p-1.5 rounded transition-colors"
                          title="Eliminar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#121212] border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-wider">
                  {editingClient ? "Editar Cliente" : "Nuevo Cliente"}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  setAddressOptions([]);
                }}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-zinc-800 px-6 pt-2 bg-[#1a1a1a]">
              {["DATOS", "UBICACION", "OBSERVACIONES"].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === tab
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
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Nombre / Razón Social *</label>
                    <input
                      autoFocus
                      className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-3 text-sm text-white focus:border-[#e85d04] outline-none"
                      value={draft.name}
                      onChange={e => setDraft({ ...draft, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">CUIT / DNI</label>
                    <input
                      className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                      value={draft.taxId}
                      onChange={e => setDraft({ ...draft, taxId: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Condición IVA</label>
                    <select
                      className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                      value={draft.ivaCondition}
                      onChange={e => setDraft({ ...draft, ivaCondition: e.target.value })}
                    >
                      <option>Consumidor Final</option>
                      <option>Responsable Inscripto</option>
                      <option>Monotributo</option>
                      <option>Exento</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Teléfono</label>
                    <input
                      className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                      value={draft.phone}
                      onChange={e => setDraft({ ...draft, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Email</label>
                    <input
                      type="email"
                      className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                      value={draft.email}
                      onChange={e => setDraft({ ...draft, email: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Dirección</label>
                    <div className="relative">
                      <input
                        className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                        value={draft.address}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDraft({ ...draft, address: value });
                          setAddressSearch(value);
                        }}
                        onFocus={() => setAddressSearch(draft.address || "")}
                        placeholder="Ej: San Martin 123, Aguilares"
                      />
                      {addressLoading ? (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 uppercase">
                          Buscando...
                        </div>
                      ) : null}
                      {addressOptions.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full bg-[#181818] border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-auto">
                          {addressOptions.map((opt, idx) => (
                            <button
                              key={`${opt.latitude}-${opt.longitude}-${idx}`}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-zinc-800 border-b border-zinc-800 last:border-b-0"
                              onClick={() => {
                                setDraft((prev) => ({
                                  ...prev,
                                  address: opt.address || opt.label || prev.address,
                                  latitude: String(opt.latitude),
                                  longitude: String(opt.longitude),
                                }));
                                setAddressSearch(opt.address || opt.label || "");
                                setAddressOptions([]);
                              }}
                            >
                              <div className="text-xs text-zinc-100">{opt.label}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">
                                {Number(opt.latitude).toFixed(6)}, {Number(opt.longitude).toFixed(6)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Zona / Ruta</label>
                    <input
                      className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                      value={draft.zone}
                      onChange={e => setDraft({ ...draft, zone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Lista de Precios</label>
                    <select
                      className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none font-bold text-[#e85d04]"
                      value={draft.preferred_price_list}
                      onChange={e => setDraft({ ...draft, preferred_price_list: e.target.value })}
                    >
                      <option value="MINORISTA">MINORISTA</option>
                      <option value="MAYORISTA">MAYORISTA</option>
                    </select>
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
                          Seleccione una direccion sugerida en la pestana DATOS para completar
                          estas coordenadas automaticamente y ubicar al cliente en el mapa.
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">
                        Latitud
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="-27.43321"
                        className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none font-mono"
                        value={draft.latitude}
                        onChange={e => setDraft({ ...draft, latitude: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">
                        Longitud
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="-65.61492"
                        className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none font-mono"
                        value={draft.longitude}
                        onChange={e => setDraft({ ...draft, longitude: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
                    <div className="text-xs text-zinc-400">
                      También puede marcar la ubicación exacta manualmente.
                    </div>
                    <button
                      type="button"
                      className="px-3 py-2 bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg text-xs font-bold uppercase tracking-wider"
                      onClick={openMapPicker}
                    >
                      Ubicar en mapa
                    </button>
                  </div>
                  {draft.latitude && draft.longitude && (
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
                    onChange={e => setDraft({ ...draft, notes: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="p-6 border-t border-zinc-800 flex justify-end gap-3 bg-[#1a1a1a] rounded-b-2xl">
              <button
                className="px-6 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                onClick={() => {
                  setShowModal(false);
                  setAddressOptions([]);
                }}
              >
                CANCELAR
              </button>
              <button
                className="px-8 py-2.5 bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg text-sm font-bold shadow-lg transition-colors"
                onClick={saveClient}
              >
                GUARDAR
              </button>
            </div>
          </div>
        </div>
      )}

      {showMapPicker && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-4xl h-[80vh] bg-[#121212] border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-[#1a1a1a] border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-white uppercase tracking-wider">Ubicar Cliente En Mapa</div>
                <div className="text-[11px] text-zinc-400">Click en el mapa para marcar la ubicación exacta</div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold uppercase"
                onClick={() => setShowMapPicker(false)}
              >
                Cerrar
              </button>
            </div>
            <div className="flex-1 relative">
              <MapContainer
                center={[mapPosition.lat, mapPosition.lng]}
                zoom={16}
                className="h-full w-full"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapClickSelect position={mapPosition} setPosition={setMapPosition} />
                <MapRecenter position={mapPosition} />
              </MapContainer>
            </div>
            <div className="px-4 py-3 bg-[#1a1a1a] border-t border-zinc-800 flex items-center justify-between">
              <div className="text-xs text-zinc-300 font-mono">
                {mapPosition.lat.toFixed(6)}, {mapPosition.lng.toFixed(6)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider"
                  onClick={applyMapLocation}
                  disabled={mapResolvingAddress}
                >
                  Solo coordenadas
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                  onClick={applyMapLocationWithAddress}
                  disabled={mapResolvingAddress}
                >
                  {mapResolvingAddress ? "Buscando direccion..." : "Usar y completar direccion"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportExport && (
        <ImportExportModal
          entity="customers"
          entityLabel="Clientes"
          onClose={() => setShowImportExport(false)}
          onSuccess={fetchCustomers}
        />
      )}
    </div>
  );
}
