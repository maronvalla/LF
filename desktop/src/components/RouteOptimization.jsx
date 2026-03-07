import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import api from '../api'; // Adjust path if needed, assuming this file is in components folder and api is in src root or use passed prop

// Fix Leaflet icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function FitBounds({ path }) {
    const map = useMap();
    useEffect(() => {
        if (path.length > 0) {
            const bounds = L.latLngBounds(path);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [path, map]);
    return null;
}

export default function RouteOptimization({ onBack }) {
    const [shift, setShift] = useState('MANIANA');
    const [route, setRoute] = useState(null);
    const [loading, setLoading] = useState(false);

    const optimize = async () => {
        setLoading(true);
        try {
            // Mocking the response for now as requested if backend isn't 100% ready, 
            // but code is set to consume the endpoint.
            // const { data } = await api.post("/rutas/optimizar", { shift }); 

            // MOCK DATA FOR VIZ START
            const mockData = [
                { id: 1, name: 'Galpón', lat: -27.4339, lng: -65.6186, type: 'DEPOT' },
                { id: 2, name: 'Cliente A', lat: -27.4350, lng: -65.6200, address: 'San Martin 100' },
                { id: 3, name: 'Cliente B', lat: -27.4400, lng: -65.6150, address: '9 de Julio 500' },
                { id: 4, name: 'Cliente C', lat: -27.4380, lng: -65.6100, address: 'Rivadavia 200' },
            ];
            // MOCK DATA FOR VIZ END

            setRoute(mockData);
        } catch (err) {
            alert("Error optimizando ruta: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const polylinePositions = route ? route.map(p => [p.lat, p.lng]) : [];

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="btn btn-muted">VOLVER (Esc)</button>
                    <h2 className="text-xl font-bold text-burnt-500 uppercase">Optimización de Rutas (VRP)</h2>
                </div>
                <div className="flex gap-2">
                    <select className="input w-40" value={shift} onChange={e => setShift(e.target.value)}>
                        <option value="MANIANA">MAÑANA</option>
                        <option value="TARDE">TARDE</option>
                    </select>
                    <button className="btn btn-primary" onClick={optimize} disabled={loading}>
                        {loading ? 'CALCULANDO...' : 'OPTIMIZAR RUTA'}
                    </button>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 overflow-hidden">
                {/* Sidebar List */}
                <div className="lg:col-span-1 card overflow-auto h-full space-y-2">
                    {route ? (
                        <div className="space-y-2">
                            {route.map((stop, index) => (
                                <div key={stop.id} className="p-3 border border-zinc-700 rounded bg-zinc-800/50 flex gap-3 items-center">
                                    <div className="w-8 h-8 rounded-full bg-burnt-600 flex items-center justify-center font-bold text-white shrink-0">
                                        {index + 1}
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm">{stop.name}</div>
                                        <div className="text-xs text-zinc-400">{stop.address || 'Ubicación Mapa'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-zinc-500 py-10">
                            Dale a "OPTIMIZAR RUTA" para ver el recorrido sugerido.
                        </div>
                    )}
                </div>

                {/* Map */}
                <div className="lg:col-span-3 card p-0 overflow-hidden relative border-zinc-700">
                    <MapContainer center={[-27.4339, -65.6186]} zoom={14} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                        {route && (
                            <>
                                <Polyline positions={polylinePositions} color="blue" />
                                <FitBounds path={polylinePositions} />
                                {route.map((stop, index) => (
                                    <Marker key={stop.id} position={[stop.lat, stop.lng]}>
                                        <Popup>
                                            <b>{index + 1}. {stop.name}</b><br />
                                            {stop.address}
                                        </Popup>
                                    </Marker>
                                ))}
                            </>
                        )}
                    </MapContainer>
                </div>
            </div>
        </div>
    );
}
