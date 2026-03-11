import { useEffect, useMemo, useState } from "react";
import api from "../../api";
import { loadConsolidadoConfig } from "../../utils/consolidadoConfig";
import {
  buildRowsByRubro,
  quantitiesMatch,
  resolveCashExpectedForOrder,
  roundQuantity,
  toAmount,
} from "./utils";

export function useConsolidadoData({ user, setToast }) {
  const [date, setDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [slot, setSlot] = useState(() => (new Date().getHours() >= 11 ? "19" : "11"));
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [consolidated, setConsolidated] = useState([]);
  const [rejectedReturns, setRejectedReturns] = useState([]);
  const [purchaseSuggestion, setPurchaseSuggestion] = useState({
    items: [],
    totalItems: 0,
    totalCost: 0,
  });

  const [pickPlanByProduct, setPickPlanByProduct] = useState({});
  const [checklistByProduct, setChecklistByProduct] = useState({});

  const [cashierName, setCashierName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [cashierSignature, setCashierSignature] = useState("");
  const [driverSignature, setDriverSignature] = useState("");
  const [savingControl, setSavingControl] = useState(false);
  const [cancellingControl, setCancellingControl] = useState(false);
  const [hasSavedControlForShift, setHasSavedControlForShift] = useState(false);

  const role = String(user?.role || "").toUpperCase();
  const canControl = role === "ADMIN" || role === "CAJERO";

  useEffect(() => {
    if (canControl) {
      setCashierName(user?.fullName || user?.full_name || user?.username || "");
    }
  }, [canControl, user]);

  const consolidadoSettings = loadConsolidadoConfig();
  const priorityRubros = Array.isArray(consolidadoSettings.priorityRubros)
    ? consolidadoSettings.priorityRubros
    : [];

  const load = async () => {
    setLoading(true);
    try {
      const [ordersRes, consolidatedRes, purchaseSuggestionRes] = await Promise.all([
        api.get("/deliveries", { params: { date, slot } }),
        api.get("/deliveries/consolidated", { params: { date, slot } }),
        api.get("/deliveries/purchase-suggestion", { params: { date, slot } }),
      ]);

      const nextOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
      const nextConsolidated = Array.isArray(consolidatedRes.data?.consolidated)
        ? consolidatedRes.data.consolidated
        : [];
      const nextRejectedReturns = Array.isArray(consolidatedRes.data?.rejectedReturns)
        ? consolidatedRes.data.rejectedReturns
        : [];

      setOrders(nextOrders);
      setConsolidated(nextConsolidated);
      setRejectedReturns(nextRejectedReturns);
      setPurchaseSuggestion({
        items: Array.isArray(purchaseSuggestionRes.data?.items)
          ? purchaseSuggestionRes.data.items
          : [],
        totalItems: Number(purchaseSuggestionRes.data?.totalItems || 0),
        totalCost: Number(purchaseSuggestionRes.data?.totalCost || 0),
      });

      const defaultPlan = {};
      const defaultChecklist = {};
      const globalDefaultPick = loadConsolidadoConfig().defaultPickLocation;
      for (const row of nextConsolidated) {
        const total = toAmount(row.total_qty || 0);
        const pick = globalDefaultPick;
        defaultPlan[row.product_id] =
          pick === "LOCAL"
            ? { localQty: total, galponQty: 0 }
            : { localQty: 0, galponQty: total };
        defaultChecklist[row.product_id] = false;
      }

      setPickPlanByProduct(defaultPlan);
      setChecklistByProduct(defaultChecklist);

      if (canControl) {
        const controlRes = await api.get("/deliveries/consolidated-control", {
          params: { date, slot },
        });
        const control = controlRes.data;
        setHasSavedControlForShift(Boolean(control));
        if (control) {
          setCashierName(control.cashier_name || "");
          setDriverName(control.driver_name || "");
          setCashierSignature(control.cashier_signature_base64 || "");
          setDriverSignature(control.driver_signature_base64 || "");

          const savedChecklist =
            control.checklist_json && typeof control.checklist_json === "object"
              ? control.checklist_json
              : {};
          const savedPlan = Array.isArray(control.pick_plan_json)
            ? control.pick_plan_json
            : [];

          setChecklistByProduct((prev) => ({ ...prev, ...savedChecklist }));
          setPickPlanByProduct((prev) => {
            const next = { ...prev };
            for (const item of savedPlan) {
              if (!item?.productId) continue;
              next[item.productId] = {
                localQty: toAmount(item.localQty || 0),
                galponQty: toAmount(item.galponQty || 0),
              };
            }
            return next;
          });
        } else {
          setDriverName("");
          setCashierSignature("");
          setDriverSignature("");
        }
      } else {
        setHasSavedControlForShift(false);
      }
    } catch (err) {
      setOrders([]);
      setConsolidated([]);
      setRejectedReturns([]);
      setPurchaseSuggestion({ items: [], totalItems: 0, totalCost: 0 });
      setToast?.({
        message: err.response?.data?.message || "No se pudo cargar consolidado",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date, slot]);

  // --- Derived values ---

  const totalBultos = useMemo(
    () => consolidated.reduce((acc, row) => acc + toAmount(row.total_qty || 0), 0),
    [consolidated]
  );

  const totalEnvasesRetornables = useMemo(
    () => consolidated.reduce((acc, row) => acc + toAmount(row.total_returnable_units || 0), 0),
    [consolidated]
  );

  const totalMercaderiaDevuelta = useMemo(
    () => rejectedReturns.reduce((acc, row) => acc + toAmount(row.qty_to_return || 0), 0),
    [rejectedReturns]
  );

  const pedidosEnvio = useMemo(() => {
    const printableStatuses = new Set(["PENDIENTE", "CARGADO", "ENTREGADO", "RECHAZADO", "NO_ESTABA"]);
    return orders.filter((o) => {
      const status = String(o.delivery_status || "").toUpperCase();
      return printableStatuses.has(status);
    });
  }, [orders]);

  const totalCashExpectedFromDriver = useMemo(() => {
    const printableStatuses = new Set(["PENDIENTE", "CARGADO", "ENTREGADO", "RECHAZADO", "NO_ESTABA"]);
    return orders.reduce((acc, order) => {
      const status = String(order?.delivery_status || "").toUpperCase();
      if (!printableStatuses.has(status)) return acc;
      return acc + resolveCashExpectedForOrder(order);
    }, 0);
  }, [orders]);

  const purchaseSuggestionItems = useMemo(
    () => (Array.isArray(purchaseSuggestion.items) ? purchaseSuggestion.items : []),
    [purchaseSuggestion.items]
  );

  const pickPlanRows = useMemo(
    () =>
      consolidated.map((row) => {
        const plan = pickPlanByProduct[row.product_id] || {
          localQty: 0,
          galponQty: toAmount(row.total_qty || 0),
        };
        const total = toAmount(row.total_qty || 0);
        const assigned = toAmount(plan.localQty || 0) + toAmount(plan.galponQty || 0);
        return {
          ...row,
          localQty: toAmount(plan.localQty || 0),
          galponQty: toAmount(plan.galponQty || 0),
          assigned: roundQuantity(assigned),
          mismatch: !quantitiesMatch(assigned, total),
        };
      }),
    [consolidated, pickPlanByProduct]
  );

  const consolidatedSections = useMemo(
    () => buildRowsByRubro(consolidated, priorityRubros),
    [consolidated, priorityRubros]
  );

  const pickPlanSections = useMemo(
    () => buildRowsByRubro(pickPlanRows, priorityRubros),
    [pickPlanRows, priorityRubros]
  );

  const rejectedReturnSections = useMemo(
    () => buildRowsByRubro(rejectedReturns, priorityRubros),
    [rejectedReturns, priorityRubros]
  );

  const checklistDoneCount = useMemo(
    () => consolidated.filter((r) => Boolean(checklistByProduct[r.product_id])).length,
    [consolidated, checklistByProduct]
  );

  const allChecklistDone = consolidated.length > 0 && checklistDoneCount === consolidated.length;
  const allPickPlanValid = pickPlanRows.every((row) => !row.mismatch);

  // --- Actions ---

  const saveControl = async () => {
    if (!canControl) return;
    if (!allPickPlanValid) {
      setToast?.({
        message: "Hay productos con cantidades mal asignadas entre LOCAL y GALPON",
        type: "error",
      });
      return;
    }
    if (!cashierName.trim()) {
      setToast?.({ message: "Ingrese nombre del cajero", type: "error" });
      return;
    }

    setSavingControl(true);
    try {
      const { data } = await api.post("/deliveries/consolidated-control", {
        date,
        slot,
        cashierName: cashierName.trim(),
        driverName: driverName.trim() || "SIN_CHOFER",
        cashierSignatureBase64: "",
        driverSignatureBase64: "",
        totalOrders: pedidosEnvio.length,
        totalItems: totalBultos,
        checklist: {},
        pickPlan: pickPlanRows.map((r) => ({
          productId: r.product_id,
          localQty: toAmount(r.localQty || 0),
          galponQty: toAmount(r.galponQty || 0),
        })),
      });
      const autoMarkedLoaded = Number(data?.autoMarkedLoaded || 0);
      const validatedBy = String(data?.validatedBy || cashierName || "").trim() || "CAJERO";
      const validatedAtRaw = data?.validatedAt || new Date().toISOString();
      const validatedAtText = new Date(validatedAtRaw).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setToast?.({
        message: `Consolidado validado por ${validatedBy} a las ${validatedAtText}. Pedidos pasados a CARGADO: ${autoMarkedLoaded}`,
        type: "success",
      });
      await load();
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo guardar el control",
        type: "error",
      });
    } finally {
      setSavingControl(false);
    }
  };

  const cancelControl = async () => {
    setCancellingControl(true);
    try {
      await api.post("/deliveries/consolidated-control/cancel", { date, slot });
      setToast?.({ message: "Consolidado anulado correctamente", type: "success" });
      await load();
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo anular el consolidado",
        type: "error",
      });
    } finally {
      setCancellingControl(false);
    }
  };

  const setPlan = (productId, field, value, totalQty) => {
    const parsed = Math.max(0, roundQuantity(toAmount(value || 0)));
    setPickPlanByProduct((prev) => {
      const total = roundQuantity(toAmount(totalQty || 0));
      const base = prev[productId] || { localQty: 0, galponQty: total };
      const next = { ...base, [field]: parsed };
      if (field === "localQty") {
        next.galponQty = roundQuantity(Math.max(0, total - next.localQty));
      } else if (field === "galponQty") {
        next.localQty = roundQuantity(Math.max(0, total - next.galponQty));
      }
      return { ...prev, [productId]: next };
    });
  };

  return {
    date, setDate,
    slot, setSlot,
    loading, load,
    orders, consolidated, rejectedReturns, purchaseSuggestion,
    pickPlanByProduct, checklistByProduct, setChecklistByProduct,
    cashierName, setCashierName,
    driverName, setDriverName,
    cashierSignature, setCashierSignature,
    driverSignature, setDriverSignature,
    savingControl, cancellingControl, hasSavedControlForShift,
    canControl, role,
    saveControl, cancelControl, setPlan,
    // derived
    pedidosEnvio,
    totalBultos, totalEnvasesRetornables, totalMercaderiaDevuelta,
    totalCashExpectedFromDriver,
    purchaseSuggestionItems,
    pickPlanRows,
    consolidatedSections, pickPlanSections, rejectedReturnSections,
    checklistDoneCount, allChecklistDone, allPickPlanValid,
  };
}
