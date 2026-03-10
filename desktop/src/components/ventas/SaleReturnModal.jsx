import React, { useEffect, useMemo, useState } from "react";
import api from "../../api";
import PaymentModal from "../PaymentModal";
import ProductSearchModal from "../ProductSearchModal";

const roundMoney = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
};

const roundQty = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 1000) / 1000;
};

const getProductLocalStock = (product) => Number(product?.stock_local ?? product?.stockLocal ?? 0);

export default function SaleReturnModal({ sale, user, onClose, onSaved }) {
  const role = String(user?.role || "").toUpperCase();
  const isCashier = role === "CAJERO";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [context, setContext] = useState(null);
  const [products, setProducts] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [reason, setReason] = useState("");
  const [returnQtyByItem, setReturnQtyByItem] = useState({});
  const [replacementItems, setReplacementItems] = useState([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [receiptDataUrl, setReceiptDataUrl] = useState("");
  const [receiptName, setReceiptName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        const [contextRes, productsRes] = await Promise.all([
          api.get(`/sales/${sale.id}/returns/context`),
          api.get("/products"),
        ]);
        if (cancelled) return;
        setContext(contextRes.data || null);
        setProducts(
          (Array.isArray(productsRes.data) ? productsRes.data : []).filter(
            (product) => product?.isActive !== false && product?.is_active !== false
          )
        );
      } catch (err) {
        if (cancelled) return;
        setContext(null);
        setErrorMessage(err?.response?.data?.message || "No se pudo cargar la devolucion.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [sale.id]);

  const returnableItems = Array.isArray(context?.items) ? context.items : [];
  const previousReturns = Array.isArray(context?.previousReturns) ? context.previousReturns : [];
  const requiresReceiptPhoto = Boolean(context?.requiresReceiptPhoto);

  const selectedReturnItems = useMemo(
    () =>
      returnableItems
        .map((item) => {
          const qty = roundQty(returnQtyByItem[item.sale_item_id]);
          return {
            ...item,
            selectedQty: qty,
            selectedLineTotal: roundMoney(qty * Number(item.unit_price || 0)),
          };
        })
        .filter((item) => item.selectedQty > 0),
    [returnableItems, returnQtyByItem]
  );

  const availableCredit = useMemo(
    () =>
      roundMoney(
        selectedReturnItems.reduce((sum, item) => sum + Number(item.selectedLineTotal || 0), 0)
      ),
    [selectedReturnItems]
  );

  const replacementTotal = useMemo(
    () =>
      roundMoney(
        replacementItems.reduce(
          (sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0),
          0
        )
      ),
    [replacementItems]
  );

  const missingReplacement = useMemo(
    () => roundMoney(Math.max(0, availableCredit - replacementTotal)),
    [availableCredit, replacementTotal]
  );

  const differenceToCharge = useMemo(
    () => roundMoney(Math.max(0, replacementTotal - availableCredit)),
    [availableCredit, replacementTotal]
  );

  const canSubmit =
    !loading &&
    !saving &&
    reason.trim().length >= 3 &&
    selectedReturnItems.length > 0 &&
    replacementItems.length > 0 &&
    missingReplacement <= 0.01 &&
    (!requiresReceiptPhoto || Boolean(receiptDataUrl));

  const handleReceiptChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReceiptDataUrl(String(reader.result || ""));
      setReceiptName(file.name || "comprobante");
      event.target.value = "";
    };
    reader.onerror = () => {
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const setReturnQty = (saleItemId, nextValue, maxQty) => {
    const normalized = String(nextValue || "").replace(",", ".");
    if (!normalized) {
      setReturnQtyByItem((prev) => ({ ...prev, [saleItemId]: "" }));
      return;
    }

    const parsed = roundQty(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const clamped = Math.min(parsed, Number(maxQty || 0));
    setReturnQtyByItem((prev) => ({
      ...prev,
      [saleItemId]: clamped > 0 ? String(clamped) : "",
    }));
  };

  const addReplacementProduct = (product) => {
    const defaultPrice = roundMoney(
      product?.priceMinorista ?? product?.price_minorista ?? product?.priceMayorista ?? 0
    );
    setReplacementItems((prev) => {
      const idx = prev.findIndex((item) => String(item.productId) === String(product.id));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          qty: roundQty(Number(next[idx].qty || 0) + 1),
          stockLocal: getProductLocalStock(product),
        };
        return next;
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name || "SIN NOMBRE",
          sku: product.codigo || product.sku || product.id,
          unitLabel: product.unitLabel || product.unit_label || "unidad",
          qty: 1,
          unitPrice: defaultPrice,
          stockLocal: getProductLocalStock(product),
        },
      ];
    });
    setShowProductModal(false);
  };

  const updateReplacementItem = (productId, key, value) => {
    setReplacementItems((prev) =>
      prev.map((item) => {
        if (String(item.productId) !== String(productId)) return item;
        if (key === "qty") {
          const nextQty = roundQty(String(value || "").replace(",", "."));
          return { ...item, qty: nextQty > 0 ? nextQty : 0 };
        }
        if (key === "unitPrice") {
          const nextPrice = roundMoney(String(value || "").replace(",", "."));
          return { ...item, unitPrice: nextPrice >= 0 ? nextPrice : 0 };
        }
        return item;
      })
    );
  };

  const removeReplacementItem = (productId) => {
    setReplacementItems((prev) =>
      prev.filter((item) => String(item.productId) !== String(productId))
    );
  };

  const buildPayload = (differencePayment) => {
    const [receiptHeader, receiptBase64 = ""] = String(receiptDataUrl || "").split(",");
    const receiptMimeType = receiptHeader.startsWith("data:")
      ? receiptHeader.slice(5).split(";")[0]
      : "";

    return {
      reason: reason.trim(),
      receiptPhotoBase64: receiptBase64 || null,
      receiptPhotoMimeType: receiptMimeType || null,
      receiptPhotoName: receiptName || null,
      returnedItems: selectedReturnItems.map((item) => ({
        saleItemId: item.sale_item_id,
        qty: roundQty(item.selectedQty),
      })),
      replacementItems: replacementItems
        .filter((item) => Number(item.qty || 0) > 0)
        .map((item) => ({
          productId: item.productId,
          qty: roundQty(item.qty),
          unitPrice: roundMoney(item.unitPrice),
        })),
      differencePayment: differencePayment || null,
    };
  };

  const submitReturn = async (differencePayment = null) => {
    try {
      setSaving(true);
      setErrorMessage("");
      const payload = buildPayload(differencePayment);
      const { data } = await api.post(`/sales/${sale.id}/returns`, payload);
      onSaved?.(data);
      onClose?.();
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || "No se pudo registrar la devolucion.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) {
      if (!selectedReturnItems.length) {
        setErrorMessage("Selecciona al menos un articulo devuelto.");
      } else if (!replacementItems.length) {
        setErrorMessage("Selecciona al menos un articulo de reemplazo.");
      } else if (missingReplacement > 0.01) {
        setErrorMessage(
          "No se devuelve dinero. El reemplazo debe consumir todo el credito o superarlo."
        );
      } else if (requiresReceiptPhoto && !receiptDataUrl) {
        setErrorMessage(
          "El cajero debe adjuntar una foto del comprobante original para registrar la devolucion."
        );
      } else {
        setErrorMessage("Completa los datos obligatorios para registrar la devolucion.");
      }
      return;
    }

    if (differenceToCharge > 0.01) {
      setShowPaymentModal(true);
      return;
    }

    submitReturn(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-[560] bg-black/85 backdrop-blur-sm p-4">
        <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-graphite-950 shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-800 bg-zinc-950 px-6 py-5">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.35em] text-zinc-500">
                Gestionar devolucion
              </div>
              <div className="mt-2 text-2xl font-black uppercase text-white">
                Venta {sale.saleNumber || sale.id}
              </div>
              <div className="mt-2 text-sm text-zinc-400">
                {sale.cliente} -{" "}
                {new Date(sale.fecha).toLocaleString("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
            >
              Cerrar
            </button>
          </div>

          <div className="flex-1 overflow-auto px-6 py-5">
            {errorMessage ? (
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            {loading ? (
              <div className="flex h-full items-center justify-center text-sm font-bold uppercase tracking-widest text-zinc-500">
                Cargando devolucion...
              </div>
            ) : !context ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-5 py-6 text-sm font-semibold text-zinc-300">
                No se pudo abrir esta devolucion.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                          Articulos devueltos
                        </div>
                        <div className="mt-1 text-sm text-zinc-400">
                          Selecciona cantidades sobre la venta original.
                        </div>
                      </div>
                      <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-300">
                        Credito ${availableCredit.toFixed(2)}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {returnableItems.map((item) => (
                        <div
                          key={item.sale_item_id}
                          className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 md:grid-cols-[1.5fr_repeat(4,minmax(0,0.7fr))]"
                        >
                          <div>
                            <div className="text-sm font-black uppercase text-white">
                              {item.product_name}
                            </div>
                            <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                              {item.product_sku} / {item.unit_label || "unidad"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                              Vendido
                            </div>
                            <div className="mt-1 text-lg font-black text-zinc-200">
                              {Number(item.sold_qty || 0).toFixed(3)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                              Ya devuelto
                            </div>
                            <div className="mt-1 text-lg font-black text-zinc-200">
                              {Number(item.returned_qty || 0).toFixed(3)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                              Disponible
                            </div>
                            <div className="mt-1 text-lg font-black text-amber-300">
                              {Number(item.available_qty || 0).toFixed(3)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                              Devuelve ahora
                            </div>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              max={Number(item.available_qty || 0)}
                              value={returnQtyByItem[item.sale_item_id] || ""}
                              onChange={(event) =>
                                setReturnQty(
                                  item.sale_item_id,
                                  event.target.value,
                                  Number(item.available_qty || 0)
                                )
                              }
                              disabled={Number(item.available_qty || 0) <= 0}
                              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-black text-white outline-none transition-colors focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                              placeholder="0"
                            />
                            <div className="mt-1 text-[11px] font-semibold text-zinc-500">
                              Valor unitario ${Number(item.unit_price || 0).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                        Reglas del cambio
                      </div>
                      <div className="mt-3 space-y-2 text-sm font-semibold text-zinc-300">
                        <div>No se devuelve dinero en efectivo.</div>
                        <div>El reemplazo debe usar todo el credito o superarlo.</div>
                        <div>Si el reemplazo vale mas, solo se cobra la diferencia.</div>
                        {isCashier ? (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-100">
                            Cajero: maximo 7 dias desde la venta y foto obligatoria del comprobante original.
                          </div>
                        ) : (
                          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sky-100">
                            Administrador: puede gestionar cambios de cualquier fecha.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                        Comprobante del cliente
                      </div>
                      <div className="mt-3 space-y-3">
                        <input
                          id="sale-return-receipt-input"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleReceiptChange}
                        />
                        <div className="flex flex-wrap gap-2">
                          <label
                            htmlFor="sale-return-receipt-input"
                            className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-[#caa57f] bg-white px-4 py-2 text-[11px] font-black uppercase text-[#b26a1e] hover:bg-zinc-50"
                          >
                            {receiptDataUrl ? "Cambiar foto" : "Cargar foto"}
                          </label>
                          {receiptDataUrl ? (
                            <button
                              type="button"
                              className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-[11px] font-black uppercase text-rose-600 hover:bg-zinc-50"
                              onClick={() => {
                                setReceiptDataUrl("");
                                setReceiptName("");
                              }}
                            >
                              Quitar
                            </button>
                          ) : null}
                        </div>
                        <div className="text-xs font-semibold text-zinc-500">
                          {requiresReceiptPhoto
                            ? "Obligatoria para cajero."
                            : "Opcional para administrador."}
                        </div>
                        {receiptName ? (
                          <div className="text-xs font-semibold text-zinc-400">{receiptName}</div>
                        ) : null}
                        {receiptDataUrl ? (
                          <img
                            src={receiptDataUrl}
                            alt="Comprobante del cliente"
                            className="max-h-44 w-full rounded-2xl border border-zinc-800 bg-zinc-950 object-contain"
                          />
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                      <label className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                        Motivo
                      </label>
                      <textarea
                        rows={4}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        className="mt-3 w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none transition-colors focus:border-amber-500"
                        placeholder="Detalle del motivo del cambio o devolucion..."
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                        Reemplazo
                      </div>
                      <div className="mt-1 text-sm text-zinc-400">
                        Selecciona la mercaderia que se entrega en lugar de la devuelta.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProductModal(true)}
                      className="rounded-xl bg-[#f07c0f] px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#df6f08]"
                    >
                      Agregar articulo
                    </button>
                  </div>

                  <div className="mt-4 overflow-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        <tr>
                          <th className="px-3 py-2">Articulo</th>
                          <th className="px-3 py-2">Stock local</th>
                          <th className="px-3 py-2">Cantidad</th>
                          <th className="px-3 py-2">Precio</th>
                          <th className="px-3 py-2 text-right">Subtotal</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {replacementItems.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-sm font-semibold text-zinc-500">
                              Todavia no hay articulos de reemplazo.
                            </td>
                          </tr>
                        ) : (
                          replacementItems.map((item) => (
                            <tr key={item.productId} className="border-b border-zinc-900/70">
                              <td className="px-3 py-3">
                                <div className="font-black uppercase text-white">{item.name}</div>
                                <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                                  {item.sku} / {item.unitLabel}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-sm font-black text-zinc-300">
                                {Number(item.stockLocal || 0).toFixed(3)}
                              </td>
                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={item.qty}
                                  onChange={(event) =>
                                    updateReplacementItem(item.productId, "qty", event.target.value)
                                  }
                                  className="w-28 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-black text-white outline-none transition-colors focus:border-amber-500"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.unitPrice}
                                  onChange={(event) =>
                                    updateReplacementItem(item.productId, "unitPrice", event.target.value)
                                  }
                                  className="w-32 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-black text-white outline-none transition-colors focus:border-amber-500"
                                />
                              </td>
                              <td className="px-3 py-3 text-right text-base font-black text-emerald-300">
                                ${(Number(item.qty || 0) * Number(item.unitPrice || 0)).toFixed(2)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeReplacementItem(item.productId)}
                                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-rose-200 hover:border-rose-400/50 hover:text-white"
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-200">
                      Credito disponible
                    </div>
                    <div className="mt-2 text-3xl font-black text-white">
                      ${availableCredit.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-5 py-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-200">
                      Reemplazo seleccionado
                    </div>
                    <div className="mt-2 text-3xl font-black text-white">
                      ${replacementTotal.toFixed(2)}
                    </div>
                  </div>
                  <div
                    className={`rounded-2xl border px-5 py-4 ${
                      differenceToCharge > 0.01
                        ? "border-amber-500/20 bg-amber-500/10"
                        : missingReplacement > 0.01
                        ? "border-rose-500/20 bg-rose-500/10"
                        : "border-zinc-800 bg-zinc-900/60"
                    }`}
                  >
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-300">
                      {differenceToCharge > 0.01
                        ? "Diferencia a cobrar"
                        : missingReplacement > 0.01
                        ? "Credito sin usar"
                        : "Cambio cerrado"}
                    </div>
                    <div className="mt-2 text-3xl font-black text-white">
                      ${(differenceToCharge > 0.01 ? differenceToCharge : missingReplacement).toFixed(2)}
                    </div>
                    <div className="mt-2 text-xs font-semibold text-zinc-400">
                      {differenceToCharge > 0.01
                        ? "Solo este importe impactara en caja."
                        : missingReplacement > 0.01
                        ? "No puedes confirmar mientras quede credito sin usar."
                        : "No hay diferencia a cobrar."}
                    </div>
                  </div>
                </div>

                {previousReturns.length ? (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                      Historial de devoluciones de esta venta
                    </div>
                    <div className="mt-4 space-y-3">
                      {previousReturns.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-black uppercase text-white">
                                {row.return_number}
                              </div>
                              <div className="mt-1 text-xs font-semibold text-zinc-500">
                                {new Date(row.created_at).toLocaleString("es-AR", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}{" "}
                                - {row.created_by_name}
                              </div>
                            </div>
                            <div className="text-right text-xs font-black uppercase tracking-widest text-zinc-300">
                              Credito ${Number(row.return_credit_amount || 0).toFixed(2)} - Diferencia $
                              {Number(row.difference_amount || 0).toFixed(2)}
                            </div>
                          </div>
                          <div className="mt-2 text-sm font-semibold text-zinc-300">{row.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-800 bg-zinc-950 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-xl bg-[#f07c0f] px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#df6f08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {differenceToCharge > 0.01 ? "Cobrar diferencia y confirmar" : "Confirmar cambio"}
            </button>
          </div>
        </div>
      </div>

      {showProductModal ? (
        <ProductSearchModal
          products={products}
          onClose={() => setShowProductModal(false)}
          onSelect={addReplacementProduct}
        />
      ) : null}

      {showPaymentModal ? (
        <PaymentModal
          total={differenceToCharge}
          title="Cobrar diferencia"
          confirmLabel="Confirmar cambio"
          onClose={() => setShowPaymentModal(false)}
          onConfirm={(payment) => {
            setShowPaymentModal(false);
            submitReturn(payment);
          }}
          allowedMethods={["EFECTIVO", "TRANSFERENCIA", "MIXTO"]}
        />
      ) : null}
    </>
  );
}
