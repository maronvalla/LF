import React, { useState, useEffect } from 'react';
import api from "../api";

// Tipos base para TypeScript (aunque puede usarse como JS)
interface Venta {
    id: string;
    fecha: string;
    cliente: string;
    vendedor: string;
    total: number;
    metodoPago: 'EFECTIVO' | 'TRANSFERENCIA' | 'MIXTO';
    estado: 'COMPLETADO' | 'ANULADO' | 'PENDIENTE';
    comprobanteUrl?: string;
}

export default function ConsultarVentas() {
    const [ventas, setVentas] = useState<Venta[]>([]);
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [vendedorFilter, setVendedorFilter] = useState('');
    const [clienteFilter, setClienteFilter] = useState('');

    const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
    const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState("");

    useEffect(() => {
        fetchVentas();

        // Escuchar ESC para cerrar el modal de comprobantes
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedReceipt) {
                setSelectedReceipt(null);
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [selectedReceipt]);

    const fetchVentas = async () => {
        // TODO: Conectar a API real. Por ahora dejamos datos mockeados.
        const mockData: Venta[] = [
            {
                id: 'V-1001',
                fecha: '2026-02-20T10:30:00',
                cliente: 'CONSUMIDOR FINAL',
                vendedor: 'exequiel',
                total: 15000,
                metodoPago: 'EFECTIVO',
                estado: 'COMPLETADO'
            },
            {
                id: 'V-1002',
                fecha: '2026-02-20T11:15:00',
                cliente: 'MAXIKIOSCO EL SOL',
                vendedor: 'chofer_1',
                total: 45500,
                metodoPago: 'TRANSFERENCIA',
                estado: 'COMPLETADO',
                comprobanteUrl: 'https://via.placeholder.com/400x600.png?text=Comprobante+Mock'
            },
            {
                id: 'V-1003',
                fecha: '2026-02-20T14:20:00',
                cliente: 'ALMACEN DON PEPE',
                vendedor: 'exequiel',
                total: 8900,
                metodoPago: 'MIXTO',
                estado: 'PENDIENTE',
                comprobanteUrl: 'https://via.placeholder.com/400x600.png?text=Ticket+Mixto'
            }
        ];
        setVentas(mockData);
    };

    const handleAnular = (id: string) => {
        setCancelTargetId(id);
        setCancelReason("");
    };

    const confirmAnular = async () => {
        if (!cancelTargetId) return;
        const reason = String(cancelReason || "").trim();
        if (reason.length < 3) return;

        try {
            if (cancelTargetId.startsWith("V-")) {
                setVentas((prev) => prev.map(v => v.id === cancelTargetId ? { ...v, estado: "ANULADO" } : v));
            } else {
                await api.post(`/sales/${cancelTargetId}/anular`, { reason });
                setVentas((prev) => prev.map(v => v.id === cancelTargetId ? { ...v, estado: "ANULADO" } : v));
            }
            setCancelTargetId(null);
            setCancelReason("");
        } catch {
            // noop en vista mock
        }
    };

    const filteredVentas = ventas.filter(v => {
        if (vendedorFilter && v.vendedor !== vendedorFilter) return false;
        if (clienteFilter && !v.cliente.toLowerCase().includes(clienteFilter.toLowerCase())) return false;
        if (fechaDesde && v.fecha < fechaDesde) return false;
        if (fechaHasta && v.fecha > fechaHasta + 'T23:59:59') return false;
        return true;
    });

    return (
        <div className="h-full flex flex-col space-y-4 text-white animate-in fade-in duration-300">
            {/* HEADER / FILTROS */}
            <div className="card bg-graphite-900 border-zinc-800 p-4 shrink-0 shadow-lg">
                <h2 className="text-xl font-black text-burnt-500 uppercase mb-4 tracking-widest">
                    Auditoría de Ventas
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 block">Desde</label>
                        <input
                            type="date"
                            className="w-full bg-zinc-950 border-2 border-zinc-800 px-3 py-2 text-sm font-bold outline-none focus:border-burnt-500 rounded-lg text-zinc-300 transition-colors"
                            value={fechaDesde}
                            onChange={e => setFechaDesde(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 block">Hasta</label>
                        <input
                            type="date"
                            className="w-full bg-zinc-950 border-2 border-zinc-800 px-3 py-2 text-sm font-bold outline-none focus:border-burnt-500 rounded-lg text-zinc-300 transition-colors"
                            value={fechaHasta}
                            onChange={e => setFechaHasta(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 block">Vendedor / Chofer</label>
                        <select
                            className="w-full bg-zinc-950 border-2 border-zinc-800 px-3 py-2 text-sm font-bold outline-none focus:border-burnt-500 rounded-lg text-zinc-300 transition-colors uppercase"
                            value={vendedorFilter}
                            onChange={e => setVendedorFilter(e.target.value)}
                        >
                            <option value="">TODOS</option>
                            {/* Aquí se cargarían los usuarios de la base de datos */}
                            <option value="exequiel">EXEQUIEL</option>
                            <option value="chofer_1">CHOFER 1</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 block">Buscar Cliente</label>
                        <input
                            type="text"
                            placeholder="Razón Social..."
                            className="w-full bg-zinc-950 border-2 border-zinc-800 px-3 py-2 text-sm font-bold outline-none focus:border-burnt-500 rounded-lg text-zinc-300 transition-colors uppercase placeholder:text-zinc-600 focus:placeholder:text-zinc-500/50"
                            value={clienteFilter}
                            onChange={e => setClienteFilter(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* TABLA DE DATOS */}
            <div className="flex-1 overflow-hidden bg-graphite-900 border border-zinc-800 rounded-xl flex flex-col shadow-2xl">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-sm border-collapse min-w-[800px]">
                        <thead className="bg-zinc-950 text-[10px] text-zinc-500 uppercase sticky top-0 font-black z-10 shadow-sm border-b border-zinc-800">
                            <tr>
                                <th className="p-4 text-left border-r border-zinc-800 w-28 tracking-widest">Nro Venta</th>
                                <th className="p-4 text-left border-r border-zinc-800 w-36">Fecha / Hora</th>
                                <th className="p-4 text-left border-r border-zinc-800">Cliente</th>
                                <th className="p-4 text-left border-r border-zinc-800 w-32">Vendedor</th>
                                <th className="p-4 text-right border-r border-zinc-800 w-32">Monto Total</th>
                                <th className="p-4 text-center border-r border-zinc-800 w-36">Método Pago</th>
                                <th className="p-4 text-center border-r border-zinc-800 w-32">Estado</th>
                                <th className="p-4 text-center w-28">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVentas.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-zinc-600 font-bold uppercase tracking-widest">
                                        Ninguna venta encontrada para estos filtros
                                    </td>
                                </tr>
                            ) : (
                                filteredVentas.map((venta, idx) => (
                                    <tr key={venta.id} className={`border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors ${idx % 2 === 0 ? 'bg-black/20' : ''}`}>
                                        <td className="p-4 font-mono text-zinc-500 text-xs font-bold border-r border-zinc-800">
                                            #{venta.id.replace('V-', '')}
                                        </td>
                                        <td className="p-4 text-xs font-mono text-zinc-400 border-r border-zinc-800">
                                            {new Date(venta.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                                        </td>
                                        <td className="p-4 font-bold uppercase truncate max-w-[200px] border-r border-zinc-800">
                                            {venta.cliente}
                                        </td>
                                        <td className="p-4 uppercase text-xs text-zinc-400 font-bold border-r border-zinc-800">
                                            {venta.vendedor}
                                        </td>
                                        <td className="p-4 text-right font-black text-emerald-400 border-r border-zinc-800 text-base">
                                            ${venta.total.toLocaleString('es-AR')}
                                        </td>
                                        <td className="p-4 text-center border-r border-zinc-800">
                                            <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${venta.metodoPago === 'EFECTIVO' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' :
                                                    venta.metodoPago === 'TRANSFERENCIA' ? 'bg-sky-500/10 text-sky-500 border-sky-500/20 shadow-[0_0_10px_rgba(14,165,233,0.1)]' :
                                                        'bg-purple-500/10 text-purple-500 border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                                                }`}>
                                                {venta.metodoPago}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center border-r border-zinc-800">
                                            <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${venta.estado === 'COMPLETADO' ? 'text-zinc-500' :
                                                    venta.estado === 'ANULADO' ? 'bg-rose-500/20 text-rose-500' :
                                                        'text-yellow-500'
                                                }`}>
                                                {venta.estado}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center flex justify-center gap-2">
                                            {/* Botón Ver Comprobante */}
                                            {(venta.metodoPago === 'TRANSFERENCIA' || venta.metodoPago === 'MIXTO' || Boolean(venta.comprobanteUrl)) ? (
                                                <button
                                                    title="Ver Comprobante"
                                                    onClick={() => setSelectedReceipt(venta.comprobanteUrl || '')}
                                                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-sky-600 hover:border-sky-500 text-zinc-400 hover:text-white flex items-center justify-center transition-all shadow-md group"
                                                >
                                                    <span className="group-hover:scale-110 transition-transform">👁️</span>
                                                </button>
                                            ) : (
                                                <div className="w-8 h-8" />
                                            )}

                                            {/* Botón Anular */}
                                            {venta.estado !== 'ANULADO' ? (
                                                <button
                                                    title="Anular Venta"
                                                    onClick={() => handleAnular(venta.id)}
                                                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-rose-600 hover:border-rose-500 text-zinc-500 hover:text-white flex items-center justify-center transition-all shadow-md font-black text-lg group"
                                                >
                                                    <span className="group-hover:rotate-90 transition-transform duration-300">×</span>
                                                </button>
                                            ) : (
                                                <div className="w-8 h-8" />
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL DEL COMPROBANTE (ReceiptModal) */}
            {selectedReceipt && (
                <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-graphite-950 border border-zinc-800 rounded-3xl w-full max-w-md flex flex-col overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200">
                        <div className="bg-zinc-950 p-5 border-b border-zinc-800 flex justify-between items-center">
                            <h3 className="text-zinc-300 font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                <span className="text-burnt-500">📸</span> Comprobante Adjunto
                            </h3>
                            <button
                                onClick={() => setSelectedReceipt(null)}
                                className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-white flex items-center justify-center text-xl font-black transition-colors"
                                title="Cerrar"
                            >
                                ×
                            </button>
                        </div>

                        <div className="p-8 flex justify-center bg-zinc-900/50 min-h-[300px] items-center">
                            {selectedReceipt.startsWith('http') || selectedReceipt.startsWith('data:image') ? (
                                <img
                                    src={selectedReceipt}
                                    alt="Comprobante pago"
                                    className="max-h-[60vh] object-contain rounded-xl shadow-2xl ring-1 ring-zinc-800/50"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        target.nextElementSibling?.classList.remove('hidden');
                                    }}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center text-zinc-500 gap-3 opacity-60">
                                    <span className="text-5xl opacity-50 block">📄</span>
                                    <span className="uppercase font-black text-[10px] tracking-widest block px-6 text-center">
                                        COMPROBANTE NO DISPONIBLE O SIN FORMATO GRÁFICO
                                    </span>
                                </div>
                            )}
                            {/* Fallback en caso de error de imagen (oculto por defecto) */}
                            <div className="hidden flex-col items-center justify-center text-red-400 gap-3 opacity-60">
                                <span className="text-4xl block">⚠️</span>
                                <span className="uppercase font-black text-[10px] tracking-widest block text-center">
                                    Error al cargar la imagen
                                </span>
                            </div>
                        </div>

                        <div className="p-5 bg-zinc-950 text-center border-t border-zinc-800 flex justify-end">
                            <button
                                className="btn btn-muted px-6 h-10 text-[10px] font-black uppercase tracking-widest"
                                onClick={() => setSelectedReceipt(null)}
                            >
                                Cerrar (Esc)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {cancelTargetId && (
                <div className="fixed inset-0 z-[520] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-graphite-950 border border-zinc-800 rounded-2xl w-full max-w-lg p-5 space-y-4">
                        <div className="text-sm font-black uppercase tracking-wider text-rose-400">
                            Anular venta {cancelTargetId}
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Motivo obligatorio</label>
                            <textarea
                                className="w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm text-white outline-none focus:border-rose-500 resize-none"
                                rows={4}
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Detalle del motivo de anulacion..."
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button className="btn btn-muted" onClick={() => setCancelTargetId(null)}>Cancelar</button>
                            <button
                                className="btn bg-rose-600 hover:bg-rose-500 text-white"
                                onClick={confirmAnular}
                                disabled={String(cancelReason || '').trim().length < 3}
                            >
                                Confirmar anulacion
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
