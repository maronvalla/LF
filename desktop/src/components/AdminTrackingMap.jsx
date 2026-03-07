import React, { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Popup, Source, Layer, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import io from "socket.io-client";
import api, { socketOrigin } from "../api";

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const SOCKET_URL = socketOrigin;
const AGUILARES_COORDS = [-27.4333, -65.6167];
const POLL_INTERVAL_MS = 20000;
const SOCKET_STALE_MS = 25000;
const MAX_DISTANCE_FROM_AGUILARES_KM = 120;
const TUCUMAN_BOUNDS = {
  south: -28.25,
  west: -66.25,
  north: -25.9,
  east: -64.75,
};

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

function isValidMapCoordinate(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= TUCUMAN_BOUNDS.south &&
    lat <= TUCUMAN_BOUNDS.north &&
    lng >= TUCUMAN_BOUNDS.west &&
    lng <= TUCUMAN_BOUNDS.east &&
    isPointNearAguilares(lat, lng)
  );
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// Fit map to [lat, lng] pair array
function fitMapToBounds(mapRef, positions, padding = 40) {
  if (!mapRef.current || positions.length < 2) return;
  const lngs = positions.map(([, lng]) => lng);
  const lats = positions.map(([lat]) => lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  mapRef.current.fitBounds(
    [[minLng, minLat], [maxLng, maxLat]],
    { padding, duration: 800 }
  );
}

export default function AdminTrackingMap({ user }) {
  const [mode, setMode] = useState("live");

  const [truckLocation, setTruckLocation] = useState(null);
  const [connected, setConnected] = useState(false);
  const [usingPoll, setUsingPoll] = useState(false);
  const socketRef = useRef(null);
  const lastSocketUpdateRef = useRef(0);
  const mapRef = useRef(null);

  const [histDate, setHistDate] = useState(new Date().toISOString().slice(0, 10));
  const [histSlot, setHistSlot] = useState("11");
  const [drivers, setDrivers] = useState([]);
  const [histDriverId, setHistDriverId] = useState("all");
  const [histPoints, setHistPoints] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [allCustomersWithCoords, setAllCustomersWithCoords] = useState([]);
  const [todayDeliveryCustomerIds, setTodayDeliveryCustomerIds] = useState(new Set());
  const [selectedPopup, setSelectedPopup] = useState(null);

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
      if (!isValidMapCoordinate(lat, lng)) return;
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
            if (!isValidMapCoordinate(lat, lng)) return null;
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
        if (!isValidMapCoordinate(lat, lng)) return;
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
        return isValidMapCoordinate(lat, lng);
      }),
    [histPoints]
  );
  // [lat, lng] pairs for internal use
  const histPositions = safeHistPoints.map((p) => [Number(p.lat), Number(p.lng)]);

  const histStats = useMemo(() => {
    if (safeHistPoints.length < 2) return null;
    const first = safeHistPoints[0];
    const last = safeHistPoints[safeHistPoints.length - 1];
    const startTs = new Date(first.ts).getTime();
    const endTs = new Date(last.ts).getTime();
    const totalMinutes = Math.round((endTs - startTs) / 60000);

    let totalKm = 0;
    for (let i = 1; i < safeHistPoints.length; i++) {
      totalKm += haversineKm(
        Number(safeHistPoints[i - 1].lat), Number(safeHistPoints[i - 1].lng),
        Number(safeHistPoints[i].lat), Number(safeHistPoints[i].lng)
      );
    }

    const STOP_DIST_KM = 0.08;
    const STOP_MIN_MIN = 3;
    const rawStops = [];
    let currentStop = null;

    for (let i = 1; i < safeHistPoints.length; i++) {
      const prev = safeHistPoints[i - 1];
      const curr = safeHistPoints[i];
      const dist = haversineKm(Number(prev.lat), Number(prev.lng), Number(curr.lat), Number(curr.lng));
      const gapMin = (new Date(curr.ts).getTime() - new Date(prev.ts).getTime()) / 60000;

      if (dist < STOP_DIST_KM && gapMin >= STOP_MIN_MIN) {
        if (currentStop) {
          currentStop.endTs = new Date(curr.ts).getTime();
          currentStop.lats.push(Number(curr.lat));
          currentStop.lngs.push(Number(curr.lng));
        } else {
          currentStop = {
            startTs: new Date(prev.ts).getTime(),
            endTs: new Date(curr.ts).getTime(),
            lats: [Number(prev.lat), Number(curr.lat)],
            lngs: [Number(prev.lng), Number(curr.lng)],
          };
          rawStops.push(currentStop);
        }
      } else {
        currentStop = null;
      }
    }

    const stops = rawStops
      .map((stop) => {
        const durationMin = Math.round((stop.endTs - stop.startTs) / 60000);
        const lat = stop.lats.reduce((a, b) => a + b, 0) / stop.lats.length;
        const lng = stop.lngs.reduce((a, b) => a + b, 0) / stop.lngs.length;
        let nearestCustomer = null;
        let nearestDist = Infinity;
        for (const customer of allCustomersWithCoords) {
          const d = haversineKm(lat, lng, Number(customer.lat), Number(customer.lng));
          if (d < nearestDist) { nearestDist = d; nearestCustomer = customer; }
        }
        return { startTs: stop.startTs, endTs: stop.endTs, durationMin, lat, lng, nearestCustomer: nearestDist < 0.3 ? nearestCustomer : null };
      })
      .filter((s) => s.durationMin >= STOP_MIN_MIN)
      .sort((a, b) => b.durationMin - a.durationMin);

    return { startTs, endTs, totalMinutes, totalKm, stops };
  }, [safeHistPoints, allCustomersWithCoords]);

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

  // Fly to truck when location updates (live mode)
  useEffect(() => {
    if (mode !== "live" || !truckLocation || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [truckLocation.lng, truckLocation.lat],
      zoom: 15,
      duration: 800,
    });
  }, [truckLocation, mode]);

  // Fit to all positions when customers or truck load
  useEffect(() => {
    if (mode !== "live") return;
    if (liveFitPositions.length > 1) {
      fitMapToBounds(mapRef, liveFitPositions);
    }
  }, [customerPositions.length, mode]);

  // Fit to history route when it loads
  useEffect(() => {
    if (mode !== "history") return;
    if (histPositions.length > 1) {
      fitMapToBounds(mapRef, histPositions);
    } else {
      // Reset to Aguilares
      mapRef.current?.flyTo({
        center: [AGUILARES_COORDS[1], AGUILARES_COORDS[0]],
        zoom: 13,
        duration: 600,
      });
    }
  }, [histPositions.length, mode]);

  // Reset to Aguilares when switching to history with no data
  useEffect(() => {
    if (mode === "live" && !truckLocation && customerPositions.length === 0) {
      mapRef.current?.flyTo({
        center: [AGUILARES_COORDS[1], AGUILARES_COORDS[0]],
        zoom: 13,
        duration: 600,
      });
    }
  }, [mode]);

  // GeoJSON for history polyline
  const histLineGeoJSON = useMemo(() => {
    if (histPositions.length < 2) return null;
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        // GeoJSON uses [longitude, latitude]
        coordinates: histPositions.map(([lat, lng]) => [lng, lat]),
      },
    };
  }, [histPositions]);

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

      {mode === "history" && histStats && !histLoading && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 space-y-2 flex-shrink-0">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span className="text-zinc-400">
              Inicio: <span className="text-white font-semibold">{new Date(histStats.startTs).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
            </span>
            <span className="text-zinc-400">
              Fin: <span className="text-white font-semibold">{new Date(histStats.endTs).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
            </span>
            <span className="text-zinc-400">
              Duración: <span className="text-[#e85d04] font-bold">{formatDuration(histStats.totalMinutes)}</span>
            </span>
            <span className="text-zinc-400">
              Distancia: <span className="text-white font-semibold">{histStats.totalKm.toFixed(1)} km</span>
            </span>
          </div>
          {histStats.stops.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5">
                Paradas detectadas · {histStats.stops.length} · ordenadas por duración
              </div>
              <div className="flex flex-col gap-1 max-h-28 overflow-y-auto pr-1">
                {histStats.stops.map((stop) => (
                  <div key={stop.startTs} className="flex items-center gap-2 text-xs">
                    <span className="text-amber-400 font-bold tabular-nums w-10 text-right shrink-0">{stop.durationMin} min</span>
                    <span className="text-zinc-500 shrink-0">
                      {new Date(stop.startTs).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {stop.nearestCustomer ? (
                      <span className="text-zinc-200 truncate">{stop.nearestCustomer.name}</span>
                    ) : (
                      <span className="text-zinc-600 italic">Sin cliente cercano</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-zinc-600 italic">Sin paradas significativas detectadas</div>
          )}
        </div>
      )}

      <div className="relative flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden min-h-[400px]">
        {mode === "live" && (
          <div className="absolute top-3 right-3 z-10 bg-black/80 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-bold uppercase border border-zinc-700 flex items-center gap-2" style={{ zIndex: 10 }}>
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
            {usingPoll ? "Sondeo DB" : connected ? "En vivo" : "Desconectado"}
          </div>
        )}

        <Map
          ref={mapRef}
          initialViewState={{
            longitude: AGUILARES_COORDS[1],
            latitude: AGUILARES_COORDS[0],
            zoom: 13,
          }}
          mapStyle={OPENFREEMAP_STYLE}
          style={{ height: "100%", width: "100%" }}
          scrollZoom
        >
          <NavigationControl position="top-left" />

          {/* History polyline */}
          {mode === "history" && histLineGeoJSON && (
            <Source type="geojson" data={histLineGeoJSON}>
              <Layer
                type="line"
                paint={{
                  "line-color": "#e85d04",
                  "line-width": 4,
                  "line-opacity": 0.85,
                }}
                layout={{
                  "line-join": "round",
                  "line-cap": "round",
                }}
              />
            </Source>
          )}

          {/* Live truck marker */}
          {mode === "live" && truckLocation && (
            <Marker
              latitude={truckLocation.lat}
              longitude={truckLocation.lng}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedPopup({ type: "truck" });
              }}
            >
              <div style={{ fontSize: 24, cursor: "pointer" }}>🚚</div>
            </Marker>
          )}

          {/* Customers without delivery today */}
          {customersWithoutDelivery.map((customer) => (
            <Marker
              key={`customer-no-delivery-${customer.id}`}
              latitude={customer.lat}
              longitude={customer.lng}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedPopup({ type: "customer_no_delivery", data: customer });
              }}
            >
              <div
                style={{
                  background: "#f97316",
                  color: "white",
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 11,
                  border: "2px solid white",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {String(customer.name?.[0] || "C").slice(0, 1)}
              </div>
            </Marker>
          ))}

          {/* Customers with delivery today */}
          {customersWithDelivery.map((customer) => (
            <Marker
              key={`customer-with-delivery-${customer.id}`}
              latitude={customer.lat}
              longitude={customer.lng}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedPopup({ type: "customer_with_delivery", data: customer });
              }}
            >
              <div
                style={{
                  background: "#2563eb",
                  color: "white",
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 11,
                  border: "2px solid white",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {String(customer.name?.[0] || "E").slice(0, 1)}
              </div>
            </Marker>
          ))}

          {/* History: start marker */}
          {mode === "history" && histPositions.length > 1 && (
            <Marker
              latitude={histPositions[0][0]}
              longitude={histPositions[0][1]}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedPopup({ type: "hist_start" });
              }}
            >
              <div
                style={{
                  background: "#10b981",
                  color: "white",
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: "bold",
                  border: "2px solid white",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                  cursor: "pointer",
                }}
              >
                S
              </div>
            </Marker>
          )}

          {/* History: end marker */}
          {mode === "history" && histPositions.length > 1 && (
            <Marker
              latitude={histPositions[histPositions.length - 1][0]}
              longitude={histPositions[histPositions.length - 1][1]}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedPopup({ type: "hist_end" });
              }}
            >
              <div
                style={{
                  background: "#ef4444",
                  color: "white",
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: "bold",
                  border: "2px solid white",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                  cursor: "pointer",
                }}
              >
                F
              </div>
            </Marker>
          )}

          {/* History: stop markers */}
          {mode === "history" &&
            histStats?.stops.map((stop) => (
              <Marker
                key={`stop-${stop.startTs}`}
                latitude={stop.lat}
                longitude={stop.lng}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelectedPopup({ type: "hist_stop", data: stop });
                }}
              >
                <div
                  style={{
                    background: "#f59e0b",
                    color: "#1c1917",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: "bold",
                    border: "2px solid white",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                    cursor: "pointer",
                  }}
                >
                  {stop.durationMin}m
                </div>
              </Marker>
            ))}

          {/* Popups */}
          {selectedPopup?.type === "truck" && truckLocation && (
            <Popup
              latitude={truckLocation.lat}
              longitude={truckLocation.lng}
              onClose={() => setSelectedPopup(null)}
              closeButton={true}
              closeOnClick={false}
              anchor="bottom"
            >
              <div style={{ padding: "4px 2px" }}>
                <div className="text-center font-bold">Repartidor en movimiento</div>
              </div>
            </Popup>
          )}

          {selectedPopup?.type === "customer_no_delivery" && (
            <Popup
              latitude={selectedPopup.data.lat}
              longitude={selectedPopup.data.lng}
              onClose={() => setSelectedPopup(null)}
              closeButton={true}
              closeOnClick={false}
              anchor="bottom"
            >
              <div style={{ padding: "4px 2px" }}>
                <div className="font-bold">{selectedPopup.data.name || "Cliente"}</div>
                {selectedPopup.data.address ? <div className="text-sm text-gray-600">{selectedPopup.data.address}</div> : null}
                <div className="text-xs text-gray-500">Sin envio hoy</div>
              </div>
            </Popup>
          )}

          {selectedPopup?.type === "customer_with_delivery" && (
            <Popup
              latitude={selectedPopup.data.lat}
              longitude={selectedPopup.data.lng}
              onClose={() => setSelectedPopup(null)}
              closeButton={true}
              closeOnClick={false}
              anchor="bottom"
            >
              <div style={{ padding: "4px 2px" }}>
                <div className="font-bold">{selectedPopup.data.name || "Cliente"}</div>
                {selectedPopup.data.address ? <div className="text-sm text-gray-600">{selectedPopup.data.address}</div> : null}
                <div className="text-xs text-gray-500">Con envio hoy</div>
              </div>
            </Popup>
          )}

          {selectedPopup?.type === "hist_start" && histPositions.length > 0 && (
            <Popup
              latitude={histPositions[0][0]}
              longitude={histPositions[0][1]}
              onClose={() => setSelectedPopup(null)}
              closeButton={true}
              closeOnClick={false}
              anchor="bottom"
            >
              <div style={{ padding: "4px 2px" }}>
                Inicio - {new Date(safeHistPoints[0].ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </Popup>
          )}

          {selectedPopup?.type === "hist_end" && histPositions.length > 0 && (
            <Popup
              latitude={histPositions[histPositions.length - 1][0]}
              longitude={histPositions[histPositions.length - 1][1]}
              onClose={() => setSelectedPopup(null)}
              closeButton={true}
              closeOnClick={false}
              anchor="bottom"
            >
              <div style={{ padding: "4px 2px" }}>
                Fin -{" "}
                {new Date(safeHistPoints[safeHistPoints.length - 1].ts).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </Popup>
          )}

          {selectedPopup?.type === "hist_stop" && (
            <Popup
              latitude={selectedPopup.data.lat}
              longitude={selectedPopup.data.lng}
              onClose={() => setSelectedPopup(null)}
              closeButton={true}
              closeOnClick={false}
              anchor="bottom"
            >
              <div style={{ padding: "4px 2px" }}>
                <div className="text-sm font-bold">{selectedPopup.data.durationMin} min de parada</div>
                <div className="text-xs text-gray-500">
                  {new Date(selectedPopup.data.startTs).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  {" - "}
                  {new Date(selectedPopup.data.endTs).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </div>
                {selectedPopup.data.nearestCustomer && (
                  <div className="text-xs font-medium mt-1">{selectedPopup.data.nearestCustomer.name}</div>
                )}
              </div>
            </Popup>
          )}
        </Map>

        {mode === "live" && !truckLocation && connected && (
          <div className="absolute bottom-4 left-4 bg-black/80 text-zinc-400 px-3 py-2 rounded text-xs pointer-events-none" style={{ zIndex: 10 }}>
            Esperando senal de GPS...
          </div>
        )}

        {mode === "history" && !histLoading && safeHistPoints.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
            <div className="bg-black/70 text-zinc-400 px-5 py-3 rounded-xl text-sm">
              No hay recorrido valido para este periodo
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
