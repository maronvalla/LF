import { useEffect, useMemo, useState } from "react";
import api, { hydrateToken, setToken } from "./api";
import PaymentModal from "./components/PaymentModal";
import ConsultarVentas from "./components/ConsultarVentas";
import DriverApp from "./components/DriverApp";
import AdminTrackingMap from "./components/AdminTrackingMap";
import Productos from "./components/Productos";
import Clientes from "./components/Clientes";
import Compras from "./components/Compras";
import Ventas from "./components/Ventas";
import Inventario from "./components/Inventario";
import Usuarios from "./components/Usuarios";
import Auditoria from "./components/Auditoria";
import Proveedores from "./components/Proveedores";
import Rutas from "./components/Rutas";
import Consolidado from "./components/Consolidado";
import Configuracion from "./components/Configuracion";

const TABS = [
  "Dashboard",
  "📦 Productos",
  "👥 Clientes",
  "🛒 Compras",
  "🏷️ Ventas",
  "🛵 Reparto",
  "📊 Consolidado",
  "🧭 Configuracion",
  "🗺️ Rutas",
  "📝 ConsultarVentas",
  "⚙️ Usuarios",
  "🚚 Proveedores",
  "🏢 Inventario",
  "🔍 Auditoria"
];

const SHORTCUTS = {
  F1: "📦 Productos",
  F2: "👥 Clientes",
  F3: "🛒 Compras",
  F4: "🏷️ Ventas",
  F5: "🛵 Reparto",
  F6: "📝 ConsultarVentas",
  F7: "🗺️ Rutas",
  F8: "⚙️ Usuarios",
  F9: "📊 Consolidado",
};

const ROLE_TABS = {
  ADMIN: TABS.filter((t) => t !== "Dashboard"),
  CAJERO: ["📦 Productos", "👥 Clientes", "🛒 Compras", "📝 ConsultarVentas", "📊 Consolidado", "🗺️ Rutas", "🚚 Proveedores"],
  VENDEDOR: ["🏷️ Ventas", "🗺️ Rutas"],
};

const ROLES_VENDEDOR_HABILITADOS = ["VENDEDOR", "CAJERO", "ADMIN"];
const VENDEDOR_LOCAL_KEY = "vendedorActivoLocal";

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-[1000] transition-all ${type === "error" ? "bg-rose-600 text-white" : "bg-burnt-500 text-white"
        }`}
    >
      {message}
    </div>
  );
}

function LoginView({ onLogin, onError, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    onError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { username, password });
      setToken(data?.token);
      onLogin(data?.user || null);
    } catch (err) {
      if (!err.response) {
        onError("No se pudo conectar con la API (puerto 4000)");
      } else {
        onError(err.response?.data?.message || "Login invalido");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white grid place-items-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-graphite-950 border border-zinc-800 rounded-2xl p-6 space-y-4"
      >
        <h1 className="text-xl font-black text-burnt-500 uppercase">Distribuidora La Familia</h1>
        <div>
          <label className="text-xs uppercase text-zinc-500 font-bold">Usuario</label>
          <input
            className="input mt-1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs uppercase text-zinc-500 font-bold">Contrasena</label>
          <input
            className="input mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />
        </div>
        {error ? <div className="text-sm text-rose-400">{error}</div> : null}
        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ user, setToast }) {
  const [metrics, setMetrics] = useState({
    totalSales: 0,
    cashAmount: 0,
    totalOrders: 0,
    pendingDeliveries: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [dashboardRes, salesRes] = await Promise.all([
          api.get("/dashboard").catch(() => ({ data: null })),
          api.get("/sales").catch(() => ({ data: [] })),
        ]);

        const dashboard = dashboardRes.data || {};
        const sales = Array.isArray(salesRes.data) ? salesRes.data : [];

        const fallbackTotalSales = sales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
        const fallbackOrders = sales.length;
        const fallbackCash = sales
          .filter((s) => String(s.payment_method || "").toUpperCase() === "EFECTIVO")
          .reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
        const fallbackPending = sales.filter(
          (s) =>
            String(s.sale_type || "").toUpperCase() === "ENVIO" &&
            String(s.delivery_status || "").toUpperCase() !== "ENTREGADO"
        ).length;

        setMetrics({
          totalSales: Number(dashboard.total_sales ?? fallbackTotalSales ?? 0),
          cashAmount: Number(dashboard.cash_amount ?? dashboard.cash_in_box ?? fallbackCash ?? 0),
          totalOrders: Number(dashboard.total_orders ?? fallbackOrders ?? 0),
          pendingDeliveries: Number(dashboard.pending_deliveries ?? fallbackPending ?? 0),
        });
      } catch {
        setToast({ message: "No se pudieron cargar metricas del dashboard", type: "error" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [setToast]);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="text-2xl font-black text-burnt-500 uppercase">Dashboard</div>
        <div className="text-zinc-400 mt-2">Usuario: {user?.fullName || user?.username}</div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-zinc-400 text-sm italic uppercase font-bold tracking-wider">Ventas del dia</div>
          <div className="text-2xl font-black text-emerald-400">
            {loading ? "-" : `$${Number(metrics.totalSales || 0).toLocaleString("es-AR")}`}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-zinc-400 text-sm italic uppercase font-bold tracking-wider">Monto de caja</div>
          <div className="text-2xl font-black text-burnt-500">
            {loading ? "-" : `$${Number(metrics.cashAmount || 0).toLocaleString("es-AR")}`}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-zinc-400 text-sm italic uppercase font-bold tracking-wider">Tickets</div>
          <div className="text-2xl font-black text-sky-400">{loading ? "-" : Number(metrics.totalOrders || 0)}</div>
        </div>
        <div className="card p-4">
          <div className="text-zinc-400 text-sm italic uppercase font-bold tracking-wider">Envios pendientes</div>
          <div className="text-2xl font-black text-yellow-400">
            {loading ? "-" : Number(metrics.pendingDeliveries || 0)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Sales({ user, setToast }) {
  const LISTAS_PRECIO = ["MINORISTA", "MAYORISTA"];
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [listaActiva, setListaActiva] = useState("MINORISTA");
  const [listaClienteOriginal, setListaClienteOriginal] = useState("MINORISTA");
  const [cambioManualLista, setCambioManualLista] = useState(false);
  const [isDelivery, setIsDelivery] = useState(false);

  const [draft, setDraft] = useState({
    customerId: "",
    customerName: "CONSUMIDOR FINAL",
    sellerId: user?.id || "",
    paymentMethod: "EFECTIVO",
    invoiceType: "Factura B",
    items: [],
    shift: "MANIANA",
    paymentCondition: "PAGADO_LOCAL",
    deliveryAddress: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [p, c, u] = await Promise.all([
          api.get("/products"),
          api.get("/customers").catch(() => ({ data: [] })),
          api.get("/users").catch(() => ({ data: [] })),
        ]);
        setProducts((p.data || []).filter((x) => x.is_active !== false));
        setCustomers(c.data || []);
        setUsers(u.data || []);
      } catch {
        setToast({ message: "No se pudieron cargar datos de ventas", type: "error" });
      }
    };
    load();
  }, [setToast]);

  const vendedoresActivos = useMemo(() => {
    return (users || []).filter((u) => {
      const role = String(u.role || "").toUpperCase();
      const isActive = u.is_active !== false;
      return isActive && ROLES_VENDEDOR_HABILITADOS.includes(role);
    });
  }, [users]);

  const persistVendedorActivoLocal = (sellerId) => {
    if (!sellerId) return;
    localStorage.setItem(VENDEDOR_LOCAL_KEY, sellerId);
  };

  const setVendedorActual = (sellerId) => {
    if (!sellerId) return;
    setDraft((prev) => ({ ...prev, sellerId }));
    persistVendedorActivoLocal(sellerId);
  };

  const handleVendedorActualChange = (event) => {
    setVendedorActual(event.target.value);
  };

  useEffect(() => {
    if (!vendedoresActivos.length) return;

    const persistedSellerId = localStorage.getItem(VENDEDOR_LOCAL_KEY);
    const sellerExiste = (id) => vendedoresActivos.some((u) => u.id === id);
    const fallbackSellerId = sellerExiste(user?.id) ? user.id : vendedoresActivos[0].id;
    const initialSellerId = sellerExiste(persistedSellerId) ? persistedSellerId : fallbackSellerId;

    if (!sellerExiste(persistedSellerId)) {
      localStorage.removeItem(VENDEDOR_LOCAL_KEY);
    }

    setDraft((prev) => (prev.sellerId === initialSellerId ? prev : { ...prev, sellerId: initialSellerId }));
    persistVendedorActivoLocal(initialSellerId);
  }, [vendedoresActivos, user?.id]);

  const total = useMemo(
    () => draft.items.reduce((acc, i) => acc + Number(i.qty) * Number(i.unitPrice), 0),
    [draft.items]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .slice(0, 15);
  }, [products, search]);

  const addItem = (product) => {
    setDraft((prev) => {
      const idx = prev.items.findIndex((i) => i.productId === product.id);
      if (idx >= 0) {
        const next = [...prev.items];
        next[idx] = { ...next[idx], qty: Number(next[idx].qty) + Number(qty || 1) };
        return { ...prev, items: next };
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            qty: Number(qty || 1),
            unitPrice: obtenerPrecioPorLista(product, listaActiva),
          },
        ],
      };
    });
    setSearch("");
    setQty(1);
  };

  const removeSelected = () => {
    setDraft((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== selectedIdx) }));
    setSelectedIdx((x) => Math.max(0, x - 1));
  };

  const submit = async (paymentData) => {
    if (!draft.items.length) {
      setToast({ message: "Venta vacia", type: "error" });
      return;
    }

    try {
      const vendedorId = draft.sellerId || localStorage.getItem(VENDEDOR_LOCAL_KEY) || user.id;
      const payload = {
        ...draft,
        sellerId: vendedorId,
        vendedorId,
        customerId: draft.customerId || null,
        ...paymentData,
        items: draft.items.map((i) => ({
          productId: i.productId,
          qty: Number(i.qty),
          unitPrice: Number(i.unitPrice),
        })),
        saleType: isDelivery ? "ENVIO" : "MOSTRADOR",
        shift: isDelivery ? draft.shift : null,
        paymentCondition: isDelivery ? draft.paymentCondition : null,
        deliveryAddress: isDelivery ? draft.deliveryAddress : null,
      };

      const saleResponse = await api.post("/sales", payload);

      try {
        const SafeTicketPrinter = window.TicketPrinterComponent || globalThis?.TicketPrinter;
        if (SafeTicketPrinter && typeof SafeTicketPrinter.printTicket === "function") {
          await SafeTicketPrinter.printTicket({
            ...payload,
            customer_name: draft.customerName,
            sale_number: saleResponse.data?.sale_number || "0000",
            total_amount: total
          });
        }
      } catch (printErr) {
        console.error("Error conectando a impresora:", printErr);
      }

      if (draft.customerId && cambioManualLista && listaActiva !== listaClienteOriginal) {
        const confirmarGuardar = window.confirm(
          `Cambio la lista a ${listaActiva}. Desea guardar esta lista como predeterminada para futuras compras de ${draft.customerName}?`
        );
        if (confirmarGuardar) {
          await actualizarPerfilCliente(draft.customerId, listaActiva);
        }
      }

      setToast({ message: "Venta confirmada", type: "success" });
      setShowPaymentModal(false);
      setDraft((prev) => ({
        ...prev,
        customerId: "",
        customerName: "CONSUMIDOR FINAL",
        items: [],
        deliveryAddress: "",
        paymentCondition: "PAGADO_LOCAL",
      }));
      setListaActiva("MINORISTA");
      setListaClienteOriginal("MINORISTA");
      setCambioManualLista(false);
      setIsDelivery(false);
    } catch (err) {
      setToast({ message: err.response?.data?.message || "Error al guardar", type: "error" });
    }
  };

  useEffect(() => {
    const handleKey = (e) => {
      // Ignorar atajos si el modal de pago está abierto
      if (showPaymentModal) return;

      if (e.key === "Enter") {
        if (document.activeElement.id === "main-search") {
          if (!search) {
            e.preventDefault();
            if (!draft.items.length) {
              setToast({ message: "Venta vacía", type: "error" });
            } else {
              setShowPaymentModal(true);
            }
          } else {
            // Si hay búsqueda con un enter de más, el form intenta hacer un reload
            e.preventDefault();
            if (filteredProducts.length > 0) addItem(filteredProducts[0]);
          }
        } else if (document.activeElement.tagName !== "SELECT" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
          e.preventDefault();
          if (!draft.items.length) {
            setToast({ message: "Venta vacía", type: "error" });
          } else {
            setShowPaymentModal(true);
          }
        }
      }
      if (e.ctrlKey && e.key === "r") { e.preventDefault(); if (draft.items.length > 0) removeSelected(); }
      if (e.key === "ArrowDown") { setSelectedIdx(s => Math.min(s + 1, draft.items.length - 1)); }
      if (e.key === "ArrowUp") { setSelectedIdx(s => Math.max(s - 1, 0)); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [draft, selectedIdx, search, showPaymentModal, setToast, filteredProducts]);

  return (
    <div className="h-full flex flex-col space-y-3">
      <div className="card grid grid-cols-5 gap-4 py-2 bg-graphite-900 border-zinc-800 items-center">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase font-bold">Comprobante</label>
          <input
            className="input bg-transparent border-none text-burnt-500 font-bold p-0 h-auto"
            readOnly
            value={draft.invoiceType}
          />
        </div>
        <div>
          <label className="text-[10px] text-burnt-500 uppercase font-black tracking-wider">
            VENDEDOR ACTUAL
          </label>
          <select
            className="input h-8 py-0 text-sm font-black border-burnt-500/50 focus:border-burnt-500"
            value={draft.sellerId}
            onChange={handleVendedorActualChange}
          >
            {vendedoresActivos.map((u) => (
              <option key={u.id} value={u.id}>
                {String(u.full_name || u.fullName || u.username || "SIN NOMBRE").toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase font-bold">Cliente</label>
          <select
            className="input h-8 py-0 text-sm"
            value={draft.customerId}
            onChange={(e) => {
              const c = customers.find((x) => x.id === e.target.value);
              const listaCliente = normalizarLista(c?.preferred_price_list || c?.preferredPriceList);
              setDraft((prev) => ({
                ...prev,
                customerId: e.target.value,
                customerName: c?.name || "CONSUMIDOR FINAL",
                deliveryAddress: c?.address || "",
              }));
              setListaClienteOriginal(listaCliente);
              setCambioManualLista(false);
              handleCambioLista(listaCliente);
            }}
          >
            <option value="">CONSUMIDOR FINAL</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {String(c.name || "").toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase font-bold">Lista Precio</label>
          <select
            className="input h-8 py-0 text-sm font-bold"
            value={listaActiva}
            onChange={(e) => handleCambioLista(e.target.value)}
          >
            <option value="MINORISTA">MINORISTA</option>
            <option value="MAYORISTA">MAYORISTA</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase font-bold">Fecha</label>
          <div className="text-sm text-zinc-300 font-mono">{new Date().toLocaleDateString()}</div>
        </div>
      </div>

      <div className="card py-2 px-3 bg-graphite-900 border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-[10px] text-zinc-500 uppercase font-bold">Es Envio</label>
          <div
            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${isDelivery ? "bg-burnt-500" : "bg-zinc-700"
              }`}
            onClick={() => setIsDelivery((v) => !v)}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full transition-transform ${isDelivery ? "translate-x-6" : "translate-x-0"
                }`}
            />
          </div>
        </div>
        <div className="w-28">
          <label className="text-[10px] text-zinc-500 uppercase font-bold">Cantidad</label>
          <input
            className="input h-8 py-0 text-sm"
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            min={1}
          />
        </div>
      </div>

      {isDelivery && (
        <div className="card py-2 grid grid-cols-4 gap-4 bg-zinc-900 border-l-4 border-l-burnt-500">
          <div>
            <label className="text-[10px] text-zinc-400 uppercase font-bold">Salida Estimada</label>
            <select
              className="input h-8 py-0 text-sm"
              value={draft.shift}
              onChange={(e) => setDraft((prev) => ({ ...prev, shift: e.target.value }))}
            >
              <option value="MANIANA">MANIANA (11:00)</option>
              <option value="TARDE">TARDE (19:00)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 uppercase font-bold">Condicion de Cobro</label>
            <select
              className="input h-8 py-0 text-sm"
              value={draft.paymentCondition}
              onChange={(e) => setDraft((prev) => ({ ...prev, paymentCondition: e.target.value }))}
            >
              <option value="PAGADO_LOCAL">PAGADO EN LOCAL</option>
              <option value="TRANSFER_PREVIA">TRANSFERENCIA PREVIA</option>
              <option value="COBRAR_EN_ENTREGA">COBRAR EN ENTREGA</option>
              <option value="PAGO_LOCAL_TRANSFERENCIA">PAGO LOCAL TRANSFERENCIA</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-zinc-400 uppercase font-bold">Direccion de Entrega</label>
            <input
              className="input h-8 py-0 text-sm w-full"
              placeholder="Direccion..."
              value={draft.deliveryAddress}
              onChange={(e) => setDraft((prev) => ({ ...prev, deliveryAddress: e.target.value }))}
            />
          </div>
        </div>
      )}

      <div className="card p-3 bg-graphite-900 border-zinc-800">
        <label className="text-[10px] text-zinc-500 uppercase font-bold">Buscar articulo</label>
        <input
          id="main-search"
          className="input mt-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SKU o nombre"
        />
        {search && filteredProducts.length > 0 && (
          <div className="mt-2 max-h-48 overflow-auto border border-zinc-800 rounded-lg">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                className="w-full text-left px-3 py-2 hover:bg-zinc-800 border-b border-zinc-800 last:border-b-0"
                onClick={() => addItem(p)}
              >
                <div className="text-sm font-bold">{p.name}</div>
                <div className="text-xs text-zinc-500">
                  {p.sku || "-"} | ${Number(obtenerPrecioPorLista(p, listaActiva) || 0)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto card p-0">
        <table className="w-full text-sm">
          <thead className="bg-graphite-800 text-zinc-400 uppercase text-[10px] sticky top-0">
            <tr>
              <th className="text-left p-3">Cant</th>
              <th className="text-left p-3">Codigo</th>
              <th className="text-left p-3">Descripcion</th>
              <th className="text-right p-3">Precio</th>
              <th className="text-right p-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {draft.items.map((it, idx) => (
              <tr
                key={`${it.productId}-${idx}`}
                onClick={() => setSelectedIdx(idx)}
                className={`border-t border-zinc-800 cursor-pointer ${selectedIdx === idx ? "bg-burnt-500/20" : "hover:bg-zinc-800/40"
                  }`}
              >
                <td className="p-3">{it.qty}</td>
                <td className="p-3">{it.sku || "-"}</td>
                <td className="p-3 font-bold uppercase">{it.name}</td>
                <td className="p-3 text-right">${Number(it.unitPrice).toFixed(2)}</td>
                <td className="p-3 text-right">${(Number(it.qty) * Number(it.unitPrice)).toFixed(2)}</td>
              </tr>
            ))}
            {!draft.items.length && (
              <tr>
                <td colSpan={5} className="text-center py-16 text-zinc-600 uppercase">
                  Sin articulos en la venta
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-12 gap-4 h-28">
        <div className="col-span-8 card bg-graphite-900 border-zinc-800 flex items-center justify-between px-6">
          <div>
            <div className="text-[10px] uppercase text-zinc-500 font-bold">Cliente</div>
            <div className="text-xl font-black">{draft.customerName}</div>
          </div>
          <button className="btn btn-muted" onClick={removeSelected}>
            Quitar seleccionado
          </button>
        </div>
        <div
          className="col-span-4 card bg-burnt-600 border-none flex flex-col items-center justify-center cursor-pointer hover:bg-burnt-500 transition-colors"
          onClick={() => setShowPaymentModal(true)}
        >
          <span className="text-xs text-white/70 uppercase font-black tracking-widest">Total General</span>
          <span className="text-5xl font-black font-mono text-white">${total.toFixed(2)}</span>
          <span className="text-white font-black uppercase">Cobrar</span>
        </div>
      </div>

      {showPaymentModal && (
        <PaymentModal total={total} onClose={() => setShowPaymentModal(false)} onConfirm={submit} />
      )}
    </div>
  );
}

function Users({ user }) {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({ username: "", password: "", role: "VENDEDOR", fullName: "" });

  const load = async () => {
    try {
      const { data } = await api.get("/users");
      setRows(data || []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (user.role !== "ADMIN") return <div className="card">Solo ADMIN</div>;

  return (
    <div className="space-y-3">
      <form
        className="card grid md:grid-cols-5 gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.post("/users", draft);
          setDraft({ username: "", password: "", role: "VENDEDOR", fullName: "" });
          load();
        }}
      >
        <input
          className="input"
          placeholder="Usuario"
          value={draft.username}
          onChange={(e) => setDraft({ ...draft, username: e.target.value })}
        />
        <input
          className="input"
          placeholder="Contrasena"
          type="password"
          value={draft.password}
          onChange={(e) => setDraft({ ...draft, password: e.target.value })}
        />
        <input
          className="input"
          placeholder="Nombre completo"
          value={draft.fullName}
          onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
        />
        <select className="input" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
          <option>ADMIN</option>
          <option>CAJERO</option>
          <option>VENDEDOR</option>
          <option>REPARTIDOR</option>
        </select>
        <button className="btn btn-primary">Crear</button>
      </form>

      <div className="card overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-400">
            <tr>
              <th className="text-left py-2">Usuario</th>
              <th className="text-left py-2">Nombre</th>
              <th className="text-left py-2">Rol</th>
              <th className="text-left py-2">Activo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-zinc-800">
                <td className="py-2">{u.username}</td>
                <td className="py-2">{u.full_name}</td>
                <td className="py-2">{u.role}</td>
                <td className="py-2">{u.is_active ? "Si" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!hydrateToken()) return;
    api
      .get("/auth/me")
      .then((r) => setUser(r.data.user))
      .catch(() => setToken(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    const role = String(user?.role || "").toUpperCase();
    if (role === "REPARTIDOR") return;
    const allowedTabs = ROLE_TABS[role] || [];
    if (activeTab !== "Dashboard" && !allowedTabs.includes(activeTab)) {
      setActiveTab("Dashboard");
    }
  }, [user, activeTab]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const role = String(user?.role || "").toUpperCase();
      const allowedTabs = ROLE_TABS[role] || [];
      const allowedShortcuts = Object.fromEntries(
        Object.entries(SHORTCUTS).filter(([, tab]) => allowedTabs.includes(tab))
      );

      // Global Escape listener to return Home
      if (e.key === "Escape" && activeTab !== "Dashboard") {
        e.preventDefault();
        setActiveTab("Dashboard");
        return;
      }

      // If we are NOT in the Dashboard, do not process global shortcuts
      // to avoid colliding with internal components logic
      if (activeTab !== "Dashboard") return;

      if (allowedShortcuts[e.key]) {
        e.preventDefault();
        setActiveTab(allowedShortcuts[e.key]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, user]);

  if (!user) return <LoginView onLogin={setUser} onError={setError} error={error} />;
  const role = String(user?.role || "").toUpperCase();
  const allowedTabs = ROLE_TABS[role] || [];

  if (role === "REPARTIDOR") {
    return (
      <DriverApp
        onLogout={() => {
          setToken(null);
          setUser(null);
        }}
      />
    );
  }

  // HOME SCREEN (Menu Grid)
  const renderHomeNav = () => (
    <div className="flex flex-col items-center justify-center min-h-screen relative w-full p-8 text-center animate-in fade-in zoom-in-95 duration-500">
      {/* Background Decorator */}
      <h1 className="fixed select-none md:top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45vh] md:-translate-y-1/2 text-[10vw] md:text-[8vw] z-0 font-black tracking-tighter opacity-5 uppercase text-[#e85d04]/10 leading-none whitespace-nowrap pointer-events-none">
        LA FAMILIA
      </h1>

      <div className="z-10 bg-[#121212]/90 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-10 md:p-16 shadow-[0_0_80px_rgba(232,93,4,0.05)] max-w-5xl w-full">
        <h2 className="text-[#e85d04] text-4xl md:text-5xl font-black tracking-tight mb-2">DISTRIBUIDORA LA FAMILIA</h2>
        <div className="text-zinc-400 font-mono tracking-widest text-sm uppercase mb-12">
          {user.fullName || user.username} // {user.role}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-none md:grid-flow-col md:grid-rows-4 lg:grid-rows-3 gap-4 text-left">
          {allowedTabs.map((tab) => {
            const shortcut = Object.entries(SHORTCUTS).find(([, v]) => v === tab)?.[0];

            // Assigning distinct colors based on the tab name to improve contrast and recognizability
            let colorClass = "group-hover:text-[#e85d04]";
            let borderClass = "hover:border-[#e85d04]/50";
            let shadowClass = "hover:shadow-[0_10px_40px_rgba(232,93,4,0.1)]";
            let gradientClass = "from-[#e85d04]/10";

            if (tab.includes("Productos") || tab.includes("Inventario")) {
              colorClass = "group-hover:text-emerald-500";
              borderClass = "hover:border-emerald-500/50";
              shadowClass = "hover:shadow-[0_10px_40px_rgba(16,185,129,0.1)]";
              gradientClass = "from-emerald-500/10";
            } else if (tab.includes("Clientes") || tab.includes("Proveedores") || tab.includes("Usuarios")) {
              colorClass = "group-hover:text-blue-500";
              borderClass = "hover:border-blue-500/50";
              shadowClass = "hover:shadow-[0_10px_40px_rgba(59,130,246,0.1)]";
              gradientClass = "from-blue-500/10";
            } else if (tab.includes("Ventas") || tab.includes("Compras")) {
              colorClass = "group-hover:text-amber-500";
              borderClass = "hover:border-amber-500/50";
              shadowClass = "hover:shadow-[0_10px_40px_rgba(245,158,11,0.1)]";
              gradientClass = "from-amber-500/10";
            } else if (tab.includes("Reparto")) {
              colorClass = "group-hover:text-purple-500";
              borderClass = "hover:border-purple-500/50";
              shadowClass = "hover:shadow-[0_10px_40px_rgba(168,85,247,0.1)]";
              gradientClass = "from-purple-500/10";
            } else if (tab.includes("Rutas")) {
              colorClass = "group-hover:text-cyan-500";
              borderClass = "hover:border-cyan-500/50";
              shadowClass = "hover:shadow-[0_10px_40px_rgba(6,182,212,0.1)]";
              gradientClass = "from-cyan-500/10";
            } else if (tab.includes("Auditoria")) {
              colorClass = "group-hover:text-rose-500";
              borderClass = "hover:border-rose-500/50";
              shadowClass = "hover:shadow-[0_10px_40px_rgba(244,63,94,0.1)]";
              gradientClass = "from-rose-500/10";
            }

            return (
              <button
                key={tab}
                className={`group relative overflow-hidden bg-[#1a1a1a] border border-zinc-800/80 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 ${borderClass} ${shadowClass}`}
                onClick={() => setActiveTab(tab)}
              >
                <div className={`text-lg font-bold text-white transition-colors ${colorClass}`}>{tab}</div>
                {shortcut ? (
                  <div className="text-xs text-zinc-500 mt-2 font-mono uppercase font-bold tracking-widest flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-[10px] shadow-sm">{shortcut}</kbd>
                  </div>
                ) : (
                  <div className="h-6 mt-2"></div>
                )}
                <div className={`absolute inset-0 bg-gradient-to-br ${gradientClass} to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />
              </button>
            );
          })}
        </div>
      </div>

      <button
        className="fixed bottom-8 px-6 py-3 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-full text-sm font-bold tracking-widest uppercase transition-colors z-20 shadow-lg"
        onClick={() => {
          api.post("/auth/logout").finally(() => {
            setToken(null);
            setUser(null);
          });
        }}
      >
        Cerrar Sesión
      </button>
    </div>
  );

  return (
    <div className="h-screen flex bg-zinc-950 text-white font-sans overflow-hidden">
      {/* 
        If activeTab === "Dashboard", it covers 100% of the screen showing Home Menu
        Else, we show a full-screen dynamic window for the module
      */}
      {activeTab === "Dashboard" ? (
        renderHomeNav()
      ) : (
        <main className="flex-1 h-screen flex flex-col relative animate-in fade-in slide-in-from-bottom-4 duration-300">

          {/* Header Bar Floating to indicate return mechanics */}
          <div className="absolute top-4 left-4 z-50 flex gap-2">
            <button
              onClick={() => setActiveTab("Dashboard")}
              className="bg-[#121212] border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-xl flex items-center gap-2"
            >
              <span>VOLVER AL INICIO</span>
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] font-mono font-normal">ESC</kbd>
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4 md:p-6 pb-6">
            {activeTab === "Dashboard" && <Dashboard user={user} setToast={setToast} />}
            {activeTab === "📦 Productos" && <Productos user={user} setToast={setToast} />}
            {activeTab === "👥 Clientes" && <Clientes setToast={setToast} />}
            {activeTab === "🛒 Compras" && <Compras setToast={setToast} />}
            {activeTab === "🚚 Proveedores" && <Proveedores user={user} setToast={setToast} />}
            {activeTab === "🏷️ Ventas" && <Ventas user={user} setToast={setToast} />}
            {activeTab === "📝 ConsultarVentas" && <ConsultarVentas />}
            {activeTab === "🛵 Reparto" &&
              (String(user?.role || "").toUpperCase() === "REPARTIDOR" ? (
                <DriverApp onLogout={() => { setToken(null); setUser(null); }} />
              ) : (
                <AdminTrackingMap user={user} />
              ))}
            {activeTab === "📊 Consolidado" && <Consolidado user={user} setToast={setToast} />}
            {activeTab === "🧭 Configuracion" && <Configuracion user={user} setToast={setToast} />}
            {activeTab === "🗺️ Rutas" && <Rutas setToast={setToast} />}
            {activeTab === "🏢 Inventario" && <Inventario setToast={setToast} />}
            {activeTab === "⚙️ Usuarios" && <Usuarios user={user} setToast={setToast} />}
            {activeTab === "🔍 Auditoria" && <Auditoria user={user} setToast={setToast} />}
          </div>
        </main>
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

