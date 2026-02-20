import { useEffect, useMemo, useState } from "react";
import api from "../api";

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

      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={save} disabled={saving || !canEdit}>
          {saving ? "Guardando..." : "Guardar configuracion"}
        </button>
      </div>
    </div>
  );
}
