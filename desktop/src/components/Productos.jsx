import { useEffect, useMemo, useState } from "react";
import api from "../api";
import ImportExportModal from "./ImportExportModal";

const DEFAULT_UNIT_OPTIONS = ["Caja", "Cajon", "Pack", "Fardo", "Unidad"];
const UNIT_OPTIONS_KEY = "lf_product_unit_options";

export default function Productos({ user, setToast }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [unitOptions, setUnitOptions] = useState(DEFAULT_UNIT_OPTIONS);
  const [newUnitName, setNewUnitName] = useState("");
  const canImportExport = String(user?.role || "").toUpperCase() === "ADMIN";

  const [form, setForm] = useState({
    name: "",
    sku: "",
    categoryId: "",
    brandId: "",
    rubroId: "",
    cost: "",
    margin: "30",
    iva: "21",
    priceMinorista: "0",
    priceMayorista: "0",
    unitLabel: "Caja",
    hasReturnable: false,
    returnableUnitsPerItem: "0",
  });

  const calculatedPrice = useMemo(() => {
    const cost = Number(form.cost || 0);
    const margin = Number(form.margin || 0);
    const iva = Number(form.iva || 0);
    const net = cost * (1 + margin / 100);
    return net * (1 + iva / 100);
  }, [form.cost, form.margin, form.iva]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      priceMinorista: Number.isFinite(calculatedPrice) ? calculatedPrice.toFixed(2) : "0",
    }));
  }, [calculatedPrice]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UNIT_OPTIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        const next = Array.from(new Set(parsed.map((v) => String(v || "").trim()).filter(Boolean)));
        if (next.length) setUnitOptions(next);
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(UNIT_OPTIONS_KEY, JSON.stringify(unitOptions));
  }, [unitOptions]);

  useEffect(() => {
    const load = async () => {
      try {
        const [p, c, b, r] = await Promise.all([
          api.get("/products").catch(() => ({ data: [] })),
          api.get("/categories").catch(() => ({ data: [] })),
          api.get("/brands").catch(() => ({ data: [] })),
          api.get("/rubros").catch(() => ({ data: [] })),
        ]);
        setProducts(p.data || []);
        setCategories(c.data || []);
        setBrands(b.data || []);
        setRubros(r.data || []);
      } catch {
        setToast?.({ message: "No se pudieron cargar productos", type: "error" });
      }
    };
    load();
  }, [setToast]);

  const addCustomUnit = () => {
    const cleaned = String(newUnitName || "").trim();
    if (!cleaned) return;
    const exists = unitOptions.some((x) => x.toUpperCase() === cleaned.toUpperCase());
    if (!exists) {
      setUnitOptions((prev) => [...prev, cleaned]);
    }
    setForm((prev) => ({ ...prev, unitLabel: cleaned }));
    setNewUnitName("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setToast?.({ message: "Nombre requerido", type: "error" });
      return;
    }
    setSaving(true);
    try {
      await api.post("/products", {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        categoryId: form.categoryId || null,
        brandId: form.brandId || null,
        rubroId: form.rubroId || null,
        packSize: 1,
        unitLabel: (form.unitLabel || "Unidad").trim(),
        hasReturnable: Boolean(form.hasReturnable),
        returnableUnitsPerItem: Number(form.hasReturnable ? form.returnableUnitsPerItem || 0 : 0),
        cost: Number(form.cost || 0),
        profitMargin: Number(form.margin || 0),
        iva: Number(form.iva || 21),
        priceMinorista: Number(form.priceMinorista || 0),
        priceMayorista: Number(form.priceMayorista || form.priceMinorista || 0),
        minStock: 0,
        isActive: true,
      });
      setToast?.({ message: "Producto creado", type: "success" });
      setForm({
        name: "",
        sku: "",
        categoryId: "",
        brandId: "",
        rubroId: "",
        cost: "",
        margin: "30",
        iva: "21",
        priceMinorista: "0",
        priceMayorista: "0",
        unitLabel: "Caja",
        hasReturnable: false,
        returnableUnitsPerItem: "0",
      });
      const { data } = await api.get("/products");
      setProducts(data || []);
      setShowNewProduct(false);
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "Error al crear producto",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
  }, [products, search]);

  return (
    <div className="space-y-4">
      <div className="card p-4 rounded-lg bg-zinc-900 border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-[#e85d04] uppercase">Productos</h2>
          <div className="flex gap-2">
            {canImportExport ? (
              <button
                type="button"
                className="btn bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg flex items-center gap-2"
                onClick={() => setShowImportExport(true)}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Importar / Exportar
              </button>
            ) : null}
            <button
              type="button"
              className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg"
              onClick={() => setShowNewProduct(true)}
            >
              Nuevo producto
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4 rounded-lg bg-zinc-900 border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-black text-[#e85d04] uppercase">Listado</h2>
          <input
            className="input w-64"
            placeholder="Buscar por nombre o SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-zinc-400 uppercase text-[10px]">
              <tr>
                <th className="text-left py-2">SKU</th>
                <th className="text-left py-2">Nombre</th>
                <th className="text-left py-2">Marca</th>
                <th className="text-left py-2">Categoria</th>
                <th className="text-left py-2">Rubro</th>
                <th className="text-left py-2">Unidad</th>
                <th className="text-right py-2">Envases x Unidad</th>
                <th className="text-right py-2">Costo</th>
                <th className="text-right py-2">Minorista</th>
                <th className="text-right py-2">Mayorista</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-zinc-800">
                  <td className="py-2">{p.sku || "-"}</td>
                  <td className="py-2 font-bold">{p.name}</td>
                  <td className="py-2">{p.brand_name || p.brandName || "-"}</td>
                  <td className="py-2">{p.category_name || p.categoryName || "-"}</td>
                  <td className="py-2">{p.rubro_name || p.rubroName || "-"}</td>
                  <td className="py-2">{p.unit_label || p.unitLabel || "Unidad"}</td>
                  <td className="py-2 text-right">
                    {Number(p.has_returnable || p.hasReturnable) ? Number(p.returnable_units_per_item || p.returnableUnitsPerItem || 0) : "-"}
                  </td>
                  <td className="py-2 text-right">${Number(p.cost || 0).toFixed(2)}</td>
                  <td className="py-2 text-right">${Number(p.price_minorista || p.priceMinorista || 0).toFixed(2)}</td>
                  <td className="py-2 text-right">${Number(p.price_mayorista || p.priceMayorista || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNewProduct && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewProduct(false);
          }}
        >
          <div className="w-full max-w-6xl card p-4 rounded-xl bg-zinc-900 border-zinc-800 max-h-[92vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-[#e85d04] uppercase">Nuevo producto</h3>
              <button
                type="button"
                className="btn btn-muted rounded-lg"
                onClick={() => setShowNewProduct(false)}
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={submit} className="grid md:grid-cols-5 gap-3">
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-bold text-zinc-500">Nombre</label>
                <input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">SKU</label>
                <input className="input mt-1" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Categoria</label>
                <select className="input mt-1" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Sin categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Marca</label>
                <select className="input mt-1" value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                  <option value="">Sin marca</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Rubro</label>
                <select className="input mt-1" value={form.rubroId} onChange={(e) => setForm({ ...form, rubroId: e.target.value })}>
                  <option value="">Sin rubro</option>
                  {rubros.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Precio Costo</label>
                <input className="input mt-1" type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">% Ganancia</label>
                <input className="input mt-1" type="number" value={form.margin} onChange={(e) => setForm({ ...form, margin: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">IVA</label>
                <select className="input mt-1" value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value })}>
                  <option value="10.5">10.5%</option>
                  <option value="21">21%</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Precio Venta (auto)</label>
                <input className="input mt-1 font-bold text-[#e85d04]" value={form.priceMinorista} readOnly />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Precio Mayorista</label>
                <input
                  className="input mt-1"
                  type="number"
                  value={form.priceMayorista}
                  onChange={(e) => setForm({ ...form, priceMayorista: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Unidad de Medida</label>
                <select
                  className="input mt-1"
                  value={form.unitLabel}
                  onChange={(e) => setForm({ ...form, unitLabel: e.target.value })}
                >
                  {unitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Agregar otra unidad</label>
                <div className="mt-1 flex gap-2">
                  <input
                    className="input"
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    placeholder="Ej: Bidon"
                  />
                  <button type="button" className="btn btn-muted" onClick={addCustomUnit}>
                    Agregar
                  </button>
                </div>
              </div>
              <div className="md:col-span-2 flex items-center gap-2 pt-6">
                <input
                  id="hasReturnable"
                  type="checkbox"
                  className="h-4 w-4 accent-[#e85d04]"
                  checked={Boolean(form.hasReturnable)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      hasReturnable: e.target.checked,
                      returnableUnitsPerItem: e.target.checked ? prev.returnableUnitsPerItem || "1" : "0",
                    }))
                  }
                />
                <label htmlFor="hasReturnable" className="text-xs font-bold uppercase text-zinc-400">
                  Tiene envases retornables
                </label>
              </div>
              {form.hasReturnable ? (
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Envases por producto</label>
                  <input
                    className="input mt-1"
                    type="number"
                    min="1"
                    step="1"
                    value={form.returnableUnitsPerItem}
                    onChange={(e) => setForm({ ...form, returnableUnitsPerItem: e.target.value })}
                  />
                </div>
              ) : null}

              <div className="md:col-span-5 flex justify-end">
                <button className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportExport && (
        <ImportExportModal
          entity="products"
          entityLabel="Productos"
          onClose={() => setShowImportExport(false)}
          onSuccess={async () => {
            const [p, c, b, r] = await Promise.all([
              api.get("/products").catch(() => ({ data: [] })),
              api.get("/categories").catch(() => ({ data: [] })),
              api.get("/brands").catch(() => ({ data: [] })),
              api.get("/rubros").catch(() => ({ data: [] })),
            ]);
            setProducts(p.data || []);
            setCategories(c.data || []);
            setBrands(b.data || []);
            setRubros(r.data || []);
          }}
        />
      )}
    </div>
  );
}
