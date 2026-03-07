import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const leafletDefaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = leafletDefaultIcon;

function MapClickSelect({ position, setPosition }) {
  useMapEvents({
    click(event) {
      setPosition({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return (
    <Marker
      position={[position.lat, position.lng]}
      draggable
      eventHandlers={{
        dragend: (event) => {
          const point = event.target.getLatLng();
          setPosition({ lat: point.lat, lng: point.lng });
        },
      }}
    />
  );
}

function MapRecenter({ position }) {
  const map = useMap();

  useEffect(() => {
    map.setView([position.lat, position.lng], map.getZoom());
  }, [map, position.lat, position.lng]);

  return null;
}

export default function ClientMapPickerModal({
  mapPosition,
  setMapPosition,
  mapResolvingAddress,
  onClose,
  onApplyCoords,
  onApplyWithAddress,
}) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="w-full max-w-4xl h-[80vh] bg-[#121212] border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 bg-[#1a1a1a] border-b border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-black text-white uppercase tracking-wider">Ubicar Cliente En Mapa</div>
            <div className="text-[11px] text-zinc-400">Click en el mapa para marcar la ubicacion exacta</div>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold uppercase"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
        <div className="flex-1 relative">
          <MapContainer center={[mapPosition.lat, mapPosition.lng]} zoom={16} className="h-full w-full">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
            />
            <MapClickSelect position={mapPosition} setPosition={setMapPosition} />
            <MapRecenter position={mapPosition} />
          </MapContainer>
        </div>
        <div className="px-4 py-3 bg-[#1a1a1a] border-t border-zinc-800 flex items-center justify-between">
          <div className="text-xs text-zinc-300 font-mono">
            {mapPosition.lat.toFixed(6)}, {mapPosition.lng.toFixed(6)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider"
              onClick={onApplyCoords}
              disabled={mapResolvingAddress}
            >
              Solo coordenadas
            </button>
            <button
              type="button"
              className="px-4 py-2 bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-60"
              onClick={onApplyWithAddress}
              disabled={mapResolvingAddress}
            >
              {mapResolvingAddress ? "Buscando direccion..." : "Usar y completar direccion"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
