import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import io from 'socket.io-client';
import { socketOrigin } from '../api';

// --- Configuration ---
const SOCKET_URL = socketOrigin;
const AGUILARES_COORDS = [-27.4333, -65.6167];

// Custom Truck Icon
const truckIcon = L.divIcon({
    html: '<div style="font-size: 24px;">🚚</div>',
    className: 'truck-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
});

function MapRecenter({ lat, lng }) {
    const map = useMap();
    useEffect(() => {
        if (lat && lng) {
            map.flyTo([lat, lng], 15);
        }
    }, [lat, lng, map]);
    return null;
}

export default function AdminTrackingMap({ user }) {
    const [truckLocation, setTruckLocation] = useState(null);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef(null);

    // 1. RBAC Control
    // Assuming user object has a role property. 
    // If structure is different (e.g. user.is_admin), adjust accordingly.
    // Based on typical JWT payloads in this stack.
    if (!user || (user.role !== 'ADMIN' && user.username !== 'admin')) {
        return (
            <div className="h-64 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 font-mono text-sm">
                🔒 ACCESO DENEGADO: Solo administradores pueden ver el rastreo en vivo.
            </div>
        );
    }

    // 2. Socket Connection
    useEffect(() => {
        socketRef.current = io(SOCKET_URL);

        socketRef.current.on("connect", () => {
            console.log("📡 Admin Tracking Connected");
            setConnected(true);
        });

        socketRef.current.on("disconnect", () => {
            setConnected(false);
        });

        socketRef.current.on("update_mapa", (data) => {
            console.log("📍 Update received:", data);
            if (data && data.lat && data.lng) {
                setTruckLocation({ lat: data.lat, lng: data.lng, user: data.user_id });
            }
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    return (
        <div className="card p-0 overflow-hidden relative border-zinc-700 h-[500px] shadow-xl">
            {/* Overlay Status */}
            <div className="absolute top-4 right-4 z-[1000] bg-black/80 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-bold uppercase border border-zinc-700 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                {connected ? 'EN VIVO' : 'DESCONECTADO'}
            </div>

            <MapContainer
                center={AGUILARES_COORDS}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />

                {truckLocation && (
                    <>
                        <Marker position={[truckLocation.lat, truckLocation.lng]} icon={truckIcon}>
                            <Popup>
                                <div className="text-center">
                                    <strong className="block uppercase text-xs text-zinc-500">Repartidor</strong>
                                    <span className="text-lg font-bold">En movimiento</span>
                                </div>
                            </Popup>
                        </Marker>
                        <MapRecenter lat={truckLocation.lat} lng={truckLocation.lng} />
                    </>
                )}
            </MapContainer>

            {!truckLocation && connected && (
                <div className="absolute bottom-4 left-4 z-[1000] bg-black/80 text-zinc-400 px-3 py-2 rounded text-xs pointer-events-none">
                    Esperando señal de GPS...
                </div>
            )}
        </div>
    );
}
