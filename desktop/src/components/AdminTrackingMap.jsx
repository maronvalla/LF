import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import io from "socket.io-client";
import api, { socketOrigin } from "../api";

const SOCKET_URL = socketOrigin;
const AGUILARES_COORDS = [-27.4333, -65.6167];
const POLL_INTERVAL_MS = 20000;
const SOCKET_STALE_MS = 25000;
const MAX_DISTANCE_FROM_AGUILARES_KM = 120;

const truckIcon = L.divIcon({
  html: '<div style="font-size: 24px;">🚚</div>',
  className: "truck-marker",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const startIcon = L.divIcon({
  html: '<div style="background:#10b981;color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)">S</div>',
  className: "",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const endIcon = L.divIcon({
  html: '<div style="background:#ef4444;color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)">F</div>',
  className: "",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const createInitialIcon = (initial = "C", color = "#f97316") =>
  L.divIcon({
    className: "custom-div-icon",
    html: `<div style="
      background-color: ${color};
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 11px;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.28);
      text-transform: uppercase;
    ">${String(initial || "C").slice(0, 1)}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
    }
  }, [positions, map]);
  return null;
}

function MapRecenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], 15);
    }
  }, [lat, lng, map]);
  return null;
}

function EnsureAguilaresCenter({ enabled }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return;
    map.setView(AGUILARES_COORDS, 13);
  }, [enabled, map]);
  return null;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isPointNearAguilares(lat, lng) {
  return haversineKm(AGUILARES_COORDS[0], AGUILARES_COORDS[1], lat, lng) <= MAX_DISTANCE_FROM_AGUILARES_KM;
}

export default function AdminTrackingMap({ user }) {
  const [mode, setMode] = useState("live");

  const [truckLocation, setTruckLocation] = useState(null);
  const [connected, setConnected] = useState(false);
  const [usingPoll, setUsingPoll] = useState(false);
  const socketRef = useRef(null);
  const lastSocketUpdateRef = useRef(0);

  const [histDate, setHistDate] = useState(new Date().toISOString().slice(0, 10));
  const [histSlot, setHistSlot] = useState("11");
  const [drivers, setDrivers] = useState([]);
  const [histDriverId, setHistDriverId] = useState("all");
  const [histPoints, setHistPoints] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [allCustomersWithCoords, setAllCustomersWithCoords] = useState([]);
  const [todayDeliveryCustomerIds, setTodayDeliveryCustomerIds] = useState(new Set());

  if (!user || (user.role !== "ADMIN" && user.username !== "admin")) {
    return (
      <div className="h-64 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 font-mono text-sm">
        🔒 ACCESO DENEGADO: Solo administradores pueden ver el rastreo en vivo.
      </div>
    );
  }

  useEffect(() => {
    if (mode !== "live") return;

    socketRef.current = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current.on("connect", () => setConnected(true));
    socketRef.current.on("disconnect", () => setConnected(false));
    socketRef.current.on("update_mapa", (data) => {
      const lat = Number(data?.lat);
      const lng = Number(data?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!isPointNearAguilares(lat, lng)) return;
      lastSocketUpdateRef.current = Date.now();
      setUsingPoll(false);
      setTruckLocation({ lat, lng });
    });

    return () => {
      socketRef.current?.disconnect();
      setConnected(false);
    };
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    const loadCustomers = async () => {
      try {
        const { data } = await api.get("/customers");
        if (cancelled) return;
        const rows = (Array.isArray(data) ? data : [])
          .map((customer) => {
            const lat = Number(customer.latitude);
            const lng = Number(customer.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            if (!isPointNearAguilares(lat, lng)) return null;
            return {
              id: String(customer.id || ""),
              name: String(customer.name || "").trim(),
              address: String(customer.address || "").trim(),
              lat,
              lng,
            };
          })
          .filter(Boolean);
        setAllCustomersWithCoords(rows);
      } catch {
        if (!cancelled) setAllCustomersWithCoords([]);
      }
    };
    loadCustomers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    const loadDeliveryCustomers = async () => {
      try {
        const [morning, evening] = await Promise.all([
          api.get(`/deliveries?date=${today}&slot=11`),
          api.get(`/deliveries?date=${today}&slot=19`),
        ]);
        if (cancelled) return;
        const rows = [
          ...(Array.isArray(morning.data) ? morning.data : []),
          ...(Array.isArray(evening.data) ? evening.data : []),
        ];
        const nextIds = new Set(
          rows
            .map((row) => String(row.customer_id || "").trim())
            .filter(Boolean)
        );
        setTodayDeliveryCustomerIds(nextIds);
      } catch {
        if (!cancelled) setTodayDeliveryCustomerIds(new Set());
      }
    };
    loadDeliveryCustomers();
    const timer = setInterval(loadDeliveryCustomers, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (mode !== "live") return;

    const poll = async () => {
      if (Date.now() - lastSocketUpdateRef.current < SOCKET_STALE_MS) return;
      try {
        const { data } = await api.get("/deliveries/driver-last-location");
        if (!data?.found) return;
        if ((Date.now() - new Date(data.ts).getTime()) >= 120000) return;
        const lat = Number(data?.lat);
        const lng = Number(data?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (!isPointNearAguilares(lat, lng)) return;
        setUsingPoll(true);
        setTruckLocation({ lat, lng });
      } catch {
        // non-fatal
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode !== "history") return;
    api
      .get("/deliveries/drivers-status")
      .then(({ data }) => setDrivers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [mode]);

  useEffect(() => {
    if (mode !== "history") return;
    setHistPoints([]);
    setHistLoading(true);
    const params = new URLSearchParams({ date: histDate, slot: histSlot });
    if (histDriverId !== "all") params.set("userId", histDriverId);

    api
      .get(`/deliveries/route-history?${params}`)
      .then(({ data }) => setHistPoints(Array.isArray(data) ? data : []))
      .catch(() => setHistPoints([]))
      .finally(() => setHistLoading(false));
  }, [mode, histDate, histSlot, histDriverId]);

  const safeHistPoints = useMemo(
    () =>
      histPoints.filter((p) => {
        const lat = Number(p?.lat);
        const lng = Number(p?.lng);
        return Number.isFinite(lat) && Number.isFinite(lng) && isPointNearAguilares(lat, lng);
      }),
    [histPoints]
  );
  const histPositions = safeHistPoints.map((p) => [Number(p.lat), Number(p.lng)]);

  const customersWithDelivery = allCustomersWithCoords.filter((customer) =>
    todayDeliveryCustomerIds.has(String(customer.id || ""))
  );
  const customersWithoutDelivery = allCustomersWithCoords.filter(
    (customer) => !todayDeliveryCustomerIds.has(String(customer.id || ""))
  );
  const customerPositions = allCustomersWithCoords.map((customer) => [customer.lat, customer.lng]);
  const liveFitPositions = [
    ...customerPositions,
    ...(truckLocation ? [[truckLocation.lat, truckLocation.lng]] : []),
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-zinc-700">
          <button
            onClick={() => setMode("live")}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              mode === "live" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            En vivo
          </button>
          <button
            onClick={() => setMode("history")}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              mode === "history" ? "bg-[#e85d04] text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            Historial
          </button>
        </div>

        {mode === "history" && (
          <>
            <input
              type="date"
              value={histDate}
              onChange={(e) => setHistDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-[#e85d04] outline-none"
            />
            <select
              value={histSlot}
              onChange={(e) => setHistSlot(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-[#e85d04] outline-none"
            >
              <option value="all">Todo el dia</option>
              <option value="11">Manana (8-18 h)</option>
              <option value="19">Tarde (17-23 h)</option>
            </select>
            {drivers.length > 1 && (
              <select
                value={histDriverId}
                onChange={(e) => setHistDriverId(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-[#e85d04] outline-none"
              >
                <option value="all">Todos los repartidores</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            {!histLoading && (
              <span className="text-xs text-zinc-500">
                {safeHistPoints.length === 0 ? "Sin datos para este periodo" : `${safeHistPoints.length} puntos registrados`}
              </span>
            )}
            {histLoading && <span className="text-xs text-zinc-500 animate-pulse">Cargando...</span>}
          </>
        )}
      </div>

      <div className="relative flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden min-h-[400px]">
        {mode === "live" && (
          <div className="absolute top-3 right-3 z-[1000] bg-black/80 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-bold uppercase border border-zinc-700 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
            {usingPoll ? "Sondeo DB" : connected ? "En vivo" : "Desconectado"}
          </div>
        )}

        <MapContainer center={AGUILARES_COORDS} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {mode === "live" && truckLocation && (
            <>
              <Marker position={[truckLocation.lat, truckLocation.lng]} icon={truckIcon}>
                <Popup>
                  <div className="text-center font-bold">Repartidor en movimiento</div>
                </Popup>
              </Marker>
              <MapRecenter lat={truckLocation.lat} lng={truckLocation.lng} />
            </>
          )}

          {customersWithoutDelivery.map((customer) => (
            <Marker
              key={`customer-no-delivery-${customer.id}`}
              position={[customer.lat, customer.lng]}
              icon={createInitialIcon(customer.name?.[0] || "C", "#f97316")}
            >
              <Popup>
                <div className="font-bold">{customer.name || "Cliente"}</div>
                {customer.address ? <div className="text-sm text-gray-600">{customer.address}</div> : null}
                <div className="text-xs text-gray-500">Sin envio hoy</div>
              </Popup>
            </Marker>
          ))}

          {customersWithDelivery.map((customer) => (
            <Marker
              key={`customer-with-delivery-${customer.id}`}
              position={[customer.lat, customer.lng]}
              icon={createInitialIcon(customer.name?.[0] || "E", "#2563eb")}
            >
              <Popup>
                <div className="font-bold">{customer.name || "Cliente"}</div>
                {customer.address ? <div className="text-sm text-gray-600">{customer.address}</div> : null}
                <div className="text-xs text-gray-500">Con envio hoy</div>
              </Popup>
            </Marker>
          ))}

          {mode === "live" && liveFitPositions.length > 1 && <FitBounds positions={liveFitPositions} />}

          {mode === "history" && histPositions.length > 1 && (
            <>
              <Polyline positions={histPositions} color="#e85d04" weight={4} opacity={0.85} />
              <Marker position={histPositions[0]} icon={startIcon}>
                <Popup>Inicio - {new Date(safeHistPoints[0].ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</Popup>
              </Marker>
              <Marker position={histPositions[histPositions.length - 1]} icon={endIcon}>
                <Popup>
                  Fin -{" "}
                  {new Date(safeHistPoints[safeHistPoints.length - 1].ts).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Popup>
              </Marker>
              <FitBounds positions={histPositions} />
            </>
          )}

          {((mode === "history" && histPositions.length < 2) ||
            (mode === "live" && !truckLocation && customerPositions.length === 0)) && <EnsureAguilaresCenter enabled />}
        </MapContainer>

        {mode === "live" && !truckLocation && connected && (
          <div className="absolute bottom-4 left-4 z-[1000] bg-black/80 text-zinc-400 px-3 py-2 rounded text-xs pointer-events-none">
            Esperando senal de GPS...
          </div>
        )}

        {mode === "history" && !histLoading && safeHistPoints.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/70 text-zinc-400 px-5 py-3 rounded-xl text-sm">
              No hay recorrido valido para este periodo
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
