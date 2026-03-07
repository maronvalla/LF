import React, { useState, useEffect, useRef, useCallback } from 'react';
import Map, { Marker, Popup, Source, Layer, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import api from '../api'; // Adjust path if needed, assuming this file is in components folder and api is in src root or use passed prop

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export default function RouteOptimization({ onBack }) {
    const [shift, setShift] = useState('MANIANA');
    const [route, setRoute] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedStop, setSelectedStop] = useState(null);
    const mapRef = useRef(null);

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

    // Fit bounds when route changes
    useEffect(() => {
        if (!route || route.length === 0 || !mapRef.current) return;
        const lngs = route.map((p) => p.lng);
        const lats = route.map((p) => p.lat);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        mapRef.current.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            { padding: 50, duration: 800 }
        );
    }, [route]);

    // GeoJSON linestring for the polyline
    const lineGeoJSON = route
        ? {
              type: 'Feature',
              geometry: {
                  type: 'LineString',
                  // GeoJSON uses [longitude, latitude]
                  coordinates: route.map((p) => [p.lng, p.lat]),
              },
          }
        : null;

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
                    <Map
                        ref={mapRef}
                        initialViewState={{
                            longitude: -65.6186,
                            latitude: -27.4339,
                            zoom: 14,
                        }}
                        mapStyle={OPENFREEMAP_STYLE}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <NavigationControl position="top-right" />

                        {/* Polyline */}
                        {lineGeoJSON && (
                            <Source type="geojson" data={lineGeoJSON}>
                                <Layer
                                    type="line"
                                    paint={{
                                        'line-color': '#2563eb',
                                        'line-width': 3,
                                        'line-opacity': 0.85,
                                    }}
                                    layout={{
                                        'line-join': 'round',
                                        'line-cap': 'round',
                                    }}
                                />
                            </Source>
                        )}

                        {/* Stop markers */}
                        {route &&
                            route.map((stop, index) => (
                                <Marker
                                    key={stop.id}
                                    latitude={stop.lat}
                                    longitude={stop.lng}
                                    onClick={(e) => {
                                        e.originalEvent.stopPropagation();
                                        setSelectedStop({ ...stop, index });
                                    }}
                                >
                                    <div
                                        style={{
                                            background: '#e85d04',
                                            color: 'white',
                                            width: 28,
                                            height: 28,
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 'bold',
                                            fontSize: 12,
                                            border: '2px solid white',
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {index + 1}
                                    </div>
                                </Marker>
                            ))}

                        {/* Popup */}
                        {selectedStop && (
                            <Popup
                                latitude={selectedStop.lat}
                                longitude={selectedStop.lng}
                                onClose={() => setSelectedStop(null)}
                                closeButton={true}
                                closeOnClick={false}
                                anchor="bottom"
                            >
                                <div style={{ padding: '4px 2px' }}>
                                    <b>{selectedStop.index + 1}. {selectedStop.name}</b>
                                    <br />
                                    {selectedStop.address}
                                </div>
                            </Popup>
                        )}
                    </Map>
                </div>
            </div>
        </div>
    );
}
