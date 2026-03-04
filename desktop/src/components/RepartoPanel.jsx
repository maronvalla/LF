import { useState } from "react";
import AdminTrackingMap from "./AdminTrackingMap";
import Rutas from "./Rutas";

const VIEWS = [
  { id: "tracking", label: "Seguimiento / Historial" },
  { id: "routes", label: "Optimizacion" },
];

export default function RepartoPanel({ user, setToast }) {
  const [view, setView] = useState("tracking");

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-zinc-700">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                view === item.id
                  ? "bg-[#e85d04] text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {view === "tracking" ? (
          <AdminTrackingMap user={user} />
        ) : (
          <Rutas setToast={setToast} />
        )}
      </div>
    </div>
  );
}
