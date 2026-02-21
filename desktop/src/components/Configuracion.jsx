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
  DEFAULT_CAJA_CONFIG,
  FREQUENCY_OPTIONS,
  loadCajaConfig,
  saveCajaConfig,
  getFrequencyDescription,
} from "../utils/cajaConfig";

const FALLBACK = {
  local: { address: "Avenida Mitre 831, Aguilares", lat: -27.432028, lng: -65.616528 },
  deposito: { address: "Avenida Mitre 831, Aguilares", lat: -27.432028, lng: -65.616528 },
  extras: [],
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function Configuracion({ user, setToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FALLBACK);
  const [ticketConfig, setTicketConfig] = useState(DEFAULT_TICKET_CONFIG);
  const [deliveryConditions, setDeliveryConditions] = useState(DEFAULT_DELIVERY_CONDITIONS);
  const [cajaConfig, setCajaConfig] = useState(DEFAULT_CAJA_CONFIG);

  const canEdit = useMemo(() => {
    const role = String(user?.role || "").toUpperCase();
    return role === "ADMIN" || role === "CAJERO";
  }, [user?.role]);

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
    setCajaConfig(loadCajaConfig());
  }, []);

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

  if (loading) {
    return <div className="card p-6">Cargando configuracion...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="text-2xl font-black text-burnt-500 uppercase">Configuracion de ubicaciones</div>
        <div className="text-zinc-400 text-sm mt-1">
          Define direccion y coordenadas de Local, Deposito y puntos extra propios.
        </div>
      </div>

      <div className="card p-4 grid md:grid-cols-3 gap-3">
        <div className="md:col-span-3 text-xs uppercase font-bold text-zinc-500 tracking-wider">Local</div>
        <input
          className="input md:col-span-2"
          placeholder="Direccion del local"
          value={form.local.address}
          onChange={(e) => setPoint("local", "address", e.target.value)}
          disabled={!canEdit}
        />
        <input
          className="input"
          type="number"
          step="0.000001"
          placeholder="Latitud"
          value={form.local.lat}
          onChange={(e) => setPoint("local", "lat", e.target.value)}
          disabled={!canEdit}
        />
        <input
          className="input md:col-span-1"
          type="number"
          step="0.000001"
          placeholder="Longitud"
          value={form.local.lng}
          onChange={(e) => setPoint("local", "lng", e.target.value)}
          disabled={!canEdit}
        />
      </div>

      <div className="card p-4 grid md:grid-cols-3 gap-3">
        <div className="md:col-span-3 text-xs uppercase font-bold text-zinc-500 tracking-wider">Deposito</div>
        <input
          className="input md:col-span-2"
          placeholder="Direccion del deposito"
          value={form.deposito.address}
          onChange={(e) => setPoint("deposito", "address", e.target.value)}
          disabled={!canEdit}
        />
        <input
          className="input"
          type="number"
          step="0.000001"
          placeholder="Latitud"
          value={form.deposito.lat}
          onChange={(e) => setPoint("deposito", "lat", e.target.value)}
          disabled={!canEdit}
        />
        <input
          className="input md:col-span-1"
          type="number"
          step="0.000001"
          placeholder="Longitud"
          value={form.deposito.lng}
          onChange={(e) => setPoint("deposito", "lng", e.target.value)}
          disabled={!canEdit}
        />
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Ubicaciones propias</div>
          <button className="btn btn-muted" onClick={addExtra} disabled={!canEdit}>
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
                  className="input"
                  placeholder="Nombre"
                  value={item.name || ""}
                  onChange={(e) => setExtra(idx, "name", e.target.value)}
                  disabled={!canEdit}
                />
                <input
                  className="input md:col-span-2"
                  placeholder="Direccion"
                  value={item.address || ""}
                  onChange={(e) => setExtra(idx, "address", e.target.value)}
                  disabled={!canEdit}
                />
                <input
                  className="input"
                  type="number"
                  step="0.000001"
                  placeholder="Lat"
                  value={item.lat}
                  onChange={(e) => setExtra(idx, "lat", e.target.value)}
                  disabled={!canEdit}
                />
                <input
                  className="input"
                  type="number"
                  step="0.000001"
                  placeholder="Lng"
                  value={item.lng}
                  onChange={(e) => setExtra(idx, "lng", e.target.value)}
                  disabled={!canEdit}
                />
                <button className="btn btn-muted" onClick={() => removeExtra(idx)} disabled={!canEdit}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4 space-y-4">
        <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Configuracion de ticket</div>

        <div className="grid md:grid-cols-2 gap-3">
          <input
            className="input"
            placeholder="Nombre del negocio"
            value={ticketConfig.businessName || ""}
            onChange={(e) => setTicketField("businessName", e.target.value)}
            disabled={!canEdit}
          />
          <input
            className="input"
            placeholder="Direccion en ticket"
            value={ticketConfig.addressLine || ""}
            onChange={(e) => setTicketField("addressLine", e.target.value)}
            disabled={!canEdit}
          />
          <input
            className="input"
            placeholder="Ciudad / Provincia"
            value={ticketConfig.cityLine || ""}
            onChange={(e) => setTicketField("cityLine", e.target.value)}
            disabled={!canEdit}
          />
          <input
            className="input"
            placeholder="Pie de ticket"
            value={ticketConfig.footerText || ""}
            onChange={(e) => setTicketField("footerText", e.target.value)}
            disabled={!canEdit}
          />
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
          <label className="text-xs uppercase font-bold text-zinc-500">
            Lineas personalizadas (una por linea)
          </label>
          <textarea
            className="input mt-1 min-h-24"
            placeholder={"Ej:\nTel: 381-000000\nCUIT: 20-00000000-0\nCliente: {{cliente}}\nTotal: {{total}}"}
            value={ticketConfig.customLinesText ?? (ticketConfig.customLines || []).join("\n")}
            onChange={(e) => setTicketField("customLinesText", e.target.value)}
            disabled={!canEdit}
          />
          <div className="text-[11px] text-zinc-500 mt-1">
            Variables disponibles: {"{{cliente}} {{vendedor}} {{ticket}} {{fecha}} {{hora}} {{total}} {{pago}}"}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn btn-muted" onClick={resetTicketSettings} disabled={!canEdit}>
            Restaurar ticket
          </button>
          <button className="btn btn-primary" onClick={saveTicketSettings} disabled={!canEdit}>
            Guardar ticket
          </button>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
            Condiciones de cobro de envio
          </div>
          <button className="btn btn-muted" onClick={addDeliveryCondition} disabled={!canEdit}>
            Agregar condicion
          </button>
        </div>

        <div className="space-y-2">
          {deliveryConditions.map((row, idx) => (
            <div key={`${row.value}-${idx}`} className="grid md:grid-cols-7 gap-2">
              <input
                className="input md:col-span-2"
                placeholder="VALOR_INTERNO"
                value={row.value || ""}
                onChange={(e) => setDeliveryCondition(idx, "value", e.target.value)}
                disabled={!canEdit}
              />
              <input
                className="input md:col-span-4"
                placeholder="Texto visible"
                value={row.label || ""}
                onChange={(e) => setDeliveryCondition(idx, "label", e.target.value)}
                disabled={!canEdit}
              />
              <button className="btn btn-muted" onClick={() => removeDeliveryCondition(idx)} disabled={!canEdit}>
                Quitar
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn btn-muted" onClick={resetDeliveryConditions} disabled={!canEdit}>
            Restaurar condiciones
          </button>
          <button className="btn btn-primary" onClick={saveDeliveryConditionSettings} disabled={!canEdit}>
            Guardar condiciones
          </button>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="text-xs uppercase font-bold text-zinc-500 tracking-wider">
          Frecuencia de control de caja
        </div>
        <p className="text-zinc-400 text-sm">
          Define cada cuanto tiempo se debe realizar el control de caja.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs uppercase font-bold text-zinc-500">Frecuencia</label>
            <select
              className="input mt-1 w-full"
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
              <label className="text-xs uppercase font-bold text-zinc-500">Dia de la semana</label>
              <select
                className="input mt-1 w-full"
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
              <label className="text-xs uppercase font-bold text-zinc-500">Cada cuantos dias</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="input mt-1 w-full"
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

        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
          <div className="text-sm text-zinc-300">
            <span className="text-zinc-500">Configuracion actual:</span>{" "}
            <span className="font-bold text-[#e85d04]">{getFrequencyDescription()}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn btn-muted" onClick={resetCajaSettings} disabled={!canEdit}>
            Restaurar frecuencia
          </button>
          <button className="btn btn-primary" onClick={saveCajaSettings} disabled={!canEdit}>
            Guardar frecuencia
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={save} disabled={saving || !canEdit}>
          {saving ? "Guardando..." : "Guardar configuracion"}
        </button>
      </div>
    </div>
  );
}
