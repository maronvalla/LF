import { useState, useRef } from "react";
import api from "../../api";

export function usePurchaseReceipts({ setToast, setDraft }) {
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [attachingReceiptId, setAttachingReceiptId] = useState("");
  const purchaseReceiptInputRef = useRef(null);
  const historyReceiptInputRef = useRef(null);

  const readImageFile = (file, onLoad) => {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setToast?.({ message: "Selecciona una imagen valida para la boleta", type: "error" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => onLoad(String(reader.result || ""), file.name || "boleta");
    reader.onerror = () => {
      setToast?.({ message: "No se pudo leer la imagen de la boleta", type: "error" });
    };
    reader.readAsDataURL(file);
  };

  const handleDraftReceiptChange = (event) => {
    const file = event.target.files?.[0];
    readImageFile(file, (dataUrl, fileName) => {
      setDraft((prev) => ({ ...prev, receiptImageDataUrl: dataUrl, receiptImageName: fileName }));
    });
    event.target.value = "";
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const { data } = await api.get("/purchases/history");
      setHistoryRows(Array.isArray(data) ? data : []);
    } catch {
      setToast?.({ message: "No se pudo cargar el historial de compras", type: "error" });
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = async () => {
    setShowHistoryModal(true);
    await fetchHistory();
  };

  const openAttachReceipt = (purchaseId) => {
    setAttachingReceiptId(purchaseId);
    historyReceiptInputRef.current?.click();
  };

  const handleHistoryReceiptChange = async (event) => {
    const file = event.target.files?.[0];
    const purchaseId = attachingReceiptId;
    if (!file || !purchaseId) {
      event.target.value = "";
      return;
    }

    readImageFile(file, async (dataUrl, fileName) => {
      try {
        await api.patch(`/purchases/${purchaseId}/receipt`, {
          receiptImageDataUrl: dataUrl,
          receiptImageName: fileName,
        });
        setToast?.({ message: "Boleta asociada correctamente", type: "success" });
        await fetchHistory();
      } catch (err) {
        setToast?.({
          message: err.response?.data?.message || "No se pudo asociar la boleta",
          type: "error",
        });
      } finally {
        setAttachingReceiptId("");
      }
    });

    event.target.value = "";
  };

  return {
    purchaseReceiptInputRef,
    historyReceiptInputRef,
    showHistoryModal,
    setShowHistoryModal,
    historyRows,
    historyLoading,
    selectedReceipt,
    setSelectedReceipt,
    openHistory,
    openAttachReceipt,
    handleDraftReceiptChange,
    handleHistoryReceiptChange,
    closeReceipt: () => setSelectedReceipt(null),
  };
}
