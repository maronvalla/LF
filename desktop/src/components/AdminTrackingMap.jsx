import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import io from 'socket.io-client';
import api, { socketOrigin } from '../api';

const SOCKET_URL = socketOrigin;
const AGUILARES_COORDS = [-27.4333, -65.6167];
const POLL_INTERVAL_MS = 20000;
const SOCKET_STALE_MS = 25000;

const truckIcon = L.divIcon({
  html: '<div style="font-size: 24px;">🚚</div>',
  className: 'truck-marker',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const startIcon = L.divIcon({
  html: '<div style="background:#10b981;color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)">S</div>',
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const endIcon = L.divIcon({
  html: '<div style="background:#ef4444;color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)">F</div>',
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
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
    if (lat && lng) map.flyTo([lat, lng], 15);
  }, [lat, lng, map]);
  return null;
}

export default function AdminTrackingMap({ user }) {
  const [mode, setMode] = useState('live'); // 'live' | 'history'

  // Live state
  const [truckLocation, setTruckLocation] = useState(null);
  const [connected, setConnected] = useState(false);
  const [usingPoll, setUsingPoll] = useState(false);
  const socketRef = useRef(null);
  const lastSocketUpdateRef = useRef(0);

  // History state
  const [histDate, setHistDate] = useState(new Date().toISOString().slice(0, 10));
  const [histSlot, setHistSlot] = useState('11');
  const [drivers, setDrivers] = useState([]);
  const [histDriverId, setHistDriverId] = useState('all');
  const [histPoints, setHistPoints] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  if (!user || (user.role !== 'ADMIN' && user.username !== 'admin')) {
    return (
      <div className="h-64 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 font-mono text-sm">
        🔒 ACCESO DENEGADO: Solo administradores pueden ver el rastreo en vivo.
      </div>
    );
  }

  // Live: socket connection
  useEffect(() => {
    if (mode !== 'live') return;

    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current.on('connect', () => setConnected(true));
    socketRef.current.on('disconnect', () => setConnected(false));
    socketRef.current.on('update_mapa', (data) => {
      if (data?.lat && data?.lng) {
        lastSocketUpdateRef.current = Date.now();
        setUsingPoll(false);
        setTruckLocation({ lat: data.lat, lng: data.lng });
      }
    });

    return () => {
      socketRef.current?.disconnect();
      setConnected(false);
    };
  }, [mode]);

  // Live: DB polling fallback
  useEffect(() => {
    if (mode !== 'live') return;

    const poll = async () => {
      if (Date.now() - lastSocketUpdateRef.current < SOCKET_STALE_MS) return;
      try {
        const { data } = await api.get('/deliveries/driver-last-location');
        if (data?.found && (Date.now() - new Date(data.ts).getTime()) < 120000) {
          setUsingPoll(true);
          setTruckLocation({ lat: data.lat, lng: data.lng });
        }
      } catch { /* non-fatal */ }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => clearInterval(timer);
  }, [mode]);

  // History: load driver list
  useEffect(() => {
    if (mode !== 'history') return;
    api.get('/deliveries/drivers-status').then(({ data }) => {
      setDrivers(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, [mode]);

  // History: fetch track when params change
  useEffect(() => {
    if (mode !== 'history') return;
    setHistPoints([]);
    setHistLoading(true);
    const params = new URLSearchParams({ date: histDate, slot: histSlot });
    if (histDriverId !== 'all') params.set('userId', histDriverId);

    api.get(`/deliveries/route-history?${params}`)
      .then(({ data }) => setHistPoints(Array.isArray(data) ? data : []))
      .catch(() => setHistPoints([]))
      .finally(() => setHistLoading(false));
  }, [mode, histDate, histSlot, histDriverId]);

  const histPositions = histPoints.map((p) => [p.lat, p.lng]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Mode toggle + history controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-zinc-700">
          <button
            onClick={() => setMode('live')}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              mode === 'live'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            En vivo
          </button>
          <button
            onClick={() => setMode('history')}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              mode === 'history'
                ? 'bg-[#e85d04] text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            Historial
          </button>
        </div>

        {mode === 'history' && (
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
              <option value="all">Todo el día</option>
              <option value="11">Mañana (8–18 h)</option>
              <option value="19">Tarde (17–23 h)</option>
            </select>
            {drivers.length > 1 && (
              <select
                value={histDriverId}
                onChange={(e) => setHistDriverId(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-[#e85d04] outline-none"
              >
                <option value="all">Todos los repartidores</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
            {!histLoading && (
              <span className="text-xs text-zinc-500">
                {histPoints.length === 0
                  ? 'Sin datos para este período'
                  : `${histPoints.length} puntos registrados`}
              </span>
            )}
            {histLoading && (
              <span className="text-xs text-zinc-500 animate-pulse">Cargando...</span>
            )}
          </>
        )}
      </div>

      {/* Map */}
      <div className="relative flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden min-h-[400px]">
        {/* Live status badge */}
        {mode === 'live' && (
          <div className="absolute top-3 right-3 z-[1000] bg-black/80 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-bold uppercase border border-zinc-700 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {usingPoll ? 'Sondeo DB' : connected ? 'En vivo' : 'Desconectado'}
          </div>
        )}

        <MapContainer
          center={AGUILARES_COORDS}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Live mode: truck marker */}
          {mode === 'live' && truckLocation && (
            <>
              <Marker position={[truckLocation.lat, truckLocation.lng]} icon={truckIcon}>
                <Popup>
                  <div className="text-center font-bold">Repartidor en movimiento</div>
                </Popup>
              </Marker>
              <MapRecenter lat={truckLocation.lat} lng={truckLocation.lng} />
            </>
          )}

          {/* History mode: polyline + start/end markers */}
          {mode === 'history' && histPositions.length > 1 && (
            <>
              <Polyline
                positions={histPositions}
                color="#e85d04"
                weight={4}
                opacity={0.85}
              />
              <Marker position={histPositions[0]} icon={startIcon}>
                <Popup>
                  Inicio — {new Date(histPoints[0].ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </Popup>
              </Marker>
              <Marker position={histPositions[histPositions.length - 1]} icon={endIcon}>
                <Popup>
                  Fin — {new Date(histPoints[histPoints.length - 1].ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </Popup>
              </Marker>
              <FitBounds positions={histPositions} />
            </>
          )}
        </MapContainer>

        {mode === 'live' && !truckLocation && connected && (
          <div className="absolute bottom-4 left-4 z-[1000] bg-black/80 text-zinc-400 px-3 py-2 rounded text-xs pointer-events-none">
            Esperando señal de GPS...
          </div>
        )}

        {mode === 'history' && !histLoading && histPoints.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/70 text-zinc-400 px-5 py-3 rounded-xl text-sm">
              No hay recorrido registrado para este período
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
