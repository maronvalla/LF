import ProductSearchModal from "../ProductSearchModal";
import QtyEditModal from "../ventas/QtyEditModal";

export function PurchaseModals({
  products,
  showProductModal,
  setShowProductModal,
  restoreCodeFocusAfterModal,
  addItem,
  showQtyEditModal,
  qtyEditValue,
  setQtyEditValue,
  setShowQtyEditModal,
  applyQtyEdit,
  showCostEditModal,
  costEditValue,
  setCostEditValue,
  setShowCostEditModal,
  applyCostEdit,
  showMayoristaEditModal,
  mayoristaEditValue,
  setMayoristaEditValue,
  setShowMayoristaEditModal,
  applyMayoristaEdit,
  showSalePriceEditModal,
  salePriceEditValue,
  setSalePriceEditValue,
  setShowSalePriceEditModal,
  applySalePriceEdit,
  historyReceiptInputRef,
  handleHistoryReceiptChange,
  showHistoryModal,
  setShowHistoryModal,
  historyLoading,
  historyRows,
  setSelectedReceipt,
  openAttachReceipt,
  selectedReceipt,
  closeReceipt,
}) {
  return (
    <>
      {showProductModal ? (
        <ProductSearchModal
          products={products}
          onClose={() => {
            setShowProductModal(false);
            restoreCodeFocusAfterModal();
          }}
          onSelect={(product) => {
            addItem(product);
            setShowProductModal(false);
            restoreCodeFocusAfterModal();
          }}
        />
      ) : null}
      {showQtyEditModal ? (
        <QtyEditModal
          value={qtyEditValue}
          onChange={setQtyEditValue}
          onCancel={() => setShowQtyEditModal(false)}
          onApply={applyQtyEdit}
        />
      ) : null}
      {showCostEditModal ? (
        <QtyEditModal
          value={costEditValue}
          onChange={setCostEditValue}
          onCancel={() => setShowCostEditModal(false)}
          onApply={applyCostEdit}
          title="Editar costo"
          label="Nuevo costo transaccional"
          min="0"
          step="0.01"
        />
      ) : null}
      {showMayoristaEditModal ? (
        <QtyEditModal
          value={mayoristaEditValue}
          onChange={setMayoristaEditValue}
          onCancel={() => setShowMayoristaEditModal(false)}
          onApply={applyMayoristaEdit}
          title="Editar precio mayorista"
          label="Nuevo precio mayorista"
          min="0"
          step="0.01"
        />
      ) : null}
      {showSalePriceEditModal ? (
        <QtyEditModal
          value={salePriceEditValue}
          onChange={setSalePriceEditValue}
          onCancel={() => setShowSalePriceEditModal(false)}
          onApply={applySalePriceEdit}
          title="Editar precio minorista"
          label="Nuevo precio minorista"
          min="0"
          step="0.01"
        />
      ) : null}
      <input
        ref={historyReceiptInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleHistoryReceiptChange}
      />
      {showHistoryModal ? (
        <PurchaseHistoryModal
          historyLoading={historyLoading}
          historyRows={historyRows}
          onClose={() => setShowHistoryModal(false)}
          onOpenReceipt={setSelectedReceipt}
          onAttachReceipt={openAttachReceipt}
        />
      ) : null}
      {selectedReceipt ? <ReceiptPreviewModal selectedReceipt={selectedReceipt} onClose={closeReceipt} /> : null}
    </>
  );
}

function PurchaseHistoryModal({ historyLoading, historyRows, onClose, onOpenReceipt, onAttachReceipt }) {
  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-2xl bg-[#111214] border border-zinc-800 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-lg font-black uppercase tracking-wide text-white">Historial de compras</div>
            <div className="text-xs text-zinc-400">Boletas adjuntas y compras registradas</div>
          </div>
          <button
            type="button"
            className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 h-[36px] text-[11px] font-black uppercase"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead className="sticky top-0 bg-[#18191d] text-zinc-300 text-[10px] uppercase">
              <tr>
                <th className="px-3 py-3 text-left font-black">Fecha</th>
                <th className="px-3 py-3 text-left font-black">Comprobante</th>
                <th className="px-3 py-3 text-left font-black">Proveedor</th>
                <th className="px-3 py-3 text-right font-black">Items</th>
                <th className="px-3 py-3 text-right font-black">Total</th>
                <th className="px-3 py-3 text-center font-black">Boleta</th>
                <th className="px-3 py-3 text-center font-black">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-zinc-400">
                    Cargando historial...
                  </td>
                </tr>
              ) : historyRows.length ? (
                historyRows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-800 text-zinc-100">
                    <td className="px-3 py-3">{new Date(row.purchase_date).toLocaleDateString("es-AR")}</td>
                    <td className="px-3 py-3">{row.purchase_number || "S/N"}</td>
                    <td className="px-3 py-3">{row.supplier_name || "SIN PROVEEDOR"}</td>
                    <td className="px-3 py-3 text-right">{Number(row.total_items || 0)}</td>
                    <td className="px-3 py-3 text-right font-bold">${Number(row.total_amount || 0).toFixed(2)}</td>
                    <td className="px-3 py-3 text-center">
                      {row.receipt_image_data_url ? (
                        <span className="inline-flex rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-1 text-[10px] font-black uppercase">
                          Cargada
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-zinc-700 text-zinc-200 px-2 py-1 text-[10px] font-black uppercase">
                          Sin boleta
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center gap-2">
                        {row.receipt_image_data_url ? (
                          <button
                            type="button"
                            className="bg-white hover:bg-zinc-50 text-sky-700 border border-sky-300 rounded-lg px-3 h-[34px] text-[10px] font-black uppercase"
                            onClick={() =>
                              onOpenReceipt({
                                title: row.receipt_image_name || `Boleta ${row.purchase_number || "S/N"}`,
                                url: row.receipt_image_data_url,
                              })
                            }
                          >
                            Ver boleta
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="bg-[#f07c0f] hover:bg-[#df6f08] text-white rounded-lg px-3 h-[34px] text-[10px] font-black uppercase"
                            onClick={() => onAttachReceipt(row.id)}
                          >
                            Asociar boleta
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-zinc-400">
                    No hay compras registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReceiptPreviewModal({ selectedReceipt, onClose }) {
  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-[#111214] border border-zinc-800 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="text-sm font-black uppercase tracking-wide text-white">{selectedReceipt.title || "Boleta"}</div>
          <button
            type="button"
            className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 h-[34px] text-[11px] font-black uppercase"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
        <div className="p-4 bg-[#18191d] flex-1 overflow-auto flex items-center justify-center">
          <img
            src={selectedReceipt.url}
            alt={selectedReceipt.title || "Boleta"}
            className="max-w-full max-h-[75vh] object-contain rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}



