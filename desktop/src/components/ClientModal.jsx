import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function LocationMarker({ position, setPosition }) {
    useMapEvents({
        click(e) {
            setPosition(e.latlng);
        },
    });

    return position === null ? null : (
        <Marker position={position}></Marker>
    );
}

export default function ClientModal({ client, onClose, onSave }) {
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        address: '',
        notes: '',
        lat: -27.432028, // Avenida Mitre 831, Aguilares
        lng: -65.616528, // Avenida Mitre 831, Aguilares
    });

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
                    <div className="absolute top-2 left-2 z-[1000] bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none">
                        Click en el mapa para ubicar
                    </div>
                    <MapContainer center={[formData.lat, formData.lng]} zoom={15} style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                        <LocationMarker
                            position={{ lat: formData.lat, lng: formData.lng }}
                            setPosition={(pos) => setFormData({ ...formData, lat: pos.lat, lng: pos.lng })}
                        />
                    </MapContainer>
                </div>
            </div>
        </div>
    );
}
