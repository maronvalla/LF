import { useEffect, useRef, useState } from "react";

function getAlertIcon(type) {
  if (type === "driver_logout_pin") return "🔐";
  if (type === "logout") return "🚪";
  return "📴";
}

export default function NotificationBell({ alerts, onDismiss, onDismissAll, isDark = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const count = alerts.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative p-2 rounded-lg transition-all shadow-md ${
          isDark
            ? "bg-[#121212] border border-zinc-800 hover:border-amber-600 text-zinc-400 hover:text-amber-400"
            : "bg-white border border-zinc-200 hover:border-amber-400 text-zinc-600 hover:text-amber-600"
        }`}
        title="Notificaciones"
        type="button"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-zinc-200 rounded-xl shadow-2xl z-[100]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100">
            <span className="text-xs font-black uppercase text-zinc-700">Notificaciones</span>
            {count > 0 && (
              <button
                onClick={onDismissAll}
                className="text-[10px] text-zinc-400 hover:text-red-500 font-bold uppercase transition-colors"
                type="button"
              >
                Limpiar todo
              </button>
            )}
          </div>
          {count === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-400">Sin notificaciones pendientes</div>
          ) : (
            <ul className="max-h-72 overflow-auto divide-y divide-zinc-50">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-base mt-0.5 shrink-0">{getAlertIcon(alert.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-zinc-900">{alert.driverName || alert.title || "Sistema"}</div>
                    <div className="text-[11px] text-zinc-600 mt-0.5 whitespace-pre-wrap">{alert.message}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{alert.time}</div>
                  </div>
                  <button
                    onClick={() => onDismiss(alert.id)}
                    className="text-zinc-300 hover:text-red-400 text-xs shrink-0 mt-0.5 transition-colors"
                    type="button"
                    title="Descartar"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
