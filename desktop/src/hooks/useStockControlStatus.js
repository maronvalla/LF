import { useCallback, useEffect, useState } from "react";
import api from "../api";

export default function useStockControlStatus(setToast) {
  const [stockControlState, setStockControlState] = useState(null);
  const [canManageStockControl, setCanManageStockControl] = useState(false);
  const [loadingStockControl, setLoadingStockControl] = useState(true);

  const loadStockControlStatus = useCallback(async () => {
    setLoadingStockControl(true);
    try {
      const { data } = await api.get("/inventory/stock-control");
      setStockControlState(data?.state || null);
      setCanManageStockControl(Boolean(data?.canManage));
    } catch {
      setStockControlState(null);
      setCanManageStockControl(false);
      setToast?.({ message: "No se pudo cargar el estado del control de stock", type: "error" });
    } finally {
      setLoadingStockControl(false);
    }
  }, [setToast]);

  useEffect(() => {
    loadStockControlStatus();
  }, [loadStockControlStatus]);

  return {
    stockControlState,
    setStockControlState,
    canManageStockControl,
    loadingStockControl,
    loadStockControlStatus,
  };
}
