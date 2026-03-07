import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Map, { Marker, Popup, Source, Layer, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { io } from "socket.io-client";
import api, { socketOrigin } from "../api";

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const TUCUMAN_BOUNDS = {
  south: -28.25,
  west: -66.25,
  north: -25.9,
  east: -64.75,
};

function isValidRouteCoordinate(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= TUCUMAN_BOUNDS.south &&
    lat <= TUCUMAN_BOUNDS.north &&
    lng >= TUCUMAN_BOUNDS.west &&
    lng <= TUCUMAN_BOUNDS.east
  );
}

// Helper to compute bounds from [lat, lng] pairs and fit the map
function fitMapToBounds(mapRef, positions, padding = 50) {
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

export default function Rutas({ setToast }) {
  const fallbackOrigin = { lat: -27.432028, lng: -65.616528, address: "Avenida Mitre 831, Aguilares" };
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [salida, setSalida] = useState("11");
  const [loading, setLoading] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orders, setOrders] = useState([]);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [skippedOrders, setSkippedOrders] = useState([]);
  const [origin, setOrigin] = useState(fallbackOrigin);
  const [driversStatus, setDriversStatus] = useState([]);
  const [allCustomersWithCoords, setAllCustomersWithCoords] = useState([]);
  const [customerStopStats, setCustomerStopStats] = useState({});
  const [selectedPopup, setSelectedPopup] = useState(null);

  const mapRef = useRef(null);

  const pendingOrdersWithCoords = useMemo(() => {
    return (orders || [])
      .map((order) => {
        const lat = Number(order.customer_latitude);
        const lng = Number(order.customer_longitude);
        if (!isValidRouteCoordinate(lat, lng)) return null;
        return { ...order, lat, lng };
      })
      .filter(Boolean);
  }, [orders]);

  useEffect(() => {
    const loadOrigin = async () => {
      try {
        const { data } = await api.get("/settings/locations");
        const deposito = data?.deposito;
        if (Number.isFinite(Number(deposito?.lat)) && Number.isFinite(Number(deposito?.lng))) {
          setOrigin({
            lat: Number(deposito.lat),
            lng: Number(deposito.lng),
            address: deposito.address || fallbackOrigin.address,
          });
          return;
        }
      } catch {
        // Keep fallback origin.
      }
      setOrigin(fallbackOrigin);
    };
    loadOrigin();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCustomersWithCoords = async () => {
      try {
        const { data } = await api.get("/customers");
        if (cancelled) return;
        const rows = (Array.isArray(data) ? data : [])
          .map((customer) => {
            const lat = Number(customer.latitude);
            const lng = Number(customer.longitude);
            if (!isValidRouteCoordinate(lat, lng)) return null;
            return {
              id: customer.id,
              name: String(customer.name || "").trim(),
              lat,
              lng,
              address: String(customer.address || "").trim(),
            };
          })
          .filter(Boolean);
        setAllCustomersWithCoords(rows);
      } catch {
        if (cancelled) return;
        setAllCustomersWithCoords([]);
      }
    };
    loadCustomersWithCoords();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll driver online status every 15 s
  useEffect(() => {
    const fetchDriversStatus = async () => {
      try {
        const { data } = await api.get("/deliveries/drivers-status");
        setDriversStatus(Array.isArray(data) ? data : []);
      } catch {
        // Non-fatal
      }
    };
    fetchDriversStatus();
    const timer = setInterval(fetchDriversStatus, 15000);
    return () => clearInterval(timer);
  }, []);

  // Fetch orders for selected date and slot
  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const { data } = await api.get(`/deliveries?date=${fecha}&slot=${salida}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading orders:", err);
      setOrders([]);
      setToast?.({ message: "Error al cargar pedidos", type: "error" });
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    setOptimizedRoute(null);
    setMetrics(null);
    setSkippedOrders([]);
    setCustomerStopStats({});
  }, [fecha, salida]);

  useEffect(() => {
    const socket = io(socketOrigin, {
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      timeout: 12000,
    });

    const onDeliveryStatusChanged = (event = {}) => {
      const eventDate = String(event.scheduled_date || "").slice(0, 10);
      const eventSlot = String(event.delivery_slot || "");
      if (!eventDate || !eventSlot) return;
      if (eventDate !== fecha || eventSlot !== salida) return;

      const saleId = String(event.sale_id || "");
      if (!saleId) return;

      const nextStatus = String(event.delivery_status || "").toUpperCase();
      if (!nextStatus) return;

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === saleId
            ? { ...order, delivery_status: nextStatus }
            : order
        )
      );
    };

    socket.on("delivery_status_changed", onDeliveryStatusChanged);

    return () => {
      socket.off("delivery_status_changed", onDeliveryStatusChanged);
      socket.disconnect();
    };
  }, [fecha, salida]);

  // Optimize route
  const exportToGoogleMaps = () => {
    if (!optimizedRoute || optimizedRoute.length === 0) return;
    const stops = [
      `${origin.lat},${origin.lng}`,
      ...optimizedRoute.map((s) => `${s.lat},${s.lng}`),
    ];
    const url = `https://www.google.com/maps/dir/${stops.join("/")}`;
    window.open(url, "_blank");
  };

  const SLOW_THRESHOLD_MIN = 8;
  const SLOW_MIN_SAMPLES = 2;
  const BIG_ORDER_QTY = 10;
  const BIG_ORDER_AMOUNT = 150000;

  function applySlowCustomerReorder(orden, stats) {
    if (!stats || Object.keys(stats).length === 0) return orden;
    const normal = [];
    const slowSmall = [];
    for (const stop of orden) {
      const s = stats[String(stop.customer_id)];
      const isSlow = s && s.sampleCount >= SLOW_MIN_SAMPLES && s.avgStopMin >= SLOW_THRESHOLD_MIN;
      const isBig = Number(stop.total_qty) >= BIG_ORDER_QTY || Number(stop.total_amount) >= BIG_ORDER_AMOUNT;
      if (isSlow && !isBig) {
        slowSmall.push({ ...stop, slowWarning: true, avgStopMin: s.avgStopMin });
      } else {
        normal.push(stop);
      }
    }
    return [...normal, ...slowSmall];
  }

  const optimizeRoute = async () => {
    if (orders.length === 0) {
      setToast?.({ message: "No hay pedidos para optimizar", type: "warning" });
      return;
    }

    setLoading(true);
    try {
      const [{ data }, statsRes] = await Promise.all([
        api.post("/rutas/optimizar", { fecha, salida }),
        api.get("/rutas/customer-stop-stats").catch(() => ({ data: {} })),
      ]);
      const stats = statsRes.data || {};
      setCustomerStopStats(stats);

      if (data.orden && data.orden.length > 0) {
        const reordered = applySlowCustomerReorder(data.orden, stats);
        setOptimizedRoute(reordered);
        setMetrics(data.metric);
        setSkippedOrders(data.skipped_without_coords || []);
        const slowCount = reordered.filter((s) => s.slowWarning).length;
        const msg = slowCount > 0
          ? `Ruta optimizada · ${slowCount} cliente${slowCount > 1 ? "s" : ""} con demora habitual al final`
          : "Ruta optimizada exitosamente";
        setToast?.({ message: msg, type: "success" });
      } else {
        setToast?.({ message: data.message || "No hay envios con coordenadas", type: "warning" });
        setSkippedOrders(data.skipped_without_coords || []);
      }
    } catch (err) {
      console.error("Error optimizing:", err);
      setToast?.({
        message: err.response?.data?.message || "Error al optimizar ruta",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Polyline positions for the route — [lat, lng] pairs for fitBounds, [lng, lat] for GeoJSON
  const polylinePositions = useMemo(() => {
    if (!optimizedRoute || optimizedRoute.length === 0) return [];
    return [
      [origin.lat, origin.lng],
      ...optimizedRoute.map((stop) => [stop.lat, stop.lng]),
    ];
  }, [optimizedRoute, origin.lat, origin.lng]);

  const pendingPositions = useMemo(() => {
    if (optimizedRoute) return [];
    const orderCustomerIds = new Set(
      (orders || [])
        .map((order) => String(order.customer_id || "").trim())
        .filter(Boolean)
    );
    const customersWithoutOrders = allCustomersWithCoords.filter(
      (customer) => !orderCustomerIds.has(String(customer.id || ""))
    );
    return [
      [origin.lat, origin.lng],
      ...pendingOrdersWithCoords.map((order) => [order.lat, order.lng]),
      ...customersWithoutOrders.map((customer) => [customer.lat, customer.lng]),
    ];
  }, [optimizedRoute, origin.lat, origin.lng, pendingOrdersWithCoords, allCustomersWithCoords, orders]);

  const customersWithoutOrders = useMemo(() => {
    const orderCustomerIds = new Set(
      (orders || [])
        .map((order) => String(order.customer_id || "").trim())
        .filter(Boolean)
    );
    return allCustomersWithCoords.filter(
      (customer) => !orderCustomerIds.has(String(customer.id || ""))
    );
  }, [allCustomersWithCoords, orders]);

  // Fit bounds when optimized route changes
  useEffect(() => {
    if (optimizedRoute && polylinePositions.length > 1) {
      fitMapToBounds(mapRef, polylinePositions);
    }
  }, [optimizedRoute, polylinePositions]);

  // Fit bounds when pending positions change (no optimized route)
  useEffect(() => {
    if (!optimizedRoute && pendingPositions.length > 1) {
      fitMapToBounds(mapRef, pendingPositions);
    }
  }, [pendingPositions, optimizedRoute]);

  // GeoJSON for route polyline
  const routeLineGeoJSON = useMemo(() => {
    if (polylinePositions.length < 2) return null;
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: polylinePositions.map(([lat, lng]) => [lng, lat]),
      },
    };
  }, [polylinePositions]);

  // Format duration
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes} min`;
  };

  // Format distance
  const formatDistance = (meters) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start px-2">
        <div>
          <h1 className="text-3xl font-bold leading-none text-white tracking-tight">
            Rutas de Reparto
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Optimizacion de rutas para envios
          </p>
        </div>

        {/* Driver online status */}
        {driversStatus.length > 0 && (
          <div className="flex flex-col gap-1.5 items-end">
            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
              Repartidores
            </span>
            <div className="flex flex-wrap gap-2 justify-end">
              {driversStatus.map((d) => (
                <div
                  key={d.id}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${
                    d.online
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                      : "bg-zinc-800/60 border-zinc-700 text-zinc-500"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      d.online ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
                    }`}
                  />
                  {d.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-[#121212] border border-zinc-800/80 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">
              Fecha
            </label>
            <input
              type="date"
              className="bg-[#1a1a1a] border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">
              Turno
            </label>
            <select
              className="bg-[#1a1a1a] border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#e85d04] outline-none min-w-[160px]"
              value={salida}
              onChange={(e) => setSalida(e.target.value)}
            >
              <option value="11">MANANA (11:00)</option>
              <option value="19">TARDE (19:00)</option>
            </select>
          </div>
          <button
            onClick={optimizeRoute}
            disabled={loading || orders.length === 0}
            className="bg-[#e85d04] hover:bg-[#d14f00] disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Optimizando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
                Optimizar Ruta
              </>
            )}
          </button>

          {optimizedRoute && optimizedRoute.length > 0 && (
            <button
              onClick={exportToGoogleMaps}
              className="bg-white hover:bg-zinc-100 text-zinc-900 px-5 py-2.5 rounded-lg text-sm font-bold shadow transition-colors flex items-center gap-2 border border-zinc-300"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              Abrir en Google Maps
            </button>
          )}

          {/* Metrics */}
          {metrics && (
            <div className="flex gap-4 ml-auto">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2">
                <div className="text-[10px] text-emerald-400 uppercase font-bold">Distancia</div>
                <div className="text-lg font-black text-emerald-400">
                  {formatDistance(metrics.distance_m)}
                </div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2">
                <div className="text-[10px] text-blue-400 uppercase font-bold">Tiempo Est.</div>
                <div className="text-lg font-black text-blue-400">
                  {formatDuration(metrics.duration_s)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
        {/* Sidebar - Orders list */}
        <div className="lg:col-span-1 bg-[#121212] border border-zinc-800/80 rounded-xl flex flex-col min-h-[300px] lg:min-h-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/80 bg-[#1a1a1a]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {optimizedRoute ? "Ruta Optimizada" : "Pedidos Pendientes"}
              </h3>
              <span className="bg-[#e85d04]/20 text-[#e85d04] px-2 py-0.5 rounded text-xs font-bold">
                {optimizedRoute ? optimizedRoute.length : orders.length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-2">
            {loadingOrders ? (
              <div className="flex items-center justify-center py-10 text-zinc-500">
                <svg className="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Cargando...
              </div>
            ) : optimizedRoute ? (
              <div className="space-y-2">
                {/* Depot */}
                <div className="p-3 border border-emerald-500/30 rounded-lg bg-emerald-500/10 flex gap-3 items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-white shrink-0 text-sm">
                    D
                  </div>
                  <div>
                    <div className="font-bold text-sm text-emerald-400">DEPOSITO</div>
                    <div className="text-xs text-zinc-500">{origin.address}</div>
                  </div>
                </div>

                {/* Optimized stops */}
                {optimizedRoute.map((stop, index) => (
                  <div
                    key={stop.sale_id}
                    className={`p-3 border rounded-lg flex gap-3 items-center hover:bg-zinc-800 transition-colors ${
                      stop.slowWarning
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-zinc-700 bg-zinc-800/50"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shrink-0 text-sm ${stop.slowWarning ? "bg-amber-500" : "bg-[#e85d04]"}`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-white truncate">
                        {stop.customer_name}
                      </div>
                      {stop.slowWarning && (
                        <div className="text-[10px] text-amber-400 font-bold">
                          ⚠ Demora habitual · ~{stop.avgStopMin} min
                        </div>
                      )}
                      <div className="text-xs text-zinc-500 truncate">
                        {stop.sale_id?.slice(0, 8)}...
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        Vendedor: {stop.created_by_name || stop.created_by_username || stop.seller_name || "N/A"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : orders.length > 0 ? (
              <div className="space-y-2">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="p-3 border border-zinc-700 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-white">
                        {order.customer_name || "Sin cliente"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.delivery_status === "CARGADO"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : order.delivery_status === "ENTREGADO"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                      >
                        {order.delivery_status}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">#{order.sale_number}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                      Vendedor: {order.created_by_name || order.created_by_username || order.seller_name || "N/A"}
                    </div>
                    {order.delivery_address && (
                      <div className="text-xs text-zinc-400 mt-1 truncate">
                        {order.delivery_address}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-zinc-500 py-10">
                <svg
                  className="w-12 h-12 mx-auto mb-3 opacity-50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                  />
                </svg>
                <p className="text-sm">No hay envios para esta fecha/turno</p>
              </div>
            )}
          </div>

          {/* Skipped orders warning */}
          {skippedOrders.length > 0 && (
            <div className="p-3 border-t border-zinc-800/80 bg-amber-500/10">
              <div className="text-xs font-bold text-amber-400 mb-1">
                Sin coordenadas ({skippedOrders.length}):
              </div>
              <div className="text-xs text-amber-300/70 space-y-1 max-h-20 overflow-auto">
                {skippedOrders.map((s) => (
                  <div key={s.sale_id} className="truncate">
                    - {s.customer_name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="lg:col-span-3 bg-[#121212] border border-zinc-800/80 rounded-xl overflow-hidden relative">
          <Map
            ref={mapRef}
            initialViewState={{
              longitude: origin.lng,
              latitude: origin.lat,
              zoom: 13,
            }}
            mapStyle={OPENFREEMAP_STYLE}
            style={{ height: "100%", width: "100%" }}
          >
            <NavigationControl position="top-right" />

            {/* Route polyline */}
            {optimizedRoute && routeLineGeoJSON && (
              <Source type="geojson" data={routeLineGeoJSON}>
                <Layer
                  type="line"
                  paint={{
                    "line-color": "#e85d04",
                    "line-width": 4,
                    "line-opacity": 0.8,
                    "line-dasharray": [2, 2],
                  }}
                  layout={{
                    "line-join": "round",
                    "line-cap": "round",
                  }}
                />
              </Source>
            )}

            {/* Depot marker */}
            <Marker
              latitude={origin.lat}
              longitude={origin.lng}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedPopup({ type: "depot" });
              }}
            >
              <div
                style={{
                  background: "#10b981",
                  color: "white",
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: "bold",
                  border: "3px solid white",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  cursor: "pointer",
                }}
              >
                D
              </div>
            </Marker>

            {/* Pending markers (without optimization) */}
            {!optimizedRoute &&
              pendingOrdersWithCoords.map((order, index) => (
                <Marker
                  key={order.id}
                  latitude={order.lat}
                  longitude={order.lng}
                  onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    setSelectedPopup({ type: "pending_order", data: order, index });
                  }}
                >
                  <div
                    style={{
                      background: "#2563eb",
                      color: "white",
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      fontSize: 12,
                      border: "2px solid white",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                      cursor: "pointer",
                    }}
                  >
                    {index + 1}
                  </div>
                </Marker>
              ))}

            {!optimizedRoute &&
              customersWithoutOrders.map((customer) => (
                <Marker
                  key={`customer-${customer.id}`}
                  latitude={customer.lat}
                  longitude={customer.lng}
                  onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    setSelectedPopup({ type: "customer_no_order", data: customer });
                  }}
                >
                  <div
                    style={{
                      background: "#f97316",
                      color: "white",
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: 12,
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

            {/* Optimized stop markers */}
            {optimizedRoute?.map((stop, index) => (
              <Marker
                key={stop.sale_id}
                latitude={stop.lat}
                longitude={stop.lng}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelectedPopup({ type: "optimized_stop", data: stop, index });
                }}
              >
                <div
                  style={{
                    background: stop.slowWarning ? "#f59e0b" : "#e85d04",
                    color: "white",
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "bold",
                    fontSize: 12,
                    border: "2px solid white",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                    cursor: "pointer",
                  }}
                >
                  {index + 1}
                </div>
              </Marker>
            ))}

            {/* Popups */}
            {selectedPopup?.type === "depot" && (
              <Popup
                latitude={origin.lat}
                longitude={origin.lng}
                onClose={() => setSelectedPopup(null)}
                closeButton={true}
                closeOnClick={false}
                anchor="bottom"
              >
                <div style={{ padding: "4px 2px" }}>
                  <div className="font-bold">DEPOSITO</div>
                  <div className="text-sm text-gray-600">{origin.address}</div>
                </div>
              </Popup>
            )}

            {selectedPopup?.type === "pending_order" && (
              <Popup
                latitude={selectedPopup.data.lat}
                longitude={selectedPopup.data.lng}
                onClose={() => setSelectedPopup(null)}
                closeButton={true}
                closeOnClick={false}
                anchor="bottom"
              >
                <div style={{ padding: "4px 2px" }}>
                  <div className="font-bold">
                    Pedido #{selectedPopup.index + 1}: {selectedPopup.data.customer_name || "Sin cliente"}
                  </div>
                  <div className="text-sm text-gray-600">Ticket: {selectedPopup.data.sale_number || selectedPopup.data.id}</div>
                  <div className="text-sm text-gray-600">
                    Estado: {String(selectedPopup.data.delivery_status || "PENDIENTE").toUpperCase()}
                  </div>
                </div>
              </Popup>
            )}

            {selectedPopup?.type === "customer_no_order" && (
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
                  {selectedPopup.data.address ? (
                    <div className="text-sm text-gray-600">{selectedPopup.data.address}</div>
                  ) : null}
                  <div className="text-xs text-gray-500">Sin envío en este turno</div>
                </div>
              </Popup>
            )}

            {selectedPopup?.type === "optimized_stop" && (
              <Popup
                latitude={selectedPopup.data.lat}
                longitude={selectedPopup.data.lng}
                onClose={() => setSelectedPopup(null)}
                closeButton={true}
                closeOnClick={false}
                anchor="bottom"
              >
                <div style={{ padding: "4px 2px" }}>
                  <div className="font-bold">
                    Parada #{selectedPopup.index + 1}: {selectedPopup.data.customer_name}
                  </div>
                  <div className="text-sm text-gray-600">ID: {selectedPopup.data.sale_id?.slice(0, 8)}...</div>
                  <div className="text-sm text-gray-600">
                    Vendedor: {selectedPopup.data.created_by_name || selectedPopup.data.created_by_username || selectedPopup.data.seller_name || "N/A"}
                  </div>
                </div>
              </Popup>
            )}
          </Map>

          {/* Map overlay info */}
          {!optimizedRoute && orders.length > 0 && (
            <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-sm rounded-lg p-4 text-center" style={{ pointerEvents: "none" }}>
              <p className="text-zinc-300 text-sm">
                Hay <span className="text-[#e85d04] font-bold">{orders.length}</span> pedidos
                pendientes.
              </p>
              <p className="text-zinc-500 text-xs mt-1">
                Presiona "Optimizar Ruta" para calcular el mejor recorrido
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
