import { useEffect, useState } from "react";
import api from "../api";
import ImportExportModal from "./ImportExportModal";

export default function Proveedores({ user, setToast }) {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [showImportExport, setShowImportExport] = useState(false);
    const canImportExport = String(user?.role || "").toUpperCase() === "ADMIN";

    const fetchSuppliers = async () => {
        setLoading(true);
        try {
            const res = await api.get("/suppliers");
            setSuppliers(Array.isArray(res.data) ? res.data : []);
        } catch {
            setToast?.({ message: "No se pudieron cargar los proveedores", type: "error" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const openNew = () => {
        setEditingSupplier(null);
        setShowModal(true);
    };

    const openEdit = (supplier) => {
        setEditingSupplier(supplier);
        setShowModal(true);
    };

    return (
        <div className="h-full flex flex-col space-y-4 text-white">
            {/* Header */}
            <div className="px-1 flex justify-between items-end border-b border-zinc-800/80 pb-4">
                <div>
                    <h1 className="text-3xl font-bold leading-none text-white tracking-tight">Proveedores</h1>
                    <p className="text-xs text-zinc-400 mt-1">Gestión del padrón de proveedores</p>
                </div>
                <div className="flex gap-2">
                    {canImportExport ? (
                        <button
                            onClick={() => setShowImportExport(true)}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Importar / Exportar
                        </button>
                    ) : null}
                    <button
                        onClick={openNew}
                        className="bg-[#e85d04] hover:bg-[#d14f00] text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
                    >
                        <span>Nuevo Proveedor</span>
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="bg-[#121212] border border-zinc-800/80 rounded-lg flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-auto p-2">
                    <table className="w-full text-xs text-left">
                        <thead className="text-[10px] uppercase text-zinc-500 tracking-widest border-b border-zinc-800/50 sticky top-0 bg-[#121212] z-10">
                            <tr>
                                <th className="px-5 py-4 font-black">Código</th>
                                <th className="px-5 py-4 font-black w-1/3">Razón Social</th>
                                <th className="px-5 py-4 font-black">Contacto</th>
                                <th className="px-5 py-4 font-black">Teléfono / Celular</th>
                                <th className="px-5 py-4 font-black">CUIT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-zinc-600">
                                        Cargando proveedores...
                                    </td>
                                </tr>
                            ) : suppliers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-zinc-600">
                                        No hay proveedores registrados.
                                    </td>
                                </tr>
                            ) : (
                                suppliers.map((s) => (
                                    <tr
                                        key={s.id}
                                        className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors cursor-pointer"
                                        onClick={() => openEdit(s)}
                                    >
                                        <td className="px-5 py-4 font-mono font-bold text-zinc-300">{s.code || s.id}</td>
                                        <td className="px-5 py-4 font-semibold text-white uppercase">{s.businessName || s.name}</td>
                                        <td className="px-5 py-4 text-zinc-400">{s.contactName || "-"}</td>
                                        <td className="px-5 py-4 text-zinc-400">{s.phone || s.mobile || "-"}</td>
                                        <td className="px-5 py-4 text-zinc-400">{s.taxId || "-"}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <SupplierModal
                    supplier={editingSupplier}
                    onClose={() => setShowModal(false)}
                    onSaved={() => {
                        setShowModal(false);
                        fetchSuppliers();
                    }}
                    setToast={setToast}
                />
            )}

            {showImportExport && (
                <ImportExportModal
                    entity="suppliers"
                    entityLabel="Proveedores"
                    onClose={() => setShowImportExport(false)}
                    onSuccess={fetchSuppliers}
                />
            )}
        </div>
    );
}

function SupplierModal({ supplier, onClose, onSaved, setToast }) {
    const [tab, setTab] = useState("DATOS");
    const [loading, setLoading] = useState(false);

    const [form, setForm] = useState({
        code: supplier?.code || "",
        contactName: supplier?.contactName || "",
        businessName: supplier?.businessName || supplier?.name || "",
        address: supplier?.address || "",
        postalCode: supplier?.postalCode || "",
        city: supplier?.city || "",
        state: supplier?.state || "",
        country: supplier?.country || "Argentina",
        phone: supplier?.phone || "",
        mobile: supplier?.mobile || "",
        fax: supplier?.fax || "",
        taxId: supplier?.taxId || "",
        taxCondition: supplier?.taxCondition || "Resp. Inscripto",
        email: supplier?.email || "",
        website: supplier?.website || "",
        observations: supplier?.observations || ""
    });

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                ...form,
                name: form.businessName // mapping for legacy endpoints
            };

            if (supplier?.id) {
                await api.put(`/suppliers/${supplier.id}`, payload);
                setToast?.({ message: "Proveedor actualizado con éxito", type: "success" });
            } else {
                await api.post("/suppliers", payload);
                setToast?.({ message: "Proveedor creado con éxito", type: "success" });
            }
            onSaved();
        } catch (err) {
            setToast?.({ message: err.response?.data?.message || "Error al guardar proveedor", type: "error" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#121212] border border-zinc-800/80 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="bg-[#1a1a1a] px-6 py-4 border-b border-zinc-800/80 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white tracking-tight">
                        {supplier ? "Editar Proveedor" : "Nuevo Proveedor"}
                    </h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-zinc-800/80 bg-[#151515]">
                    <button
                        className={`flex-1 py-3 text-xs font-black tracking-widest uppercase transition-all ${tab === "DATOS" ? "bg-[#121212] text-[#e85d04] border-t-2 border-[#e85d04]" : "text-zinc-500 hover:text-zinc-300 border-t-2 border-transparent"}`}
                        onClick={() => setTab("DATOS")}
                    >
                        Datos Relevantes
                    </button>
                    <button
                        className={`flex-1 py-3 text-xs font-black tracking-widest uppercase transition-all ${tab === "OBS" ? "bg-[#121212] text-[#e85d04] border-t-2 border-[#e85d04]" : "text-zinc-500 hover:text-zinc-300 border-t-2 border-transparent"}`}
                        onClick={() => setTab("OBS")}
                    >
                        Observaciones
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={submit} className="flex-1 overflow-y-auto p-6">
                    {tab === "DATOS" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Código</label>
                                <input name="code" value={form.code} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none font-mono" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Contacto</label>
                                <input name="contactName" value={form.contactName} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4 md:col-span-2">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right text-[#e85d04]">R. Social *</label>
                                <input name="businessName" value={form.businessName} onChange={handleChange} required className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white font-bold uppercase focus:border-[#e85d04] outline-none" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Dirección</label>
                                <input name="address" value={form.address} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">C.P.</label>
                                <input name="postalCode" value={form.postalCode} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none w-1/2" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Localidad</label>
                                <input name="city" value={form.city} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Provincia</label>
                                <input name="state" value={form.state} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">País</label>
                                <input name="country" value={form.country} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-300 focus:border-[#e85d04] outline-none" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Celular</label>
                                <input name="mobile" value={form.mobile} onChange={handleChange} type="tel" className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Teléfono</label>
                                <input name="phone" value={form.phone} onChange={handleChange} type="tel" className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Fax</label>
                                <input name="fax" value={form.fax} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4 border-t border-zinc-800/80 pt-5 mt-2">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Nº CUIT</label>
                                <input name="taxId" value={form.taxId} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white font-mono focus:border-[#e85d04] outline-none" placeholder="XX-XXXXXXXX-X" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4 border-t border-zinc-800/80 pt-5 mt-2">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Cond. IVA</label>
                                <select name="taxCondition" value={form.taxCondition} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none">
                                    <option value="Resp. Inscripto">Resp. Inscripto</option>
                                    <option value="Monotributo">Monotributo</option>
                                    <option value="Exento">Exento</option>
                                    <option value="Consumidor Final">Consumidor Final</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Mail</label>
                                <input name="email" type="email" value={form.email} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-[#e85d04] outline-none" />
                            </div>

                            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider text-right">Web</label>
                                <input name="website" type="url" value={form.website} onChange={handleChange} className="bg-[#1a1a1a] border border-zinc-800 rounded px-3 py-2 text-sm text-[#4dabe3] focus:border-[#e85d04] outline-none" placeholder="https://" />
                            </div>

                        </div>
                    ) : (
                        <div className="h-[300px] flex flex-col gap-2">
                            <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Anotaciones y Observaciones</label>
                            <textarea
                                name="observations"
                                value={form.observations}
                                onChange={handleChange}
                                className="w-full flex-1 bg-[#1a1a1a] border border-zinc-800 rounded-lg p-4 text-sm text-white focus:border-[#e85d04] outline-none resize-none"
                                placeholder="Detalles adicionales sobre este proveedor..."
                            />
                        </div>
                    )}

                    {/* Footer actions inside form to trigger submit */}
                    <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-zinc-800/80">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-[#e85d04] hover:bg-[#d14f00] text-white px-8 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-colors flex items-center justify-center gap-2 min-w-[120px]"
                        >
                            {loading ? "Guardando..." : "Guardar"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
