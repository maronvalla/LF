import { useEffect, useRef, useCallback } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export default function ClientMapPickerModal({
  mapPosition,
  setMapPosition,
  mapResolvingAddress,
  onClose,
  onApplyCoords,
  onApplyWithAddress,
}) {
  const mapRef = useRef(null);
  const positionRef = useRef(mapPosition);

  // Keep ref in sync so flyTo always uses latest position
  useEffect(() => {
    positionRef.current = mapPosition;
  }, [mapPosition]);

  // When mapPosition changes from outside (e.g. address resolution), recenter map
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [mapPosition.lng, mapPosition.lat],
        zoom: mapRef.current.getZoom(),
        duration: 400,
      });
    }
  }, [mapPosition.lat, mapPosition.lng]);

  const handleMapClick = useCallback(
    (e) => {
      const { lat, lng } = e.lngLat;
      setMapPosition({ lat, lng });
    },
    [setMapPosition]
  );

  const handleDragEnd = useCallback(
    (e) => {
      const { lat, lng } = e.lngLat;
      setMapPosition({ lat, lng });
    },
    [setMapPosition]
  );

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
          <Map
            ref={mapRef}
            initialViewState={{
              longitude: mapPosition.lng,
              latitude: mapPosition.lat,
              zoom: 16,
            }}
            mapStyle={OPENFREEMAP_STYLE}
            style={{ width: "100%", height: "100%" }}
            onClick={handleMapClick}
            cursor="crosshair"
          >
            <NavigationControl position="top-right" />
            <Marker
              latitude={mapPosition.lat}
              longitude={mapPosition.lng}
              draggable
              onDragEnd={handleDragEnd}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#e85d04",
                  border: "3px solid white",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                  cursor: "grab",
                }}
              />
            </Marker>
          </Map>
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
