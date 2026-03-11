import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import api, { SESSION_EXPIRED_EVENT, hydrateToken, isAndroidApk, setToken, socketOrigin } from "./api";
import AppToast from "./components/AppToast";
import AppSectionLoader from "./components/app/AppSectionLoader";
import DesktopShell from "./components/app/DesktopShell";
import MobileShell from "./components/app/MobileShell";
import LoginView from "./components/LoginView";
import { isTypingTarget } from "./components/app/mobileNavigation";
import { ROLE_TABS, SHORTCUTS } from "./config/navigation";

const ConsultarVentas = lazy(() => import("./components/ConsultarVentas"));
const ConsultarOrdenes = lazy(() => import("./components/ConsultarOrdenes"));
const DriverApp = lazy(() => import("./components/DriverApp"));
const RepartoPanel = lazy(() => import("./components/RepartoPanel"));
const Productos = lazy(() => import("./components/Productos"));
const Clientes = lazy(() => import("./components/Clientes"));
const CRM = lazy(() => import("./components/CRM"));
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

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [pendingCashOrders, setPendingCashOrders] = useState([]);
  const [pendingOrderToOpen, setPendingOrderToOpen] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

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

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  const role = String(user?.role || "").toUpperCase();
  const allowedTabs = useMemo(() => ROLE_TABS[role] || [], [role]);
  const canAccessCRM = role === "ADMIN";
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
    const canAccessActiveTab =
      allowedTabs.includes(activeTab) || (activeTab === "CRM" && canAccessCRM);
    if (activeTab !== "Dashboard" && !canAccessActiveTab) {
      setActiveTab("Dashboard");
    }
    setIsMobileMenuOpen(false);
  }, [activeTab, allowedTabs, canAccessCRM, role, user]);

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
      case "CRM":
        return canAccessCRM ? <CRM setToast={setToast} /> : null;
      case "👥 Clientes":
        return <Clientes user={user} setToast={setToast} onOpenCRM={() => setActiveTab("CRM")} />;
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
        return <ConsultarVentas user={user} />;
      case "📋 ConsultarOrdenes":
        return <ConsultarOrdenes setToast={setToast} />;
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
  const useMobileShell = isAndroidApk || viewportWidth < 960;
  const handleRequestLogout = () => api.post("/auth/logout").finally(handleLogout);
  const handleOpenPendingOrder = (orderId) => {
    const salesTab = allowedTabs.find((tab) => String(tab).toLowerCase().includes("ventas")) || "Ventas";
    setPendingOrderToOpen(orderId);
    setActiveTab(salesTab);
  };

  return (
    <>
      {useMobileShell ? (
        <MobileShell
          isDark={isDark}
          user={user}
          role={role}
          activeTab={activeTab}
          allowedTabs={allowedTabs}
          notifications={notifications}
          onDismissAlert={dismissAlert}
          onDismissAllAlerts={dismissAllAlerts}
          pendingCashOrders={pendingCashOrders}
          onOpenPendingOrder={handleOpenPendingOrder}
          onCancelPendingOrder={handleCancelPendingOrder}
          onSelectTab={setActiveTab}
          onRequestLogout={handleRequestLogout}
          renderActiveTab={renderActiveTab}
        />
      ) : (
        <DesktopShell
          isDark={isDark}
          activeTab={activeTab}
          allowedTabs={allowedTabs}
          user={user}
          isMobileMenuOpen={isMobileMenuOpen}
          onSetMobileMenuOpen={setIsMobileMenuOpen}
          onSelectTab={setActiveTab}
          onLogout={handleLogout}
          pendingCashOrders={pendingCashOrders}
          onOpenPendingOrder={handleOpenPendingOrder}
          onCancelPendingOrder={handleCancelPendingOrder}
          notifications={notifications}
          onDismissAlert={dismissAlert}
          onDismissAllAlerts={dismissAllAlerts}
          renderActiveTab={renderActiveTab}
        />
      )}

      {toast ? <AppToast {...toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}

