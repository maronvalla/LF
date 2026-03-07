import React, { useState, useEffect, useRef, useCallback } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export default function ClientModal({ client, onClose, onSave }) {
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        address: '',
        notes: '',
        lat: -27.432028, // Avenida Mitre 831, Aguilares
        lng: -65.616528, // Avenida Mitre 831, Aguilares
    });

    const mapRef = useRef(null);

    useEffect(() => {
        if (client) {
            setFormData({
                ...client,
                lat: client.lat || -27.432028,
                lng: client.lng || -65.616528,
            });
        }
    }, [client]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = () => {
        onSave(formData);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            handleSave();
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    const handleMapClick = useCallback((e) => {
        const { lat, lng } = e.lngLat;
        setFormData((prev) => ({ ...prev, lat, lng }));
    }, []);

    const handleDragEnd = useCallback((e) => {
        const { lat, lng } = e.lngLat;
        setFormData((prev) => ({ ...prev, lat, lng }));
    }, []);

    // Prevent map from stealing focus on load, but allow interaction
    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onKeyDown={handleKeyDown}>
            <div className="bg-graphite-950 border-2 border-zinc-800 rounded-xl w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 overflow-hidden shadow-2xl h-[600px]">
                {/* Form Section */}
                <div className="p-6 flex flex-col space-y-4 overflow-auto">
                    <h3 className="text-2xl font-black text-burnt-500 uppercase">{client ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>

                    <div>
                        <label className="text-xs uppercase font-bold text-zinc-500">Razón Social / Nombre</label>
                        <input autoFocus name="name" className="input text-lg font-bold" value={formData.name} onChange={handleChange} placeholder="Ej: JUAN PEREZ" />
                    </div>

                    <div>
                        <label className="text-xs uppercase font-bold text-zinc-500">Teléfono</label>
                        <input name="phone" className="input font-mono" value={formData.phone} onChange={handleChange} placeholder="381..." />
                    </div>

                    <div>
                        <label className="text-xs uppercase font-bold text-zinc-500">Dirección</label>
                        <input name="address" className="input" value={formData.address} onChange={handleChange} placeholder="Calle 123..." />
                    </div>

                    <div>
                        <label className="text-xs uppercase font-bold text-zinc-500">Notas</label>
                        <textarea name="notes" className="input h-24 resize-none" value={formData.notes || ''} onChange={handleChange} placeholder="Referencias, horarios..." />
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-auto pt-4">
                        <button className="btn btn-muted uppercase font-bold" onClick={onClose}>Cancelar (Esc)</button>
                        <button className="btn btn-primary uppercase font-bold" onClick={handleSave}>Guardar (Enter)</button>
                    </div>
                </div>

                {/* Map Section */}
                <div className="relative h-full bg-zinc-900 border-l border-zinc-800">
                    <div className="absolute top-2 left-2 z-[10] bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none">
                        Click en el mapa para ubicar
                    </div>
                    <Map
                        ref={mapRef}
                        initialViewState={{
                            longitude: formData.lng,
                            latitude: formData.lat,
                            zoom: 15,
                        }}
                        mapStyle={OPENFREEMAP_STYLE}
                        style={{ height: '100%', width: '100%' }}
                        onClick={handleMapClick}
                        cursor="crosshair"
                    >
                        <NavigationControl position="top-right" />
                        <Marker
                            latitude={formData.lat}
                            longitude={formData.lng}
                            draggable
                            onDragEnd={handleDragEnd}
                        >
                            <div
                                style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: '50%',
                                    background: '#e85d04',
                                    border: '3px solid white',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                    cursor: 'grab',
                                }}
                            />
                        </Marker>
                    </Map>
                </div>
            </div>
        </div>
    );
}
