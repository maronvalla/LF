import { useEffect, useMemo, useState } from "react";
import api from "../api";
import {
  DEFAULT_TICKET_CONFIG,
  loadTicketConfig,
  saveTicketConfig,
} from "../utils/ticketConfig";
import {
  DEFAULT_DELIVERY_CONDITIONS,
  loadDeliveryConditions,
  saveDeliveryConditions,
} from "../utils/deliveryPaymentConditions";
import {
  DEFAULT_DELIVERY_SHIFT_CONFIG,
  loadDeliveryShiftConfig,
  saveDeliveryShiftConfig,
} from "../utils/deliveryShiftConfig";
import {
  DEFAULT_CAJA_CONFIG,
  FREQUENCY_OPTIONS,
  loadCajaConfig,
  saveCajaConfig,
  getFrequencyDescription,
} from "../utils/cajaConfig";
import {
  DEFAULT_PRICE_LIST_KEY,
  DEFAULT_PRICE_LISTS,
  normalizePriceListKey,
  normalizePriceListsConfig,
} from "../utils/priceLists";

const FALLBACK = {
  local: { address: "Avenida Mitre 831, Aguilares", lat: -27.432028, lng: -65.616528 },
  deposito: { address: "Avenida Mitre 831, Aguilares", lat: -27.432028, lng: -65.616528 },
  extras: [],
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizePositiveInteger(value) {
  return String(value || "").replace(/\D/g, "");
}

function SettingsCard({ title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#111214]/95 p-4 md:p-5 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="mb-4">
        <div className="text-xl font-black tracking-tight text-white">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-zinc-400">{subtitle}</div> : null}
      </div>
      {children}
    </section>
  );
}

function centerPreviewText(text, max = 32) {
  const value = String(text || "").slice(0, max);
  const left = Math.max(0, Math.floor((max - value.length) / 2));
  return `${" ".repeat(left)}${value}`;
}

function formatTicketTemplateLine(line, templateVars, max = 32) {
  const rendered = String(line || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => templateVars[key] ?? "");
  if (!rendered) return "";
  if (/^\[C\]\s*/i.test(rendered)) {
    return centerPreviewText(rendered.replace(/^\[C\]\s*/i, ""), max);
  }
  return rendered.slice(0, max);
}

function buildTicketPreview(config) {
  const safeConfig = config || DEFAULT_TICKET_CONFIG;
  const customLines = String(
    safeConfig.customLinesText ?? (safeConfig.customLines || []).join("\n")
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const templateVars = {
    cliente: "CONSUMIDOR FINAL",
    vendedor: "ADMIN",
    ticket: "T-000123",
    fecha: "01/03/2026",
    hora: "13:20",
    total: "$12.450,00",
    pago: "EFECTIVO",
  };

  const previewLines = [];
  if (safeConfig.businessName) previewLines.push(centerPreviewText(safeConfig.businessName));
  if (safeConfig.addressLine) previewLines.push(centerPreviewText(safeConfig.addressLine));
  if (safeConfig.cityLine) previewLines.push(centerPreviewText(safeConfig.cityLine));
  previewLines.push("--------------------------------");
  if (safeConfig.includeComprobante) previewLines.push("Comprobante: Factura B");
  if (safeConfig.includeTicketNumber) previewLines.push(`Ticket: ${templateVars.ticket}`);
  if (safeConfig.includeDate) previewLines.push(`Fecha: ${templateVars.fecha}`);
  if (safeConfig.includeTime) previewLines.push(`Hora: ${templateVars.hora}`);
  if (safeConfig.includeSeller) previewLines.push(`Vendedor: ${templateVars.vendedor}`);
  previewLines.push("--------------------------------");
  if (safeConfig.includeClient) {
    previewLines.push(`Cliente: ${templateVars.cliente}`);
    previewLines.push("--------------------------------");
  }
  previewLines.push("2 x GASEOSA COLA      $4.500,00");
  previewLines.push("1 x AGUA MINERAL      $3.450,00");
  previewLines.push("--------------------------------");
  previewLines.push(`TOTAL: ${templateVars.total}`);
  if (safeConfig.includePaymentDetail) {
    previewLines.push(`Pago: ${templateVars.pago}`);
  }
  if (customLines.length) {
    previewLines.push("--------------------------------");
    customLines.forEach((line) => {
      const rendered = formatTicketTemplateLine(line, templateVars);
      if (rendered) previewLines.push(rendered);
    });
  }
  if (safeConfig.footerText) {
    previewLines.push("--------------------------------");
    previewLines.push(centerPreviewText(safeConfig.footerText));
  }

  return {
    logoDataUrl: safeConfig.logoDataUrl || "",
    lines: previewLines,
  };
}

export default function Configuracion({ user, setToast }) {
  const role = String(user?.role || "").toUpperCase();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FALLBACK);
  const [ticketConfig, setTicketConfig] = useState(DEFAULT_TICKET_CONFIG);
  const [deliveryConditions, setDeliveryConditions] = useState(DEFAULT_DELIVERY_CONDITIONS);
  const [deliveryShiftConfig, setDeliveryShiftConfig] = useState(DEFAULT_DELIVERY_SHIFT_CONFIG);
  const [cajaConfig, setCajaConfig] = useState(DEFAULT_CAJA_CONFIG);
  const [newDenomination, setNewDenomination] = useState("");
  const [priceOverrideUserIds, setPriceOverrideUserIds] = useState([]);
  const [stockControlUserIds, setStockControlUserIds] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [savingPriceOverrides, setSavingPriceOverrides] = useState(false);
  const [savingStockControlUsers, setSavingStockControlUsers] = useState(false);
  const [priceLists, setPriceLists] = useState(DEFAULT_PRICE_LISTS);
  const [defaultPriceListKey, setDefaultPriceListKey] = useState(DEFAULT_PRICE_LIST_KEY);
  const [newPriceListName, setNewPriceListName] = useState("");
  const [savingPriceLists, setSavingPriceLists] = useState(false);
  const [transferLocations, setTransferLocations] = useState([
    { code: "LOCAL", name: "Local" },
    { code: "GALPON", name: "Galpon" },
  ]);
  const [transferPairs, setTransferPairs] = useState([
    { fromCode: "GALPON", toCode: "LOCAL" },
    { fromCode: "LOCAL", toCode: "GALPON" },
  ]);
  const [savingTransferPairs, setSavingTransferPairs] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetPasswordPrompt, setShowResetPasswordPrompt] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmationText, setResetConfirmationText] = useState("");
  const [resettingAppData, setResettingAppData] = useState(false);

  const canEdit = useMemo(() => {
    return role === "ADMIN" || role === "CAJERO";
  }, [role]);

  const canManagePriceOverrides = useMemo(() => role === "ADMIN", [role]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/settings/locations");
      setForm({
        local: {
          address: data?.local?.address || FALLBACK.local.address,
          lat: Number(data?.local?.lat ?? FALLBACK.local.lat),
          lng: Number(data?.local?.lng ?? FALLBACK.local.lng),
        },
        deposito: {
          address: data?.deposito?.address || FALLBACK.deposito.address,
          lat: Number(data?.deposito?.lat ?? FALLBACK.deposito.lat),
          lng: Number(data?.deposito?.lng ?? FALLBACK.deposito.lng),
        },
        extras: Array.isArray(data?.extras) ? data.extras : [],
      });
    } catch {
      setToast?.({ message: "No se pudo cargar la configuracion de ubicaciones", type: "error" });
      setForm(FALLBACK);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const cfg = loadTicketConfig();
    setTicketConfig({ ...cfg, customLinesText: (cfg.customLines || []).join("\n") });
    setDeliveryConditions(loadDeliveryConditions());
    setDeliveryShiftConfig(loadDeliveryShiftConfig());
    setCajaConfig(loadCajaConfig());

    api
      .get("/settings/price-lists")
      .then(({ data }) => {
        const normalized = normalizePriceListsConfig(data);
        setPriceLists(normalized.lists);
        setDefaultPriceListKey(normalized.defaultKey);
      })
      .catch(() => {
        setPriceLists(DEFAULT_PRICE_LISTS);
        setDefaultPriceListKey(DEFAULT_PRICE_LIST_KEY);
      });

    api
      .get("/settings/inventory-transfer-pairs")
      .then(({ data }) => {
        setTransferLocations(
          Array.isArray(data?.locations) && data.locations.length
            ? data.locations
            : [
                { code: "LOCAL", name: "Local" },
                { code: "GALPON", name: "Galpon" },
              ]
        );
        setTransferPairs(
          Array.isArray(data?.pairs) && data.pairs.length
            ? data.pairs
            : [
                { fromCode: "GALPON", toCode: "LOCAL" },
                { fromCode: "LOCAL", toCode: "GALPON" },
              ]
        );
      })
      .catch(() => {
        setTransferLocations([
          { code: "LOCAL", name: "Local" },
          { code: "GALPON", name: "Galpon" },
        ]);
        setTransferPairs([
          { fromCode: "GALPON", toCode: "LOCAL" },
          { fromCode: "LOCAL", toCode: "GALPON" },
        ]);
      });
  }, []);

  useEffect(() => {
    if (!canManagePriceOverrides) return;

    const loadPriceOverrideSettings = async () => {
      try {
        const [usersRes, permissionsRes] = await Promise.all([
          api.get("/users"),
          api.get("/settings/price-overrides"),
        ]);
        setAvailableUsers(usersRes.data || []);
        setPriceOverrideUserIds(Array.isArray(permissionsRes.data?.userIds) ? permissionsRes.data.userIds : []);
      } catch {
        setToast?.({ message: "No se pudieron cargar permisos de cambio de precio", type: "error" });
      }
    };

    loadPriceOverrideSettings();
  }, [canManagePriceOverrides, setToast]);

  useEffect(() => {
    if (!canManagePriceOverrides) return;

    const loadStockControlPermissionSettings = async () => {
      try {
        const { data } = await api.get("/settings/stock-control-users");
        setStockControlUserIds(Array.isArray(data?.userIds) ? data.userIds : []);
      } catch {
        setToast?.({ message: "No se pudieron cargar permisos de control de stock", type: "error" });
      }
    };

    loadStockControlPermissionSettings();
  }, [canManagePriceOverrides, setToast]);

  const setPoint = (key, field, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: field === "lat" || field === "lng" ? toNumber(value) : value,
      },
    }));
  };

  const addExtra = () => {
    setForm((prev) => ({
      ...prev,
      extras: [
        ...prev.extras,
        { id: crypto.randomUUID(), name: "", address: "", lat: prev.local.lat, lng: prev.local.lng },
      ],
    }));
  };

  const setExtra = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      extras: prev.extras.map((row, i) =>
        i === index ? { ...row, [field]: field === "lat" || field === "lng" ? toNumber(value) : value } : row
      ),
    }));
  };

  const removeExtra = (index) => {
    setForm((prev) => ({
      ...prev,
      extras: prev.extras.filter((_, i) => i !== index),
    }));
  };

  const save = async () => {
    if (!canEdit) {
      setToast?.({ message: "Solo ADMIN o CAJERO pueden editar ubicaciones", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        local: {
          address: String(form.local.address || "").trim(),
          lat: Number(form.local.lat),
          lng: Number(form.local.lng),
        },
        deposito: {
          address: String(form.deposito.address || "").trim(),
          lat: Number(form.deposito.lat),
          lng: Number(form.deposito.lng),
        },
        extras: form.extras.map((x) => ({
          id: x.id || crypto.randomUUID(),
          name: String(x.name || "").trim(),
          address: String(x.address || "").trim(),
          lat: Number(x.lat),
          lng: Number(x.lng),
        })),
      };
      await api.put("/settings/locations", payload);
      const transferSettings = await api.get("/settings/inventory-transfer-pairs");
      setTransferLocations(
        Array.isArray(transferSettings.data?.locations) ? transferSettings.data.locations : []
      );
      setTransferPairs(Array.isArray(transferSettings.data?.pairs) ? transferSettings.data.pairs : []);
      setToast?.({ message: "Configuracion guardada", type: "success" });
      load();
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo guardar la configuracion",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const setTicketField = (field, value) => {
    setTicketConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleTicketLogoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!String(file.type || "").startsWith("image/")) {
      setToast?.({ message: "Selecciona una imagen valida para el logo", type: "error" });
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTicketField("logoDataUrl", String(reader.result || ""));
      setToast?.({ message: "Logo cargado para el ticket", type: "success" });
      event.target.value = "";
    };
    reader.onerror = () => {
      setToast?.({ message: "No se pudo leer la imagen del logo", type: "error" });
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const saveTicketSettings = () => {
    if (!canEdit) {
      setToast?.({ message: "Solo ADMIN o CAJERO pueden editar ticket", type: "error" });
      return;
    }
    try {
      const normalized = saveTicketConfig({
        ...ticketConfig,
        customLines: String(
          ticketConfig.customLinesText ?? (ticketConfig.customLines || []).join("\n")
        )
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      });
      setTicketConfig({ ...normalized, customLinesText: normalized.customLines.join("\n") });
      setToast?.({ message: "Configuracion de ticket guardada", type: "success" });
    } catch {
      setToast?.({ message: "No se pudo guardar configuracion de ticket", type: "error" });
    }
  };

  const resetTicketSettings = () => {
    if (!canEdit) return;
    const next = { ...DEFAULT_TICKET_CONFIG, customLinesText: DEFAULT_TICKET_CONFIG.customLines.join("\n") };
    setTicketConfig(next);
    saveTicketConfig(next);
    setToast?.({ message: "Ticket restaurado a valores por defecto", type: "success" });
  };

  const addDeliveryCondition = () => {
    setDeliveryConditions((prev) => [...prev, { value: "", label: "" }]);
  };

  const setDeliveryCondition = (index, field, value) => {
    setDeliveryConditions((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [field]:
                field === "value"
                  ? String(value || "")
                      .toUpperCase()
                      .replace(/\s+/g, "_")
                  : value,
            }
          : row
      )
    );
  };

  const removeDeliveryCondition = (index) => {
    setDeliveryConditions((prev) => prev.filter((_, i) => i !== index));
  };

  const saveDeliveryConditionSettings = () => {
    if (!canEdit) {
      setToast?.({ message: "Solo ADMIN o CAJERO pueden editar condiciones", type: "error" });
      return;
    }
    try {
      const normalized = saveDeliveryConditions(deliveryConditions);
      setDeliveryConditions(normalized);
      setToast?.({ message: "Condiciones de cobro guardadas", type: "success" });
    } catch {
      setToast?.({ message: "No se pudieron guardar condiciones", type: "error" });
    }
  };

  const resetDeliveryConditions = () => {
    if (!canEdit) return;
    const normalized = saveDeliveryConditions(DEFAULT_DELIVERY_CONDITIONS);
    setDeliveryConditions(normalized);
    setToast?.({ message: "Condiciones restauradas por defecto", type: "success" });
  };

  const setDeliveryShiftField = (field, value) => {
    setDeliveryShiftConfig((prev) => ({ ...prev, [field]: value }));
  };

  const saveDeliveryShiftSettings = () => {
    if (!canEdit) {
      setToast?.({ message: "Solo ADMIN o CAJERO pueden editar turnos", type: "error" });
      return;
    }
    try {
      const normalized = saveDeliveryShiftConfig(deliveryShiftConfig);
      setDeliveryShiftConfig(normalized);
      setToast?.({ message: "Horarios de turnos guardados", type: "success" });
    } catch {
      setToast?.({ message: "No se pudieron guardar horarios de turnos", type: "error" });
    }
  };

  const resetDeliveryShiftSettings = () => {
    if (!canEdit) return;
    const normalized = saveDeliveryShiftConfig(DEFAULT_DELIVERY_SHIFT_CONFIG);
    setDeliveryShiftConfig(normalized);
    setToast?.({ message: "Horarios de turnos restaurados", type: "success" });
  };

  const setCajaField = (field, value) => {
    setCajaConfig((prev) => ({ ...prev, [field]: value }));
  };

  const saveCajaSettings = () => {
    if (!canEdit) {
      setToast?.({ message: "Solo ADMIN o CAJERO pueden editar frecuencia de caja", type: "error" });
      return;
    }
    try {
      const normalized = saveCajaConfig(cajaConfig);
      setCajaConfig(normalized);
      setToast?.({ message: "Frecuencia de control de caja guardada", type: "success" });
    } catch {
      setToast?.({ message: "No se pudo guardar configuracion de caja", type: "error" });
    }
  };

  const resetCajaSettings = () => {
    if (!canEdit) return;
    const normalized = saveCajaConfig(DEFAULT_CAJA_CONFIG);
    setCajaConfig(normalized);
    setToast?.({ message: "Frecuencia de caja restaurada por defecto", type: "success" });
  };

  const addCajaDenomination = () => {
    const amount = Number(newDenomination);
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast?.({ message: "Ingresa una denominacion valida", type: "error" });
      return;
    }
    setCajaConfig((prev) => ({
      ...prev,
      denominations: Array.from(new Set([...(prev.denominations || []), Math.round(amount)])).sort((a, b) => a - b),
    }));
    setNewDenomination("");
  };

  const removeCajaDenomination = (value) => {
    setCajaConfig((prev) => ({
      ...prev,
      denominations: (prev.denominations || []).filter((item) => item !== value),
    }));
  };

  const togglePriceOverrideUser = (userId) => {
    setPriceOverrideUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleStockControlUser = (userId) => {
    setStockControlUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const savePriceOverrideSettings = async () => {
    if (!canManagePriceOverrides) {
      setToast?.({ message: "Solo ADMIN puede editar permisos de cambio de precio", type: "error" });
      return;
    }

    setSavingPriceOverrides(true);
    try {
      const payload = { userIds: Array.from(new Set(priceOverrideUserIds)) };
      const { data } = await api.put("/settings/price-overrides", payload);
      setPriceOverrideUserIds(Array.isArray(data?.userIds) ? data.userIds : payload.userIds);
      setToast?.({ message: "Permisos de cambio de precio guardados", type: "success" });
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudieron guardar los permisos",
        type: "error",
      });
    } finally {
      setSavingPriceOverrides(false);
    }
  };

  const saveStockControlUserSettings = async () => {
    if (!canManagePriceOverrides) {
      setToast?.({ message: "Solo ADMIN puede editar permisos de control de stock", type: "error" });
      return;
    }

    setSavingStockControlUsers(true);
    try {
      const payload = { userIds: Array.from(new Set(stockControlUserIds)) };
      const { data } = await api.put("/settings/stock-control-users", payload);
      setStockControlUserIds(Array.isArray(data?.userIds) ? data.userIds : payload.userIds);
      setToast?.({ message: "Permisos de control de stock guardados", type: "success" });
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudieron guardar los permisos de control de stock",
        type: "error",
      });
    } finally {
      setSavingStockControlUsers(false);
    }
  };

  const setPriceListRow = (index, field, value) => {
    setPriceLists((prev) =>
      prev.map((row, idx) =>
        idx === index
          ? {
              ...row,
              [field]: field === "key" ? normalizePriceListKey(value) : value,
            }
          : row
      )
    );
  };

  const addPriceList = () => {
    const label = String(newPriceListName || "").trim();
    const key = normalizePriceListKey(label);
    if (!label || !key) return;
    if (priceLists.some((row) => row.key === key)) {
      setToast?.({ message: "Esa lista ya existe", type: "error" });
      return;
    }
    setPriceLists((prev) => [...prev, { key, label }]);
    setNewPriceListName("");
  };

  const removePriceList = (key) => {
    if (key === "MINORISTA" || key === "MAYORISTA") return;
    setPriceLists((prev) => prev.filter((row) => row.key !== key));
    setDefaultPriceListKey((prev) => (prev === key ? DEFAULT_PRICE_LIST_KEY : prev));
  };

  const setTransferPairRow = (index, field, value) => {
    setTransferPairs((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    );
  };

  const addTransferPair = () => {
    const fallbackFrom = transferLocations[0]?.code || "GALPON";
    const fallbackTo =
      transferLocations.find((row) => row.code !== fallbackFrom)?.code || "LOCAL";
    setTransferPairs((prev) => [...prev, { fromCode: fallbackFrom, toCode: fallbackTo }]);
  };

  const removeTransferPair = (index) => {
    setTransferPairs((prev) => prev.filter((_, idx) => idx !== index));
  };

  const saveTransferPairSettings = async () => {
    if (!canEdit) {
      setToast?.({ message: "Solo ADMIN o CAJERO pueden editar transferencias", type: "error" });
      return;
    }
    setSavingTransferPairs(true);
    try {
      const payload = { pairs: transferPairs };
      const { data } = await api.put("/settings/inventory-transfer-pairs", payload);
      setTransferLocations(Array.isArray(data?.locations) ? data.locations : transferLocations);
      setTransferPairs(Array.isArray(data?.pairs) ? data.pairs : transferPairs);
      setToast?.({ message: "Combinaciones de transferencia guardadas", type: "success" });
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudieron guardar las transferencias",
        type: "error",
      });
    } finally {
      setSavingTransferPairs(false);
    }
  };

  const savePriceListsSettings = async () => {
    if (!canEdit) {
      setToast?.({ message: "Solo ADMIN o CAJERO pueden editar listas", type: "error" });
      return;
    }
      setSavingPriceLists(true);
    try {
      const payload = normalizePriceListsConfig({ lists: priceLists, defaultKey: defaultPriceListKey });
      const { data } = await api.put("/settings/price-lists", payload);
      const normalized = normalizePriceListsConfig(data);
      setPriceLists(normalized.lists);
      setDefaultPriceListKey(normalized.defaultKey);
      setToast?.({ message: "Listas de precio guardadas", type: "success" });
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudieron guardar las listas de precio",
        type: "error",
      });
    } finally {
      setSavingPriceLists(false);
    }
  };

  const openResetFlow = () => {
    if (!canManagePriceOverrides) {
      setToast?.({ message: "Solo un administrador puede borrar todos los datos", type: "error" });
      return;
    }
    setShowResetConfirm(true);
  };

  const continueResetFlow = () => {
    setShowResetConfirm(false);
    setResetPassword("");
    setResetConfirmationText("");
    setShowResetPasswordPrompt(true);
  };

  const cancelResetFlow = () => {
    setShowResetConfirm(false);
    setShowResetPasswordPrompt(false);
    setResetPassword("");
    setResetConfirmationText("");
    setResettingAppData(false);
  };

  const handleResetAllData = async () => {
    if (String(resetConfirmationText || "").trim().toUpperCase() !== "BORRAR TODO") {
      setToast?.({ message: 'Debes escribir "BORRAR TODO" para continuar', type: "error" });
      return;
    }

    if (!String(resetPassword || "").trim()) {
      setToast?.({ message: "Debes ingresar tu contrasena para continuar", type: "error" });
      return;
    }

    setResettingAppData(true);
    try {
      await api.post("/settings/reset-app-data", { password: resetPassword });
      cancelResetFlow();
      setToast?.({ message: "Aplicacion vaciada correctamente", type: "success" });
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudieron borrar los datos",
        type: "error",
      });
    } finally {
      setResettingAppData(false);
    }
  };

  if (loading) {
    return <div className="card p-6">Cargando configuracion...</div>;
  }

  const panelInputClass =
    "w-full rounded-xl border border-zinc-700 bg-[#181a1f] px-3 py-2.5 text-sm font-medium text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-[#d97706]";
  const panelTextareaClass = `${panelInputClass} min-h-24`;
  const sectionLabelClass = "text-[11px] uppercase font-black tracking-[0.16em] text-zinc-500";
  const primaryButtonClass =
    "rounded-xl bg-[#d97706] px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-[#c86b04] disabled:cursor-not-allowed disabled:opacity-50";
  const secondaryButtonClass =
    "rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-bold text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50";
  const ticketPreview = buildTicketPreview(ticketConfig);

  return (
    <div className="min-h-full rounded-[28px] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_24%),linear-gradient(180deg,#090a0d_0%,#0d0e11_100%)] p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-[#0f1013]/95 px-5 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Panel de Configuracion General</div>
          <div className="mt-1 text-2xl font-black tracking-tight text-white">Configuracion</div>
        </div>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-right">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Operador</div>
          <div className="text-sm font-black text-white">{user?.fullName || user?.full_name || user?.username || "ADMIN"}</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{role}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
      <SettingsCard
        title="Informacion de la Distribuidora"
        subtitle="Nombre comercial, direccion base y coordenadas del local."
      >
      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-3 text-sm uppercase font-black text-white tracking-[0.18em]">Local</div>
        <input
          className={`${panelInputClass} md:col-span-2`}
          placeholder="Direccion del local"
          value={form.local.address}
          onChange={(e) => setPoint("local", "address", e.target.value)}
          disabled={!canEdit}
        />
        <input
          className={panelInputClass}
          type="number"
          step="0.000001"
          placeholder="Latitud"
          value={form.local.lat}
          onChange={(e) => setPoint("local", "lat", e.target.value)}
          disabled={!canEdit}
        />
        <input
          className={`${panelInputClass} md:col-span-1`}
          type="number"
          step="0.000001"
          placeholder="Longitud"
          value={form.local.lng}
          onChange={(e) => setPoint("local", "lng", e.target.value)}
          disabled={!canEdit}
        />
      </div>
      </SettingsCard>

      <SettingsCard
        title="Gestion de Deposito"
        subtitle="Direccion del deposito y puntos adicionales de operacion."
      >
      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-3 text-sm uppercase font-black text-white tracking-[0.18em]">Deposito</div>
        <input
          className={`${panelInputClass} md:col-span-2`}
          placeholder="Direccion del deposito"
          value={form.deposito.address}
          onChange={(e) => setPoint("deposito", "address", e.target.value)}
          disabled={!canEdit}
        />
        <input
          className={panelInputClass}
          type="number"
          step="0.000001"
          placeholder="Latitud"
          value={form.deposito.lat}
          onChange={(e) => setPoint("deposito", "lat", e.target.value)}
          disabled={!canEdit}
        />
        <input
          className={`${panelInputClass} md:col-span-1`}
          type="number"
          step="0.000001"
          placeholder="Longitud"
          value={form.deposito.lng}
          onChange={(e) => setPoint("deposito", "lng", e.target.value)}
          disabled={!canEdit}
        />
      </div>

      <div className="mt-4 space-y-3 rounded-xl border border-zinc-800 bg-[#0f1115] p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Ubicaciones propias</div>
          <button className={secondaryButtonClass} onClick={addExtra} disabled={!canEdit}>
            Agregar ubicacion
          </button>
        </div>
        {form.extras.length === 0 ? (
          <div className="text-zinc-500 text-sm">No hay ubicaciones extra cargadas.</div>
        ) : (
          <div className="space-y-2">
            {form.extras.map((item, idx) => (
              <div key={item.id || idx} className="grid md:grid-cols-6 gap-2">
                <input
                  className={panelInputClass}
                  placeholder="Nombre"
                  value={item.name || ""}
                  onChange={(e) => setExtra(idx, "name", e.target.value)}
                  disabled={!canEdit}
                />
                <input
                  className={`${panelInputClass} md:col-span-2`}
                  placeholder="Direccion"
                  value={item.address || ""}
                  onChange={(e) => setExtra(idx, "address", e.target.value)}
                  disabled={!canEdit}
                />
                <input
                  className={panelInputClass}
                  type="number"
                  step="0.000001"
                  placeholder="Lat"
                  value={item.lat}
                  onChange={(e) => setExtra(idx, "lat", e.target.value)}
                  disabled={!canEdit}
                />
                <input
                  className={panelInputClass}
                  type="number"
                  step="0.000001"
                  placeholder="Lng"
                  value={item.lng}
                  onChange={(e) => setExtra(idx, "lng", e.target.value)}
                  disabled={!canEdit}
                />
                <button className={secondaryButtonClass} onClick={() => removeExtra(idx)} disabled={!canEdit}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </SettingsCard>

      <SettingsCard
        title="Listas de Precio"
        subtitle="Crea listas nuevas para clientes, ventas y productos."
      >
      <div className="space-y-4">
        <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
          Listas disponibles
        </div>

        <div className="space-y-2">
          {priceLists.map((row, idx) => {
            const isBase = row.key === "MINORISTA" || row.key === "MAYORISTA";
            return (
              <div key={row.key} className="grid md:grid-cols-7 gap-2">
                <input
                  className={`${panelInputClass} md:col-span-2`}
                  value={row.key}
                  onChange={(e) => setPriceListRow(idx, "key", e.target.value)}
                  disabled={!canEdit || isBase}
                />
                <input
                  className={`${panelInputClass} md:col-span-4`}
                  value={row.label}
                  onChange={(e) => setPriceListRow(idx, "label", e.target.value)}
                  disabled={!canEdit}
                />
                <button
                  className={secondaryButtonClass}
                  onClick={() => removePriceList(row.key)}
                  disabled={!canEdit || isBase}
                >
                  {isBase ? "Base" : "Quitar"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="max-w-xl">
          <label className={sectionLabelClass}>Lista predeterminada</label>
          <select
            className={`${panelInputClass} mt-1`}
            value={defaultPriceListKey}
            onChange={(e) => setDefaultPriceListKey(e.target.value)}
            disabled={!canEdit}
          >
            {priceLists.map((row) => (
              <option key={row.key} value={row.key}>
                {row.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 max-w-xl">
          <input
            className={`${panelInputClass} w-full`}
            placeholder="Ej: Revendedor"
            value={newPriceListName}
            onChange={(e) => setNewPriceListName(e.target.value)}
            disabled={!canEdit}
          />
          <button className={secondaryButtonClass} onClick={addPriceList} disabled={!canEdit}>
            Agregar lista
          </button>
        </div>

        <div className="flex justify-end">
          <button
            className={primaryButtonClass}
            onClick={savePriceListsSettings}
            disabled={!canEdit || savingPriceLists}
          >
            {savingPriceLists ? "Guardando listas..." : "Guardar listas"}
          </button>
        </div>
      </div>
      </SettingsCard>

      <SettingsCard
        title="Transferencias de Inventario"
        subtitle="Define entre que ubicaciones se puede mover mercaderia."
      >
      <div className="space-y-4">
        <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
          Combinaciones habilitadas
        </div>

        <div className="space-y-2">
          {transferPairs.map((row, idx) => (
            <div key={`${row.fromCode}-${row.toCode}-${idx}`} className="grid md:grid-cols-7 gap-2">
              <select
                className={`${panelInputClass} md:col-span-3`}
                value={row.fromCode}
                onChange={(e) => setTransferPairRow(idx, "fromCode", e.target.value)}
                disabled={!canEdit}
              >
                {transferLocations.map((location) => (
                  <option key={`from-${location.code}`} value={location.code}>
                    {location.name}
                  </option>
                ))}
              </select>
              <select
                className={`${panelInputClass} md:col-span-3`}
                value={row.toCode}
                onChange={(e) => setTransferPairRow(idx, "toCode", e.target.value)}
                disabled={!canEdit}
              >
                {transferLocations.map((location) => (
                  <option key={`to-${location.code}`} value={location.code}>
                    {location.name}
                  </option>
                ))}
              </select>
              <button
                className={secondaryButtonClass}
                onClick={() => removeTransferPair(idx)}
                disabled={!canEdit}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-between gap-2">
          <button className={secondaryButtonClass} onClick={addTransferPair} disabled={!canEdit}>
            Agregar combinacion
          </button>
          <button
            className={primaryButtonClass}
            onClick={saveTransferPairSettings}
            disabled={!canEdit || savingTransferPairs}
          >
            {savingTransferPairs ? "Guardando..." : "Guardar transferencias"}
          </button>
        </div>
      </div>
      </SettingsCard>

      <SettingsCard
        title="Permisos de Usuarios"
        subtitle='Define que usuarios pueden usar el atajo "/" para editar precio o costo.'
      >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
              Permisos de cambio de precio
            </div>
            <div className="text-sm text-zinc-400 mt-1">
              Define que usuarios pueden usar el atajo <span className="font-bold text-white">/</span> para editar el precio o costo solo en la transaccion actual.
            </div>
          </div>
        </div>

        {!canManagePriceOverrides ? (
          <div className="text-sm text-zinc-500">Solo un administrador puede modificar estos permisos.</div>
        ) : availableUsers.length === 0 ? (
          <div className="text-sm text-zinc-500">No hay usuarios cargados para configurar.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-2">
            {availableUsers.map((row) => {
              const rowRole = String(row.role || "").toUpperCase();
              const checked = priceOverrideUserIds.includes(row.id);
              return (
                <label
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-3"
                >
                  <div>
                    <div className="text-sm font-bold text-white">
                      {row.full_name || row.fullName || row.username}
                    </div>
                    <div className="text-xs uppercase tracking-wider text-zinc-500">
                      {row.username} // {rowRole}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePriceOverrideUser(row.id)}
                    disabled={savingPriceOverrides}
                  />
                </label>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <button
            className={primaryButtonClass}
            onClick={savePriceOverrideSettings}
            disabled={!canManagePriceOverrides || savingPriceOverrides}
          >
            {savingPriceOverrides ? "Guardando permisos..." : "Guardar permisos"}
          </button>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
                Permisos de control de stock
              </div>
              <div className="text-sm text-zinc-400 mt-1">
                Define que usuarios pueden iniciar y finalizar un control de stock completo.
              </div>
            </div>
          </div>

          {!canManagePriceOverrides ? (
            <div className="mt-3 text-sm text-zinc-500">Solo un administrador puede modificar estos permisos.</div>
          ) : availableUsers.length === 0 ? (
            <div className="mt-3 text-sm text-zinc-500">No hay usuarios cargados para configurar.</div>
          ) : (
            <div className="mt-3 grid md:grid-cols-2 gap-2">
              {availableUsers.map((row) => {
                const rowRole = String(row.role || "").toUpperCase();
                const checked = stockControlUserIds.includes(row.id);
                return (
                  <label
                    key={`stock-${row.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-3"
                  >
                    <div>
                      <div className="text-sm font-bold text-white">
                        {row.full_name || row.fullName || row.username}
                      </div>
                      <div className="text-xs uppercase tracking-wider text-zinc-500">
                        {row.username} // {rowRole}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStockControlUser(row.id)}
                      disabled={savingStockControlUsers}
                    />
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              className={primaryButtonClass}
              onClick={saveStockControlUserSettings}
              disabled={!canManagePriceOverrides || savingStockControlUsers}
            >
              {savingStockControlUsers ? "Guardando permisos..." : "Guardar permisos de stock"}
            </button>
          </div>
        </div>
      </div>
      </SettingsCard>

      <SettingsCard
        title="Opciones de Ticket de Venta"
        subtitle="Encabezado, detalles visibles y lineas personalizadas."
      >
      <div className="space-y-4">
        <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Configuracion de ticket</div>

        <div className="grid md:grid-cols-2 gap-3">
          <input
            className={panelInputClass}
            placeholder="Nombre del negocio"
            value={ticketConfig.businessName || ""}
            onChange={(e) => setTicketField("businessName", e.target.value)}
            disabled={!canEdit}
          />
          <input
            className={panelInputClass}
            placeholder="Direccion en ticket"
            value={ticketConfig.addressLine || ""}
            onChange={(e) => setTicketField("addressLine", e.target.value)}
            disabled={!canEdit}
          />
          <input
            className={panelInputClass}
            placeholder="Ciudad / Provincia"
            value={ticketConfig.cityLine || ""}
            onChange={(e) => setTicketField("cityLine", e.target.value)}
            disabled={!canEdit}
          />
          <input
            className={panelInputClass}
            placeholder="Pie de ticket"
            value={ticketConfig.footerText || ""}
            onChange={(e) => setTicketField("footerText", e.target.value)}
            disabled={!canEdit}
          />
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#0f1115] p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className={sectionLabelClass}>Logo superior del ticket</div>
              <div className="mt-1 text-sm text-zinc-400">
                Se imprime pequeno arriba del ticket. El preview se muestra en blanco y negro.
              </div>
            </div>
            <div className="flex gap-2">
              <label className={secondaryButtonClass}>
                Cargar logo
                <input type="file" accept="image/*" className="hidden" onChange={handleTicketLogoChange} />
              </label>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setTicketField("logoDataUrl", "")}
                disabled={!ticketConfig.logoDataUrl}
              >
                Quitar logo
              </button>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-2 text-sm">
          {[
            ["includeComprobante", "Mostrar comprobante"],
            ["includeTicketNumber", "Mostrar nro ticket"],
            ["includeDate", "Mostrar fecha"],
            ["includeTime", "Mostrar hora"],
            ["includeSeller", "Mostrar vendedor"],
            ["includeClient", "Mostrar cliente"],
            ["includePaymentDetail", "Mostrar detalle de pago"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={Boolean(ticketConfig[key])}
                onChange={(e) => setTicketField(key, e.target.checked)}
                disabled={!canEdit}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div>
          <label className={sectionLabelClass}>
            Lineas personalizadas (una por linea)
          </label>
          <textarea
            className={`${panelTextareaClass} mt-1`}
            placeholder={"Ej:\nTel: 381-000000\nCUIT: 20-00000000-0\nCliente: {{cliente}}\nTotal: {{total}}"}
            value={ticketConfig.customLinesText ?? (ticketConfig.customLines || []).join("\n")}
            onChange={(e) => setTicketField("customLinesText", e.target.value)}
            disabled={!canEdit}
          />
          <div className="text-[11px] text-zinc-500 mt-1">
            Variables disponibles: {"{{cliente}} {{vendedor}} {{ticket}} {{fecha}} {{hora}} {{total}} {{pago}}"}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Para centrar una linea personalizada usa el prefijo <span className="font-bold text-zinc-300">[C]</span>.
            Ejemplo: <span className="font-mono text-zinc-300">[C] Whatsapp: 3865-000000</span>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#0d0f13] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-zinc-400">Preview del Ticket</div>
            <div className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Vista previa
            </div>
          </div>
          <div className="mt-3 flex justify-center">
            <div className="w-full max-w-[320px] rounded-2xl border border-zinc-700 bg-[#f8f8f6] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]">
              {ticketPreview.logoDataUrl ? (
                <div className="mb-3 flex justify-center border-b border-zinc-300 pb-3">
                  <img
                    src={ticketPreview.logoDataUrl}
                    alt="Logo ticket"
                    className="max-h-14 w-auto object-contain grayscale contrast-200 brightness-110"
                  />
                </div>
              ) : null}
              <div className="font-mono text-[11px] leading-5 text-zinc-900 whitespace-pre-wrap break-words">
                {ticketPreview.lines.join("\n")}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className={secondaryButtonClass} onClick={resetTicketSettings} disabled={!canEdit}>
            Restaurar ticket
          </button>
          <button className={primaryButtonClass} onClick={saveTicketSettings} disabled={!canEdit}>
            Guardar ticket
          </button>
        </div>
      </div>
      </SettingsCard>

      <SettingsCard
        title="Condiciones de Envio y Cobro"
        subtitle="Valores internos y descripcion visible para reparto."
      >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
            Condiciones de cobro de envio
          </div>
          <button className={secondaryButtonClass} onClick={addDeliveryCondition} disabled={!canEdit}>
            Agregar condicion
          </button>
        </div>

        <div className="space-y-2">
          {deliveryConditions.map((row, idx) => (
            <div key={`${row.value}-${idx}`} className="grid md:grid-cols-7 gap-2">
              <input
                className={`${panelInputClass} md:col-span-2`}
                placeholder="VALOR_INTERNO"
                value={row.value || ""}
                onChange={(e) => setDeliveryCondition(idx, "value", e.target.value)}
                disabled={!canEdit}
              />
              <input
                className={`${panelInputClass} md:col-span-4`}
                placeholder="Texto visible"
                value={row.label || ""}
                onChange={(e) => setDeliveryCondition(idx, "label", e.target.value)}
                disabled={!canEdit}
              />
              <button className={secondaryButtonClass} onClick={() => removeDeliveryCondition(idx)} disabled={!canEdit}>
                Quitar
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button className={secondaryButtonClass} onClick={resetDeliveryConditions} disabled={!canEdit}>
            Restaurar condiciones
          </button>
          <button className={primaryButtonClass} onClick={saveDeliveryConditionSettings} disabled={!canEdit}>
            Guardar condiciones
          </button>
        </div>
      </div>
      </SettingsCard>

      <SettingsCard
        title="Turnos de Envio"
        subtitle="Define nombres visibles, horarios de salida y cortes automaticos."
      >
      <div className="space-y-4">
        <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
          Configuracion de turnos de envio
        </div>
        <p className="text-zinc-400 text-sm">
          Puedes cambiar el nombre visible de cada turno, la hora mostrada como salida y los cortes que usa el sistema para pasar de un turno al siguiente.
        </p>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={sectionLabelClass}>Nombre turno 1</label>
            <input
              className={`${panelInputClass} mt-1 w-full`}
              value={deliveryShiftConfig.morningLabel || "MA\u00d1ANA"}
              onChange={(e) => setDeliveryShiftField("morningLabel", e.target.value.toUpperCase())}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className={sectionLabelClass}>Hora salida turno 1</label>
            <input
              type="time"
              className={`${panelInputClass} mt-1 w-full`}
              value={deliveryShiftConfig.morningDepartureTime || "11:00"}
              onChange={(e) => setDeliveryShiftField("morningDepartureTime", e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className={sectionLabelClass}>Nombre turno 2</label>
            <input
              className={`${panelInputClass} mt-1 w-full`}
              value={deliveryShiftConfig.afternoonLabel || "TARDE"}
              onChange={(e) => setDeliveryShiftField("afternoonLabel", e.target.value.toUpperCase())}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className={sectionLabelClass}>Hora salida turno 2</label>
            <input
              type="time"
              className={`${panelInputClass} mt-1 w-full`}
              value={deliveryShiftConfig.afternoonDepartureTime || "19:00"}
              onChange={(e) => setDeliveryShiftField("afternoonDepartureTime", e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className={sectionLabelClass}>Corte 1 (pasa a turno 2)</label>
            <input
              type="time"
              className={`${panelInputClass} mt-1 w-full`}
              value={deliveryShiftConfig.morningToAfternoonAt || "11:00"}
              onChange={(e) => setDeliveryShiftField("morningToAfternoonAt", e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className={sectionLabelClass}>Corte 2 (pasa a turno 1 +1 dia)</label>
            <input
              type="time"
              className={`${panelInputClass} mt-1 w-full`}
              value={deliveryShiftConfig.rolloverToNextDayAt || "19:30"}
              onChange={(e) => setDeliveryShiftField("rolloverToNextDayAt", e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider mb-2">Vista previa</div>
          <div className="grid md:grid-cols-2 gap-3 text-sm text-zinc-200">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
              {`${deliveryShiftConfig.morningLabel || "MA\u00d1ANA"} (${deliveryShiftConfig.morningDepartureTime || "11:00"})`}
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
              {`${deliveryShiftConfig.afternoonLabel || "TARDE"} (${deliveryShiftConfig.afternoonDepartureTime || "19:00"})`}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className={secondaryButtonClass} onClick={resetDeliveryShiftSettings} disabled={!canEdit}>
            Restaurar horarios
          </button>
          <button className={primaryButtonClass} onClick={saveDeliveryShiftSettings} disabled={!canEdit}>
            Guardar horarios
          </button>
        </div>
      </div>
      </SettingsCard>

      <SettingsCard
        title="Control de Caja"
        subtitle="Frecuencia del control y denominaciones visibles en el cierre."
      >
      <div className="space-y-4">
        <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
          Frecuencia de control de caja
        </div>
        <p className="text-zinc-400 text-sm">
          Define cada cuanto tiempo se debe realizar el control de caja.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className={sectionLabelClass}>Frecuencia</label>
            <select
              className={`${panelInputClass} mt-1 w-full`}
              value={cajaConfig.frequency}
              onChange={(e) => setCajaField("frequency", e.target.value)}
              disabled={!canEdit}
            >
              {Object.values(FREQUENCY_OPTIONS).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {cajaConfig.frequency === "SEMANAL" && (
            <div>
              <label className={sectionLabelClass}>Dia de la semana</label>
              <select
                className={`${panelInputClass} mt-1 w-full`}
                value={cajaConfig.weekDay}
                onChange={(e) => setCajaField("weekDay", Number(e.target.value))}
                disabled={!canEdit}
              >
                <option value={0}>Domingo</option>
                <option value={1}>Lunes</option>
                <option value={2}>Martes</option>
                <option value={3}>Miercoles</option>
                <option value={4}>Jueves</option>
                <option value={5}>Viernes</option>
                <option value={6}>Sabado</option>
              </select>
            </div>
          )}

          {cajaConfig.frequency === "PERSONALIZADO" && (
            <div>
              <label className={sectionLabelClass}>Cada cuantos dias</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={`${panelInputClass} mt-1 w-full`}
                placeholder="1"
                value={cajaConfig.customDays || ""}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setCajaField("customDays", Number(val) || 1);
                }}
                disabled={!canEdit}
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className={sectionLabelClass}>Billetes para control de caja</label>
            <div className="text-sm text-zinc-400 mt-1">
              Define que denominaciones se muestran en el conteo de cierre.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(cajaConfig.denominations || []).map((denom) => (
              <div
                key={denom}
                className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white"
              >
                <span>${Number(denom).toLocaleString("es-AR")}</span>
                <button
                  type="button"
                  className="text-zinc-500 hover:text-rose-400"
                  onClick={() => removeCajaDenomination(denom)}
                  disabled={!canEdit}
                >
                  x
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 max-w-sm">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className={`${panelInputClass} w-full`}
              placeholder="Ej: 5000"
              value={newDenomination}
              onChange={(e) => setNewDenomination(sanitizePositiveInteger(e.target.value))}
              disabled={!canEdit}
            />
            <button type="button" className={secondaryButtonClass} onClick={addCajaDenomination} disabled={!canEdit}>
              Agregar
            </button>
          </div>
        </div>

        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
          <div className="text-sm text-zinc-300">
            <span className="text-zinc-500">Configuracion actual:</span>{" "}
            <span className="font-bold text-[#e85d04]">{getFrequencyDescription()}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className={secondaryButtonClass} onClick={resetCajaSettings} disabled={!canEdit}>
            Restaurar frecuencia
          </button>
          <button className={primaryButtonClass} onClick={saveCajaSettings} disabled={!canEdit}>
            Guardar frecuencia
          </button>
        </div>
      </div>
      </SettingsCard>

      <section className="rounded-2xl border border-rose-900/50 bg-[linear-gradient(180deg,rgba(80,10,10,0.36),rgba(28,12,12,0.55))] p-4 md:p-5 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
        <div>
          <div className="text-xl font-black tracking-tight text-rose-300">Zona peligrosa</div>
          <div className="text-sm text-zinc-300 mt-2">
            Borra clientes, productos, ventas, compras, caja, proveedores y demas datos operativos.
            Se conservan usuarios y configuraciones generales.
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={openResetFlow}
            disabled={!canManagePriceOverrides || resettingAppData}
          >
            Borrar todo
          </button>
          <button className={primaryButtonClass} onClick={save} disabled={saving || !canEdit}>
            {saving ? "Guardando..." : "Guardar configuracion"}
          </button>
        </div>
      </section>

      </div>

      {showResetConfirm ? (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#121212] p-6 space-y-4">
            <div className="text-xl font-black text-rose-400">BORRAR TODO</div>
            <div className="text-sm text-zinc-300">
              Esta accion eliminara todos los datos operativos de la aplicacion y no se puede deshacer.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn btn-muted" onClick={cancelResetFlow}>
                Cancelar
              </button>
              <button className="btn bg-rose-600 hover:bg-rose-500 text-white" onClick={continueResetFlow}>
                Si, continuar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showResetPasswordPrompt ? (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#121212] p-6 space-y-4">
            <div className="text-xl font-black text-rose-400">CONFIRMAR CON CONTRASENA</div>
            <div className="text-sm text-zinc-300">
              Escribe <span className="font-bold text-white">BORRAR TODO</span> e ingresa tu contrasena actual para confirmar el borrado total.
            </div>
            <div>
              <label className="text-xs uppercase font-bold text-zinc-500">Escribe BORRAR TODO</label>
              <input
                type="text"
                className="input mt-1 w-full"
                value={resetConfirmationText}
                onChange={(e) => setResetConfirmationText(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase font-bold text-zinc-500">Contrasena</label>
              <input
                type="password"
                className="input mt-1 w-full"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleResetAllData();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelResetFlow();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn btn-muted" onClick={cancelResetFlow} disabled={resettingAppData}>
                Cancelar
              </button>
              <button
                className="btn bg-rose-600 hover:bg-rose-500 text-white"
                onClick={handleResetAllData}
                disabled={resettingAppData || String(resetConfirmationText || "").trim().toUpperCase() !== "BORRAR TODO"}
              >
                {resettingAppData ? "Borrando..." : "Confirmar borrado"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
