import { useState, useEffect, useRef } from "react";
import api from "../api";
import { SHORTCUTS } from "../config/navigation";

function normalizeTabToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
}

function getTabAppearance(tab, isDark) {
  if (isDark) {
    let colorClass = "group-hover:text-[#e85d04]";
    let borderClass = "border-zinc-700/70 hover:border-[#e85d04]/50";
    let shadowClass = "hover:shadow-[0_10px_40px_rgba(232,93,4,0.1)]";
    let bgClass = "bg-[linear-gradient(180deg,rgba(34,34,36,0.96),rgba(20,20,22,0.94))]";
    let gradientClass = "from-[#e85d04]/10";
    let textClass = "text-white";
    let shortcutClass = "text-zinc-500 bg-zinc-950/90 border-zinc-700";

    if (tab.includes("Productos") || tab.includes("Inventario")) {
      colorClass = "group-hover:text-emerald-500";
      borderClass = "border-zinc-700/70 hover:border-emerald-500/50";
      shadowClass = "hover:shadow-[0_10px_40px_rgba(16,185,129,0.1)]";
      gradientClass = "from-emerald-500/10";
    } else if (tab.includes("Clientes") || tab.includes("Proveedores") || tab.includes("Usuarios")) {
      colorClass = "group-hover:text-blue-500";
      borderClass = "border-zinc-700/70 hover:border-blue-500/50";
      shadowClass = "hover:shadow-[0_10px_40px_rgba(59,130,246,0.1)]";
      gradientClass = "from-blue-500/10";
    } else if (tab.includes("Ventas") || tab.includes("Compras")) {
      colorClass = "group-hover:text-amber-500";
      borderClass = "border-zinc-700/70 hover:border-amber-500/50";
      shadowClass = "hover:shadow-[0_10px_40px_rgba(245,158,11,0.1)]";
      gradientClass = "from-amber-500/10";
    } else if (tab.includes("Reparto")) {
      colorClass = "group-hover:text-purple-500";
      borderClass = "border-zinc-700/70 hover:border-purple-500/50";
      shadowClass = "hover:shadow-[0_10px_40px_rgba(168,85,247,0.1)]";
      gradientClass = "from-purple-500/10";
    } else if (tab.includes("Rutas")) {
      colorClass = "group-hover:text-cyan-500";
      borderClass = "border-zinc-700/70 hover:border-cyan-500/50";
      shadowClass = "hover:shadow-[0_10px_40px_rgba(6,182,212,0.1)]";
      gradientClass = "from-cyan-500/10";
    } else if (tab.includes("Auditoria")) {
      colorClass = "group-hover:text-rose-500";
      borderClass = "border-zinc-700/70 hover:border-rose-500/50";
      shadowClass = "hover:shadow-[0_10px_40px_rgba(244,63,94,0.1)]";
      gradientClass = "from-rose-500/10";
    } else if (tab.includes("Caja")) {
      colorClass = "group-hover:text-yellow-400";
      borderClass = "border-zinc-700/70 hover:border-yellow-400/50";
      shadowClass = "hover:shadow-[0_10px_40px_rgba(250,204,21,0.1)]";
      gradientClass = "from-yellow-400/10";
    }

    return { colorClass, borderClass, shadowClass, bgClass, gradientClass, textClass, shortcutClass };
  } else {
    let colorClass = "group-hover:text-[#e85d04]";
    let borderClass = "border-zinc-200 hover:border-[#e85d04]/50";
    let shadowClass = "shadow-sm hover:shadow-[0_4px_20px_rgba(232,93,4,0.15)]";
    let bgClass = "bg-white";
    let gradientClass = "";
    let textClass = "text-zinc-800";
    let shortcutClass = "text-zinc-400 bg-zinc-50 border-zinc-200 group-hover:text-zinc-500";

    if (tab.includes("Productos") || tab.includes("Inventario")) {
      colorClass = "group-hover:text-emerald-600";
      borderClass = "border-zinc-200 hover:border-emerald-500/50";
      shadowClass = "shadow-sm hover:shadow-[0_4px_20px_rgba(16,185,129,0.15)]";
    } else if (tab.includes("Clientes") || tab.includes("Proveedores") || tab.includes("Usuarios")) {
      colorClass = "group-hover:text-blue-600";
      borderClass = "border-zinc-200 hover:border-blue-500/50";
      shadowClass = "shadow-sm hover:shadow-[0_4px_20px_rgba(59,130,246,0.15)]";
    } else if (tab.includes("Ventas") || tab.includes("Compras")) {
      colorClass = "group-hover:text-amber-600";
      borderClass = "border-zinc-200 hover:border-amber-500/50";
      shadowClass = "shadow-sm hover:shadow-[0_4px_20px_rgba(245,158,11,0.15)]";
    } else if (tab.includes("Reparto")) {
      colorClass = "group-hover:text-purple-600";
      borderClass = "border-zinc-200 hover:border-purple-500/50";
      shadowClass = "shadow-sm hover:shadow-[0_4px_20px_rgba(168,85,247,0.15)]";
    } else if (tab.includes("Rutas")) {
      colorClass = "group-hover:text-cyan-600";
      borderClass = "border-zinc-200 hover:border-cyan-500/50";
      shadowClass = "shadow-sm hover:shadow-[0_4px_20px_rgba(6,182,212,0.15)]";
    } else if (tab.includes("Auditoria")) {
      colorClass = "group-hover:text-rose-600";
      borderClass = "border-zinc-200 hover:border-rose-500/50";
      shadowClass = "shadow-sm hover:shadow-[0_4px_20px_rgba(244,63,94,0.15)]";
    } else if (tab.includes("Caja")) {
      colorClass = "group-hover:text-yellow-600";
      borderClass = "border-zinc-200 hover:border-yellow-500/50";
      shadowClass = "shadow-sm hover:shadow-[0_4px_20px_rgba(234,179,8,0.15)]";
    }

    return { colorClass, borderClass, shadowClass, bgClass, gradientClass, textClass, shortcutClass };
  }
}

export default function HomeNavigation({
  user,
  allowedTabs,
  onSelectTab,
  onLogout,
  pendingCashOrders = [],
  onOpenPendingOrder,
}) {
  const carouselRef = useRef(null);

  const scrollCarousel = (direction) => {
    if (carouselRef.current) {
      const scrollAmount = carouselRef.current.clientWidth * 0.75;
      carouselRef.current.scrollBy({ left: direction === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" });
    }
  };

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("appTheme") || "light";
  });
  const isDark = theme === "dark";

  useEffect(() => {
    localStorage.setItem("appTheme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const externalTab = allowedTabs.find((tab) => tab.includes("Configuracion"));
  const sideTabOrder = ["Ventas", "Compras", "Clientes", "Productos", "Consolidado", "ConsultarVentas"];
  const sideTabs = sideTabOrder
    .map((label) =>
      allowedTabs.find((tab) => normalizeTabToken(tab) === normalizeTabToken(label))
    )
    .filter(Boolean);
  const menuTabs = allowedTabs.filter((tab) => tab !== externalTab && !sideTabs.includes(tab));

  const renderTabButton = (tab, compact = false) => {
    const shortcut = Object.entries(SHORTCUTS).find(([, value]) => value === tab)?.[0];
    const { colorClass, borderClass, shadowClass, bgClass, gradientClass, textClass, shortcutClass } = getTabAppearance(tab, isDark);

    return (
      <button
        key={tab}
        className={`group relative overflow-hidden border rounded-2xl transition-all duration-300 ${isDark ? "hover:-translate-y-1" : "hover:-translate-y-0.5"
          } ${bgClass} ${borderClass} ${shadowClass} w-full p-4 min-h-[92px] lg:min-h-[98px] justify-self-center ${!compact ? "max-w-[214px]" : ""
          }`}
        onClick={() => onSelectTab(tab)}
      >
        <div className="relative z-10">
          <div className={`text-[15px] lg:text-base font-bold transition-colors ${textClass} ${colorClass}`}>{tab}</div>
        </div>
        {shortcut ? (
          <div className={`relative z-10 mt-1.5 flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors ${isDark ? "text-zinc-500" : "text-zinc-400 group-hover:text-zinc-500"
            }`}>
            <kbd className={`rounded border px-2 py-0.5 text-[10px] shadow-sm ${shortcutClass}`}>{shortcut}</kbd>
          </div>
        ) : (
          <div className="h-5 mt-1.5" />
        )}
        {isDark && (
          <>
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br transition-opacity opacity-0 group-hover:opacity-100 ${gradientClass} to-transparent`} />
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
          </>
        )}
      </button>
    );
  };

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen relative w-full overflow-y-auto overflow-x-hidden custom-scrollbar p-8 pb-32 pt-28 md:pt-8 text-center animate-in fade-in zoom-in-95 duration-500 ${isDark
      ? "bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_30%),radial-gradient(circle_at_20%_20%,rgba(232,93,4,0.14),transparent_25%),linear-gradient(180deg,#090c12,#0c1120_55%,#090b11)]"
      : "bg-zinc-50"
      }`}>
      {isDark ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:44px_44px] opacity-20" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_18%)]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(232,93,4,0.03),transparent_40%),radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.03),transparent_35%)] pointer-events-none" />
      )}

      <h1 className={`fixed select-none md:top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45vh] md:-translate-y-1/2 text-[10vw] md:text-[8vw] z-0 font-black tracking-tighter uppercase leading-none whitespace-nowrap pointer-events-none ${isDark ? "opacity-5 text-[#e85d04]" : "opacity-[0.03] text-zinc-900"
        }`}>
        LA FAMILIA
      </h1>

      <div className="fixed top-6 left-6 md:top-10 md:left-10 z-30">
        <button
          onClick={toggleTheme}
          className={`p-2.5 rounded-full border transition-all shadow-sm hover:shadow ${isDark
            ? "border-white/15 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-800"
            : "border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 hover:border-zinc-300"
            }`}
          title={isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
        >
          {isDark ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>

      {externalTab ? (
        <button
          className={`fixed top-6 right-6 md:top-10 md:right-10 z-30 px-5 py-2.5 rounded-full border shadow-sm hover:shadow transition-all text-[11px] font-black uppercase tracking-[0.25em] ${isDark
            ? "border-white/15 bg-[linear-gradient(180deg,rgba(40,40,44,0.92),rgba(20,20,24,0.88))] text-zinc-200 hover:text-white hover:border-[#e85d04]/50 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
            : "border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
            }`}
          onClick={() => onSelectTab(externalTab)}
        >
          Configuracion
        </button>
      ) : null}

      <div className="z-10 w-full max-w-6xl flex flex-col items-stretch gap-6 lg:gap-8 min-h-full">
        {pendingCashOrders.length ? (
          <div
            className={`w-full max-w-3xl lg:max-w-[780px] xl:max-w-[820px] mx-auto rounded-[28px] p-4 md:p-5 relative order-0 ${
              isDark
                ? "bg-[linear-gradient(180deg,rgba(53,39,18,0.9),rgba(30,24,14,0.9))] border border-amber-500/25 shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
                : "bg-[#fff7ed] border-2 border-[#f59e0b]/40 shadow-[0_12px_32px_rgba(245,158,11,0.12)]"
            }`}
          >
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <div className={`text-sm font-black uppercase tracking-[0.22em] ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                  Ordenes pendientes de caja
                </div>
                <div className={`text-xs ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                  {pendingCashOrders.length} orden{pendingCashOrders.length === 1 ? "" : "es"} esperando cobro
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pendingCashOrders.slice(0, 6).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onOpenPendingOrder?.(order.id)}
                  className={`text-left rounded-2xl border px-4 py-3 transition-all ${
                    isDark
                      ? "bg-black/25 border-white/10 hover:border-amber-400/50 hover:bg-black/35"
                      : "bg-white border-amber-200 hover:border-amber-400 hover:bg-amber-50"
                  }`}
                >
                  <div className={`text-sm font-black uppercase truncate ${isDark ? "text-white" : "text-zinc-900"}`}>
                    {order.customer_name || "CONSUMIDOR FINAL"}
                  </div>
                  <div className={`mt-1 text-[11px] uppercase tracking-[0.16em] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    Orden {order.sale_number || order.id}
                  </div>
                  <div className={`mt-2 text-lg font-black ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                    ${Number(order.total_amount || 0).toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {sideTabs.length ? (
          <div className="w-full lg:w-[228px] order-1 lg:fixed lg:left-6 xl:left-8 lg:top-24 xl:top-20 lg:z-20">
            <div className={`relative w-full rounded-[32px] lg:p-4 ${isDark
              ? "lg:border lg:border-white/10 lg:bg-[linear-gradient(180deg,rgba(38,42,56,0.95),rgba(22,25,35,0.95))] lg:backdrop-blur-2xl lg:shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
              : "lg:border-[3px] lg:border-[#e85d04] lg:bg-[#fdfaf8] lg:shadow-lg"
              }`}>
              {isDark && <div className="hidden lg:block absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent_40%)] pointer-events-none" />}

              <div className="relative group/carousel">
                {/* Left Arrow (Mobile only) */}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); scrollCarousel('left'); }}
                  className={`lg:hidden absolute left-0 top-[calc(50%-10px)] -translate-y-1/2 z-20 p-2 rounded-r-xl shadow-lg backdrop-blur-md transition-all ${isDark ? "bg-zinc-900/80 text-white border border-l-0 border-white/20" : "bg-white/90 text-zinc-800 border border-l-0 border-zinc-200"}`}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                </button>

                <div ref={carouselRef} className="-mx-8 px-8 lg:mx-0 lg:px-0 relative flex overflow-x-auto snap-x snap-mandatory lg:grid lg:grid-cols-1 gap-4 lg:auto-rows-fr pb-4 lg:pb-0 scrollbar-hide">
                  {sideTabs.map((tab) => (
                    <div key={tab} className="block w-[240px] sm:w-[280px] lg:w-auto lg:min-w-0 flex-shrink-0 snap-center shrink-0">
                      {renderTabButton(tab, true)}
                    </div>
                  ))}
                  {/* Spacer element for clean scroll boundary */}
                  <div className="w-4 flex-shrink-0 lg:hidden" />
                </div>

                {/* Right Arrow (Mobile only) */}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); scrollCarousel('right'); }}
                  className={`lg:hidden absolute right-0 top-[calc(50%-10px)] -translate-y-1/2 z-20 p-2 rounded-l-xl shadow-lg backdrop-blur-md transition-all animate-pulse ${isDark ? "bg-zinc-900/80 text-white border border-r-0 border-white/20" : "bg-white/90 text-zinc-800 border border-r-0 border-zinc-200"}`}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className={`w-full max-w-3xl lg:max-w-[780px] xl:max-w-[820px] mx-auto rounded-[32px] p-6 md:p-10 relative order-2 ${isDark
          ? "bg-[linear-gradient(180deg,rgba(33,37,48,0.92),rgba(19,22,32,0.9))] backdrop-blur-2xl border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
          : "bg-[#fdfaf8] border-[3px] border-[#e85d04] shadow-[0_20px_60px_rgba(232,93,4,0.08)]"
          }`}>
          {isDark && <div className="absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_30%)] pointer-events-none" />}

          <div className="relative">
            <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] mb-6 ${isDark
              ? "border border-white/10 bg-white/5 text-zinc-300"
              : "border border-zinc-200 bg-white text-zinc-500 shadow-sm"
              }`}>
              Menu Principal
            </div>

            <h2 className={`text-[#e85d04] text-4xl md:text-[3.4rem] font-black tracking-tight leading-[1.1] mb-3 ${isDark ? "drop-shadow-[0_4px_18px_rgba(232,93,4,0.24)]" : ""
              }`}>
              DISTRIBUIDORA LA FAMILIA
            </h2>

            <div className={`font-mono tracking-[0.22em] text-xs uppercase mb-10 ${isDark ? "text-zinc-300" : "text-zinc-500 font-bold"
              }`}>
              {user.fullName || user.username} // {user.role}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-[700px] mx-auto">
              {menuTabs.map((tab) => renderTabButton(tab))}
            </div>
          </div>
        </div>
      </div>

      <button
        className={`fixed bottom-8 px-6 py-3 rounded-full border shadow-sm hover:shadow transition-all text-[11px] font-black tracking-[0.2em] uppercase z-20 ${isDark
          ? "border-red-400/20 bg-[linear-gradient(180deg,rgba(90,17,17,0.85),rgba(55,13,13,0.82))] text-red-300 hover:text-white hover:bg-red-600 shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
          : "border-zinc-200 bg-white text-zinc-700 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
          }`}
        onClick={() => {
          api.post("/auth/logout").finally(onLogout);
        }}
      >
        Cerrar Sesión
      </button>
    </div>
  );
}
