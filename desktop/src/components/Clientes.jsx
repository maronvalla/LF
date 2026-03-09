import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import ConfirmModal from "./ventas/ConfirmModal";
import ImportExportModal from "./ImportExportModal";
import ClientBulkEditModal from "./clientes/ClientBulkEditModal";
import ClientFormModal from "./clientes/ClientFormModal";
import ClientMapPickerModal from "./clientes/ClientMapPickerModal";
import ClientsTable from "./clientes/ClientsTable";
import {
  DEFAULT_PRICE_LIST_KEY,
  DEFAULT_PRICE_LISTS,
  getDefaultPriceListKey,
  normalizePriceListsConfig,
} from "../utils/priceLists";

const DEFAULT_MAP_CENTER = { lat: -27.432028, lng: -65.616528 };
const BULK_EDIT_PAGE_SIZE = 25;
const HABITUAL_ROUTE_RADIUS_KM = 10;
const parseOptionalCoordinate = (value) => {
  if (value === null || value === undefined) return NaN;
  const text = String(value).trim();
  if (!text) return NaN;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
};

function haversineKm(from, to) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function isTypingTarget(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
}

function isTextEditingTarget(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
}

function buildEmptyDraft(defaultPriceListKey) {
  return {
    name: "",
    code: "",
    taxId: "",
    address: "",
    phone: "",
    email: "",
    ivaCondition: "Consumidor Final",
    preferred_price_list: defaultPriceListKey,
    enableCurrentAccount: false,
    notes: "",
    latitude: "",
    longitude: "",
  };
}

export default function Clientes({ setToast }) {
  const [rows, setRows] = useState([]);
  const [priceLists, setPriceLists] = useState(DEFAULT_PRICE_LISTS);
  const [priceListsConfig, setPriceListsConfig] = useState({
    lists: DEFAULT_PRICE_LISTS,
    defaultKey: DEFAULT_PRICE_LIST_KEY,
  });
  const [showImportExport, setShowImportExport] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [activeTab, setActiveTab] = useState("DATOS");
  const [addressSearch, setAddressSearch] = useState("");
  const [addressOptions, setAddressOptions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressDropdownOpen, setAddressDropdownOpen] = useState(false);
  const [googleSearchLoading, setGoogleSearchLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapPosition, setMapPosition] = useState(DEFAULT_MAP_CENTER);
  const [mapResolvingAddress, setMapResolvingAddress] = useState(false);
  const [search, setSearch] = useState("");
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState({});
  const [bulkOriginals, setBulkOriginals] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkEditPage, setBulkEditPage] = useState(1);
  const [bulkAddressSearch, setBulkAddressSearch] = useState("");
  const [bulkAddressOptions, setBulkAddressOptions] = useState([]);
  const [bulkAddressLoading, setBulkAddressLoading] = useState(false);
  const [bulkAddressRowId, setBulkAddressRowId] = useState(null);
  const [pendingAddressSelection, setPendingAddressSelection] = useState(null);
  const [draft, setDraft] = useState(buildEmptyDraft(DEFAULT_PRICE_LIST_KEY));
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolverRef = useRef(null);

  const showConfirm = (message) =>
    new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({ message });
    });

  const resolveConfirm = (value) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmState(null);
    if (typeof resolver === "function") resolver(Boolean(value));
  };


  const updateDraft = (patch) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const buildClientPayload = (clientDraft) => {
    const parsedLat = clientDraft.latitude === "" ? null : Number(clientDraft.latitude);
    const parsedLng = clientDraft.longitude === "" ? null : Number(clientDraft.longitude);

    return {
      name: clientDraft.name?.trim(),
      code: clientDraft.code?.trim() || null,
      taxId: clientDraft.taxId?.trim() || null,
      phone: clientDraft.phone?.trim() || null,
      email: clientDraft.email?.trim() || null,
      address: clientDraft.address?.trim() || null,
      ivaCondition: clientDraft.ivaCondition || "Consumidor Final",
      notes: clientDraft.notes?.trim() || null,
      preferredPriceList:
        clientDraft.preferred_price_list || getDefaultPriceListKey(priceListsConfig),
      enableCurrentAccount: Boolean(
        clientDraft.enableCurrentAccount ??
          clientDraft.enable_current_account ??
          false
      ),
      latitude: Number.isFinite(parsedLat) ? parsedLat : null,
      longitude: Number.isFinite(parsedLng) ? parsedLng : null,
    };
  };

  const buildBulkDraftFromRow = (client) => ({
    id: client.id,
    name: client.name || "",
    code: client.code || "",
    taxId: client.tax_id || client.taxId || client.cuit || "",
    phone: client.phone || "",
    email: client.email || "",
    address: client.address || "",
    ivaCondition: client.iva_condition || client.ivaCondition || "Consumidor Final",
    preferred_price_list:
      client.preferred_price_list || getDefaultPriceListKey(priceListsConfig),
    enableCurrentAccount: Boolean(
      client.enable_current_account ?? client.enableCurrentAccount ?? false
    ),
    notes: client.notes || "",
    latitude:
      client.latitude === null || client.latitude === undefined ? "" : String(client.latitude),
    longitude:
      client.longitude === null || client.longitude === undefined ? "" : String(client.longitude),
  });

  const fetchCustomers = async () => {
    try {
      const [customersRes, priceListsRes] = await Promise.all([
        api.get("/customers"),
        api.get("/settings/price-lists").catch(() => ({ data: { lists: DEFAULT_PRICE_LISTS } })),
      ]);
      const normalizedPriceLists = normalizePriceListsConfig(priceListsRes.data);
      setPriceLists(normalizedPriceLists.lists);
      setPriceListsConfig(normalizedPriceLists);
      setRows(customersRes.data || []);
    } catch {
      setRows([]);
      setToast?.({ message: "No se pudieron cargar clientes", type: "error" });
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [setToast]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) =>
      [row.name, row.code, row.phone, row.address, row.tax_id, row.email]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(q))
    );
  }, [rows, search]);

  const customerSummary = useMemo(() => {
    const visible = filteredRows.length;
    const total = rows.length;
    const withCurrentAccount = filteredRows.filter(
      (client) => client.enable_current_account || client.enableCurrentAccount
    ).length;
    const geolocated = filteredRows.filter((client) => client.latitude && client.longitude).length;

    return {
      total,
      visible,
      withCurrentAccount,
      geolocated,
    };
  }, [filteredRows, rows]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = String(event.key || "");
      const isPlusShortcut = key === "+" || key === "Add" || (key === "=" && event.shiftKey);

      if (!isPlusShortcut) return;
      if (showModal || showMapPicker || showImportExport) return;
      if (isTypingTarget(event.target) && !isTextEditingTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      openNew();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showImportExport, showMapPicker, showModal, priceListsConfig]);

  useEffect(() => {
    const query = addressSearch.trim();
    if (!showModal || activeTab !== "DATOS" || !addressDropdownOpen || query.length < 5) {
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
  }, [activeTab, addressSearch, showModal]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.("[data-address-search-root='single']")) return;
      setAddressOptions([]);
      setAddressDropdownOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const query = bulkAddressSearch.trim();
    if (!showBulkEdit || !bulkAddressRowId || query.length < 5) {
      setBulkAddressOptions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setBulkAddressLoading(true);
        const { data } = await api.get("/customers/address-search", { params: { q: query } });
        setBulkAddressOptions(Array.isArray(data) ? data : []);
      } catch {
        setBulkAddressOptions([]);
      } finally {
        setBulkAddressLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [bulkAddressRowId, bulkAddressSearch, showBulkEdit]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.("[data-address-search-root='bulk']")) return;
      setBulkAddressOptions([]);
      setBulkAddressRowId(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const closeFormModal = () => {
    setShowModal(false);
    setAddressOptions([]);
    setAddressDropdownOpen(false);
  };

  const openNew = () => {
    setEditingClient(null);
    setDraft(buildEmptyDraft(getDefaultPriceListKey(priceListsConfig)));
    setActiveTab("DATOS");
    setAddressSearch("");
    setAddressOptions([]);
    setAddressDropdownOpen(false);
    setMapPosition(DEFAULT_MAP_CENTER);
    setShowModal(true);
  };

  const openEdit = (client) => {
    setEditingClient(client);
    setDraft({
      name: client.name || "",
      code: client.code || "",
      taxId: client.tax_id || client.taxId || client.cuit || "",
      address: client.address || "",
      phone: client.phone || "",
      email: client.email || "",
      ivaCondition: client.iva_condition || client.ivaCondition || "Consumidor Final",
      preferred_price_list:
        client.preferred_price_list || getDefaultPriceListKey(priceListsConfig),
      enableCurrentAccount: Boolean(
        client.enable_current_account ?? client.enableCurrentAccount ?? false
      ),
      notes: client.notes || "",
      latitude: client.latitude || "",
      longitude: client.longitude || "",
    });
    setActiveTab("DATOS");
    setAddressSearch(client.address || "");
    setAddressOptions([]);
    setAddressDropdownOpen(false);
    const lat = parseOptionalCoordinate(client.latitude);
    const lng = parseOptionalCoordinate(client.longitude);
    setMapPosition(
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : DEFAULT_MAP_CENTER
    );
    setShowModal(true);
  };

  const startBulkEdit = () => {
    const drafts = {};
    const originals = {};
    rows.forEach((row) => {
      const draftRow = buildBulkDraftFromRow(row);
      drafts[row.id] = draftRow;
      originals[row.id] = JSON.stringify(buildClientPayload(draftRow));
    });
    setBulkDrafts(drafts);
    setBulkOriginals(originals);
    setBulkEditPage(1);
    setShowBulkEdit(true);
  };

  const stopBulkEdit = () => {
    setShowBulkEdit(false);
    setBulkDrafts({});
    setBulkOriginals({});
    setBulkEditPage(1);
    setBulkAddressSearch("");
    setBulkAddressOptions([]);
    setBulkAddressRowId(null);
  };

  const updateBulkDraft = (id, patch) => {
    setBulkDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...patch,
      },
    }));
  };

  const updateBulkAddressDraft = (id, value) => {
    updateBulkDraft(id, { address: value });
    setBulkAddressRowId(id);
    setBulkAddressSearch(value);
  };

  const applySingleAddressOption = (option) => {
    updateDraft({
      address: option.address || option.label || draft.address,
      latitude: String(option.latitude ?? ""),
      longitude: String(option.longitude ?? ""),
    });
    setAddressSearch(option.address || option.label || "");
    setAddressOptions([]);
    setAddressDropdownOpen(false);
  };

  const applyBulkAddressOption = (id, option) => {
    updateBulkDraft(id, {
      address: option.address || option.label || "",
      latitude: String(option.latitude ?? ""),
      longitude: String(option.longitude ?? ""),
    });
    setBulkAddressRowId(null);
    setBulkAddressSearch(option.address || option.label || "");
    setBulkAddressOptions([]);
  };

  const searchWithGoogleDirect = async (query) => {
    if (!query || query.length < 5) return;
    try {
      setGoogleSearchLoading(true);
      const { data } = await api.get("/customers/address-search", { params: { q: query, provider: "google" } });
      setAddressOptions(Array.isArray(data) ? data : []);
      setAddressDropdownOpen(true);
    } catch {
      setAddressOptions([]);
    } finally {
      setGoogleSearchLoading(false);
    }
  };

  const requestAddressSelection = ({ mode, option, rowId = null }) => {
    const resolved = option;
    const lat = Number(resolved?.latitude);
    const lng = Number(resolved?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (mode === "bulk") applyBulkAddressOption(rowId, resolved);
      else applySingleAddressOption(resolved);
      return;
    }

    const distanceKm = haversineKm(DEFAULT_MAP_CENTER, { lat, lng });
    if (distanceKm <= HABITUAL_ROUTE_RADIUS_KM) {
      if (mode === "bulk") applyBulkAddressOption(rowId, resolved);
      else applySingleAddressOption(resolved);
      return;
    }

    setPendingAddressSelection({
      mode,
      rowId,
      option: resolved,
      distanceKm,
    });
  };

  const confirmPendingAddressSelection = () => {
    if (!pendingAddressSelection) return;
    if (pendingAddressSelection.mode === "bulk") {
      applyBulkAddressOption(pendingAddressSelection.rowId, pendingAddressSelection.option);
    } else {
      applySingleAddressOption(pendingAddressSelection.option);
    }
    setPendingAddressSelection(null);
  };

  const currentPosition = useMemo(() => {
    const lat = parseOptionalCoordinate(draft.latitude);
    const lng = parseOptionalCoordinate(draft.longitude);
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

      const payload = buildClientPayload(draft);
      if (editingClient) {
        await api.put(`/customers/${editingClient.id}`, payload);
        setToast?.({ message: "Cliente actualizado", type: "success" });
      } else {
        const matchName = String(draft.name || "").trim();
        if (matchName.length >= 3) {
          const { data: prospectMatch } = await api
            .get("/customers/prospect-match", { params: { name: matchName } })
            .catch(() => ({ data: null }));

          if (prospectMatch?.id) {
            const suggestedPhone = String(
              draft.phone || prospectMatch.customer_phone || prospectMatch.phone || ""
            ).trim();
            const confirmed = await showConfirm(
              `Se encontro un prospecto por presupuesto: ${prospectMatch.name}. ` +
                `Ultimo presupuesto: ${prospectMatch.budget_number || "N/A"}. ` +
                `Celular sugerido: ${suggestedPhone || "sin celular"}. ` +
                `Quieres usar ese prospecto como este cliente?`
            );

            if (confirmed) {
              payload.phone = suggestedPhone || null;
              payload.prospectMatchCustomerId = prospectMatch.id;
              updateDraft({ phone: suggestedPhone });
            }
          }
        }
        await api.post("/customers", payload);
        setToast?.({ message: "Cliente creado", type: "success" });
      }

      closeFormModal();
      fetchCustomers();
    } catch {
      setToast?.({ message: "Error al guardar cliente", type: "error" });
    }
  };

  const saveBulkEdit = async () => {
    const changedEntries = filteredRows
      .map((row) => {
        const draftRow = bulkDrafts[row.id];
        if (!draftRow) return null;
        const payload = buildClientPayload(draftRow);
        if (JSON.stringify(payload) === bulkOriginals[row.id]) return null;
        return { id: row.id, payload };
      })
      .filter(Boolean);

    if (!changedEntries.length) {
      setToast?.({ message: "No hay clientes modificados", type: "error" });
      return;
    }
    if (changedEntries.some((entry) => !entry.payload.name?.trim())) {
      setToast?.({
        message: "Todos los clientes editados deben tener nombre",
        type: "error",
      });
      return;
    }

    setBulkSaving(true);
    try {
      const results = await Promise.allSettled(
        changedEntries.map((entry) => api.put(`/customers/${entry.id}`, entry.payload))
      );
      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const errorCount = results.length - successCount;
      await fetchCustomers();

      if (errorCount) {
        const firstError = results.find((result) => result.status === "rejected");
        setToast?.({
          message:
            firstError?.reason?.response?.data?.message ||
            `Se actualizaron ${successCount} clientes y fallaron ${errorCount}`,
          type: successCount ? "warning" : "error",
        });
      } else {
        setToast?.({ message: `Se actualizaron ${successCount} clientes`, type: "success" });
      }

      if (successCount) stopBulkEdit();
    } finally {
      setBulkSaving(false);
    }
  };

  const bulkEditTotalPages = Math.max(1, Math.ceil(filteredRows.length / BULK_EDIT_PAGE_SIZE));
  const bulkEditCurrentPage = Math.min(bulkEditPage, bulkEditTotalPages);
  const visibleBulkRows = showBulkEdit
    ? filteredRows.slice(
        (bulkEditCurrentPage - 1) * BULK_EDIT_PAGE_SIZE,
        bulkEditCurrentPage * BULK_EDIT_PAGE_SIZE
      )
    : filteredRows;

  const deleteClient = async (id) => {
    if (!await showConfirm("¿Seguro de eliminar este cliente?")) return;

    try {
      await api.delete(`/customers/${id}`);
      setToast?.({ message: "Cliente eliminado", type: "success" });
      fetchCustomers();
    } catch {
      setToast?.({ message: "Error al eliminar cliente", type: "error" });
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 sm:gap-4">
      <div className="px-1 sm:px-2">
        <div className="rounded-2xl border border-zinc-800/80 bg-[#121212] px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold leading-none text-white tracking-tight">
                  Clientes
                </h1>
                <span className="inline-flex items-center rounded-full border border-[#e85d04]/30 bg-[#e85d04]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#ff9f5a]">
                  {customerSummary.visible} visibles
                </span>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-zinc-400">
                Directorio, cuentas corrientes y ubicaciones en una vista mas compacta.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                  Total {customerSummary.total}
                </span>
                <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                  Cta. cte. {customerSummary.withCurrentAccount}
                </span>
                <span className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
                  GPS {customerSummary.geolocated}
                </span>
              </div>
            </div>

            <div className="w-full xl:w-auto xl:min-w-[42rem]">
              <div className="flex flex-col gap-2">
                <input
                  className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-[#e85d04]"
                  placeholder="Buscar cliente..."
                  title="Busca por nombre, codigo, CUIT, telefono, email o direccion"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-[auto_auto_auto]">
                  <button
                    onClick={() => setShowImportExport(true)}
                    className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="truncate">Importar / Exportar</span>
                  </button>
                  <button
                    onClick={startBulkEdit}
                    className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-3 rounded-xl text-sm font-bold transition-colors"
                  >
                    Editar varios
                  </button>
                  <button
                    onClick={openNew}
                    className="col-span-2 lg:col-span-1 bg-[#e85d04] hover:bg-[#d14f00] text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Nuevo Cliente</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ClientsTable
        rows={rows}
        filteredRows={filteredRows}
        priceLists={priceLists}
        priceListsConfig={priceListsConfig}
        onEdit={openEdit}
        onDelete={deleteClient}
      />

      {showModal ? (
        <ClientFormModal
          editingClient={editingClient}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          draft={draft}
          updateDraft={updateDraft}
          addressSearch={addressSearch}
          setAddressSearch={setAddressSearch}
          setAddressDropdownOpen={setAddressDropdownOpen}
          addressDropdownOpen={addressDropdownOpen}
          addressLoading={addressLoading}
          addressOptions={addressOptions}
          setAddressOptions={setAddressOptions}
          onRequestAddressSelection={(option) =>
            requestAddressSelection({ mode: "single", option })
          }
          onGoogleSearch={searchWithGoogleDirect}
          googleSearchLoading={googleSearchLoading}
          priceLists={priceLists}
          onClose={closeFormModal}
          onSave={saveClient}
          onOpenMapPicker={openMapPicker}
        />
      ) : null}

      {showBulkEdit ? (
        <ClientBulkEditModal
          filteredRows={visibleBulkRows}
          bulkDrafts={bulkDrafts}
          bulkSaving={bulkSaving}
          priceLists={priceLists}
          currentPage={bulkEditCurrentPage}
          totalPages={bulkEditTotalPages}
          totalRows={filteredRows.length}
          bulkAddressRowId={bulkAddressRowId}
          bulkAddressLoading={bulkAddressLoading}
          bulkAddressOptions={bulkAddressOptions}
          onClose={stopBulkEdit}
          onSave={saveBulkEdit}
          onUpdateBulkDraft={updateBulkDraft}
          onPreviousPage={() => setBulkEditPage((prev) => Math.max(1, prev - 1))}
          onNextPage={() => setBulkEditPage((prev) => Math.min(bulkEditTotalPages, prev + 1))}
          onUpdateBulkAddressDraft={updateBulkAddressDraft}
          onFocusBulkAddressRow={(id, value) => {
            setBulkAddressRowId(id);
            setBulkAddressSearch(value || "");
          }}
          onApplyBulkAddressOption={(id, option) =>
            requestAddressSelection({ mode: "bulk", rowId: id, option })
          }
          onUseBulkAddressReference={(id, reference) => {
            updateBulkDraft(id, {
              address: reference,
              latitude: "",
              longitude: "",
            });
            setBulkAddressRowId(null);
            setBulkAddressSearch(reference);
            setBulkAddressOptions([]);
          }}
        />
      ) : null}

      {showMapPicker ? (
        <ClientMapPickerModal
          mapPosition={mapPosition}
          setMapPosition={setMapPosition}
          mapResolvingAddress={mapResolvingAddress}
          onClose={() => setShowMapPicker(false)}
          onApplyCoords={applyMapLocation}
          onApplyWithAddress={applyMapLocationWithAddress}
        />
      ) : null}

      {showImportExport ? (
        <ImportExportModal
          entity="customers"
          entityLabel="Clientes"
          onClose={() => setShowImportExport(false)}
          onSuccess={fetchCustomers}
        />
      ) : null}

      {pendingAddressSelection ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-[#121212] p-6 shadow-2xl">
            <div className="text-lg font-black uppercase tracking-wide text-amber-300">
              Lugar fuera del recorrido habitual
            </div>
            <p className="mt-3 text-sm text-zinc-200">
              Estas eligiendo un lugar fuera del recorrido habitual.
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Distancia estimada desde Aguilares: {pendingAddressSelection.distanceKm.toFixed(1)} km
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {pendingAddressSelection.option?.label || pendingAddressSelection.option?.address}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-bold text-zinc-200 transition-colors hover:bg-zinc-700"
                onClick={() => setPendingAddressSelection(null)}
              >
                Revisar
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#e85d04] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#d14f00]"
                onClick={confirmPendingAddressSelection}
              >
                Elegir de todos modos
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmState ? (
        <ConfirmModal
          message={confirmState.message}
          onCancel={() => resolveConfirm(false)}
          onConfirm={() => resolveConfirm(true)}
        />
      ) : null}
    </div>
  );
}
