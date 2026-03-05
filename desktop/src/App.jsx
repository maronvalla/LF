import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import api, { SESSION_EXPIRED_EVENT, hydrateToken, isAndroidApk, setToken, socketOrigin } from "./api";
import AppToast from "./components/AppToast";
import HomeNavigation from "./components/HomeNavigation";
import LoginView from "./components/LoginView";
import NotificationBell from "./components/NotificationBell";
import { ROLE_TABS, SHORTCUTS } from "./config/navigation";

function isTypingTarget(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
}

const ConsultarVentas = lazy(() => import("./components/ConsultarVentas"));
const DriverApp = lazy(() => import("./components/DriverApp"));
const RepartoPanel = lazy(() => import("./components/RepartoPanel"));
const Productos = lazy(() => import("./components/Productos"));
const Clientes = lazy(() => import("./components/Clientes"));
const Compras = lazy(() => import("./components/Compras"));
const Ventas = lazy(() => import("./components/Ventas"));
const Inventario = lazy(() => import("./components/Inventario"));
const Usuarios = lazy(() => import("./components/Usuarios"));
const Auditoria = lazy(() => import("./components/Auditoria"));
const Proveedores = lazy(() => import("./components/Proveedores"));
const Rutas = lazy(() => import("./components/Rutas"));
const Consolidado = lazy(() => import("./components/Consolidado"));
const CuentaCorriente = lazy(() => import("./components/CuentaCorriente"));
const Configuracion = lazy(() => import("./components/Configuracion"));
const Caja = lazy(() => import("./components/Caja"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const Informes = lazy(() => import("./components/Informes"));

function AppSectionLoader({ isDark }) {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div
        className={`rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-widest ${
          isDark
            ? "bg-[#121212] border-zinc-800 text-zinc-400"
            : "bg-white border-zinc-200 text-zinc-600"
        }`}
      >
        Cargando seccion...
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [pendingCashOrders, setPendingCashOrders] = useState([]);
  const [pendingOrderToOpen, setPendingOrderToOpen] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!hydrateToken()) return;

    api
      .get("/auth/me")
      .then((response) => {
        const hydratedUser = response.data.user;
        const hydratedRole = String(hydratedUser?.role || "").toUpperCase();
        if (isAndroidApk && hydratedRole === "VENDEDOR") {
          setToken(null);
          setError("En la APK no se permite ingresar con el rol VENDEDOR.");
          return;
        }
        setError("");
        setUser(hydratedUser);
      })
      .catch(() => setToken(null));
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setActiveTab("Dashboard");
      setUser(null);
      setToast(null);
      setPendingCashOrders([]);
      setPendingOrderToOpen("");
      setNotifications([]);
      setError("Sesion expirada. Inicia sesion nuevamente.");
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  useEffect(() => {
    const handleNavigateDashboard = () => setActiveTab("Dashboard");
    window.addEventListener("app:navigate-dashboard", handleNavigateDashboard);
    return () => window.removeEventListener("app:navigate-dashboard", handleNavigateDashboard);
  }, []);

  const role = String(user?.role || "").toUpperCase();
  const allowedTabs = useMemo(() => ROLE_TABS[role] || [], [role]);
  const canManageCashOrders = role === "ADMIN" || role === "CAJERO";

  useEffect(() => {
    const blockReloadShortcuts = (event) => {
      const key = String(event.key || "").toLowerCase();
      const isReloadCombo = (event.ctrlKey || event.metaKey) && key === "r";
      if (!isReloadCombo) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", blockReloadShortcuts, { capture: true });
    return () => window.removeEventListener("keydown", blockReloadShortcuts, { capture: true });
  }, []);

  useEffect(() => {
    if (!user || role === "REPARTIDOR") return;
    if (activeTab !== "Dashboard" && !allowedTabs.includes(activeTab)) {
      setActiveTab("Dashboard");
    }
    setIsMobileMenuOpen(false);
  }, [activeTab, allowedTabs, role, user]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;

      const allowedShortcuts = Object.fromEntries(
        Object.entries(SHORTCUTS).filter(([, tab]) => allowedTabs.includes(tab))
      );
      const hasOpenModal = Boolean(document.querySelector(".fixed.inset-0"));

      if (hasOpenModal) return;

      if (event.key === "Escape" && activeTab !== "Dashboard") {
        event.preventDefault();
        setActiveTab("Dashboard");
        return;
      }

      if (activeTab !== "Dashboard") return;

      if (allowedShortcuts[event.key]) {
        event.preventDefault();
        setActiveTab(allowedShortcuts[event.key]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, allowedTabs]);

  // Socket listener for driver route completion — admin/cajero only
  useEffect(() => {
    if (!user || role === "REPARTIDOR") return;

    // Request browser notification permission once
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const socket = io(socketOrigin, {
      transports: ["websocket", "polling"],
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });

    socket.on("ruta_finalizada", (data) => {
      const title = "Recorrido finalizado";
      const body = data?.message || `${data?.driverName || "El repartidor"} finalizó su recorrido`;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body, icon: "/favicon.ico" });
      }
      setToast({ message: body, type: "success" });
    });

    socket.on("driver_offline_alert", (data) => {
      const alert = {
        id: Date.now() + Math.random(),
        type: data?.type || "disconnect",
        driverName: data?.driverName || "Repartidor",
        message: data?.message || "El repartidor se desconectó",
        time: data?.ts
          ? new Date(data.ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
          : new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      };
      setNotifications((prev) => [alert, ...prev]);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Alerta de repartidor", { body: alert.message, icon: "/favicon.ico" });
      }
    });

    if (role === "ADMIN") {
      socket.on("admin_security_alert", (data) => {
        const alert = {
          id: Date.now() + Math.random(),
          type: data?.type || "security",
          driverName: data?.driverName || "Chofer",
          message: data?.message || "Solicitud de autorizacion",
          time: data?.ts
            ? new Date(data.ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
            : new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
        };
        setNotifications((prev) => [alert, ...prev]);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("PIN de cierre de chofer", { body: alert.message, icon: "/favicon.ico" });
        }
      });
    }

    return () => {
      socket.disconnect();
    };
  }, [user, role]);

  useEffect(() => {
    if (!user || !canManageCashOrders) {
      setPendingCashOrders([]);
      return;
    }

    let cancelled = false;

    const loadPendingCashOrders = async () => {
      try {
        const { data } = await api.get("/sales/pending-orders");
        if (!cancelled) setPendingCashOrders(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setPendingCashOrders([]);
      }
    };

    loadPendingCashOrders();
    const timer = window.setInterval(loadPendingCashOrders, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [canManageCashOrders, user]);

  const refreshPendingCashOrders = async () => {
    if (!canManageCashOrders) return;
    try {
      const { data } = await api.get("/sales/pending-orders");
      setPendingCashOrders(Array.isArray(data) ? data : []);
    } catch {
      setPendingCashOrders([]);
    }
  };

  const handleCancelPendingOrder = async (orderId) => {
    try {
      await api.post(`/sales/${orderId}/anular`, { reason: "Anulada desde panel de caja" });
      setPendingCashOrders((prev) => prev.filter((o) => o.id !== orderId));
      setToast({ message: "Orden anulada", type: "success" });
    } catch (err) {
      setToast({ message: err.response?.data?.message || "No se pudo anular la orden", type: "error" });
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setNotifications([]);
    setPendingCashOrders([]);
    setPendingOrderToOpen("");
  };

  const dismissAlert = (id) => setNotifications((prev) => prev.filter((a) => a.id !== id));
  const dismissAllAlerts = () => setNotifications([]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case "Dashboard":
        return <Dashboard user={user} setToast={setToast} />;
      case "📦 Productos":
        return <Productos user={user} setToast={setToast} />;
      case "👥 Clientes":
        return <Clientes setToast={setToast} />;
      case "🛒 Compras":
        return <Compras setToast={setToast} />;
      case "🚚 Proveedores":
        return <Proveedores user={user} setToast={setToast} />;
      case "🏷️ Ventas":
        return (
          <Ventas
            user={user}
            setToast={setToast}
            pendingOrderId={pendingOrderToOpen}
            onPendingOrderHandled={() => setPendingOrderToOpen("")}
            onOrdersChanged={refreshPendingCashOrders}
          />
        );
      case "📝 ConsultarVentas":
        return <ConsultarVentas />;
      case "🛵 Reparto":
        return role === "REPARTIDOR" ? (
          <DriverApp onLogout={handleLogout} />
        ) : (
          <RepartoPanel user={user} setToast={setToast} />
        );
      case "📊 Consolidado":
        return <Consolidado user={user} setToast={setToast} />;
      case "Informes":
        return <Informes user={user} setToast={setToast} />;
      case "🧾 Cuenta Corriente":
        return <CuentaCorriente user={user} setToast={setToast} />;
      case "💰 Caja":
        return <Caja user={user} setToast={setToast} />;
      case "🧭 Configuracion":
        return <Configuracion user={user} setToast={setToast} />;
      case "🗺️ Rutas":
        return <Rutas setToast={setToast} />;
      case "🏢 Inventario":
        return <Inventario setToast={setToast} />;
      case "⚙️ Usuarios":
        return <Usuarios user={user} setToast={setToast} />;
      case "🔍 Auditoria":
        return <Auditoria user={user} setToast={setToast} />;
      default:
        return null;
    }
  };

  if (!user) {
    return <LoginView onLogin={setUser} onError={setError} error={error} />;
  }

  if (role === "REPARTIDOR") {
    return (
      <Suspense fallback={<AppSectionLoader isDark={false} />}>
        <DriverApp onLogout={handleLogout} user={user} />
      </Suspense>
    );
  }

  const isDark = (localStorage.getItem("appTheme") || "light") === "dark";

  return (
    <div className={`h-screen flex font-sans overflow-hidden ${isDark ? "bg-zinc-950 text-white" : "bg-zinc-50 text-zinc-900"}`}>
      {activeTab === "Dashboard" ? (
        <HomeNavigation
          user={user}
          allowedTabs={allowedTabs}
          onSelectTab={setActiveTab}
          onLogout={handleLogout}
          pendingCashOrders={pendingCashOrders}
          onOpenPendingOrder={(orderId) => {
            setPendingOrderToOpen(orderId);
            setActiveTab("🏷️ Ventas");
          }}
          onCancelPendingOrder={handleCancelPendingOrder}
        />
      ) : (
        <main className="flex-1 h-screen flex flex-col relative animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="absolute top-4 left-4 z-50 flex gap-2">
            <button
              onClick={() => setActiveTab("Dashboard")}
              className={`hidden md:flex px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-xl items-center gap-2 ${isDark ? "bg-[#121212] border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white" : "bg-white border border-zinc-200 hover:border-[#e85d04] text-zinc-600 hover:text-[#e85d04]"}`}
            >
              <span>VOLVER AL INICIO</span>
              <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-normal ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>ESC</kbd>
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`md:hidden p-2 rounded-lg transition-all shadow-md ${isDark ? "bg-[#121212] border border-zinc-800 text-zinc-400" : "bg-white border border-zinc-200 text-zinc-600"} ${isMobileMenuOpen ? (isDark ? "bg-zinc-800 text-white" : "bg-zinc-100 text-[#e85d04]") : ""}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isMobileMenuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </>
                ) : (
                  <>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                  </>
                )}
              </svg>
            </button>
          </div>

          {isMobileMenuOpen && (
            <div className="md:hidden absolute inset-0 z-40 flex flex-col pt-16 animate-in slide-in-from-left duration-300">
              <div className="flex-1 overflow-y-auto w-full p-4 shadow-2xl backdrop-blur-3xl bg-white/90 dark:bg-black/90 pb-24">
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => setActiveTab("Dashboard")}
                    className="p-4 rounded-xl border-2 border-[#e85d04] bg-[#e85d04]/10 text-[#e85d04] font-black text-left w-full shadow-sm flex items-center justify-between"
                  >
                    <span>VOLVER AL INICIO</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                  </button>
                  {allowedTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`p-4 rounded-xl border text-left font-bold shadow-sm transition-colors ${activeTab === tab
                        ? (isDark ? "bg-zinc-800 border-zinc-700 text-white" : "bg-zinc-100 border-[#e85d04] text-[#e85d04]")
                        : (isDark ? "bg-[#121212] border-zinc-800 text-zinc-400" : "bg-white border-zinc-200 text-zinc-700")
                        }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto p-4 md:p-6 pb-6 pt-20">
            <Suspense fallback={<AppSectionLoader isDark={isDark} />}>
              {renderActiveTab()}
            </Suspense>
          </div>
        </main>
      )}

      <div className="absolute top-4 right-4 z-50">
        <NotificationBell
          alerts={notifications}
          onDismiss={dismissAlert}
          onDismissAll={dismissAllAlerts}
          isDark={isDark}
        />
      </div>

      {toast ? <AppToast {...toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
