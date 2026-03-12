import SearchableSelect from "../SearchableSelect";

export function PurchaseHeader({ onOpenHistory }) {
  return (
    <div className="px-1 flex items-center justify-between gap-3 shrink-0">
      <button
        type="button"
        className="bg-white hover:bg-zinc-50 text-[#b26a1e] border border-[#caa57f] rounded px-3 h-[24px] flex items-center justify-center transition-colors text-[9px] font-black uppercase"
      >
        Volver (Esc)
      </button>
      <button
        type="button"
        className="bg-zinc-800 hover:bg-zinc-700 text-white rounded px-3 h-[24px] flex items-center justify-center transition-colors text-[9px] font-black uppercase"
        onClick={onOpenHistory}
      >
        Ver historial de compras
      </button>
    </div>
  );
}

export function PurchaseMetaSection({
  draft,
  setDraft,
  supplierHasCurrentAccount,
  purchaseReceiptInputRef,
  handleDraftReceiptChange,
  setSelectedReceipt,
}) {
  return (
    <div className="bg-[#ededee] border border-[#d1d1d4] rounded p-1 px-2 flex flex-col lg:flex-row gap-2 shrink-0">
      <div className="flex-1 min-w-[120px]">
        <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">Tipo Comp.</label>
        <select
          className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 h-[24px] text-xs font-medium text-zinc-800 outline-none focus:border-[#d97706]"
          value={draft.invoiceType}
          onChange={(e) => setDraft((p) => ({ ...p, invoiceType: e.target.value }))}
        >
          <option value="Factura A">Factura A</option>
          <option value="Factura B">Factura B</option>
          <option value="Factura C">Factura C</option>
          <option value="Remito">Remito</option>
          <option value="Orden de Compra">Orden de Compra</option>
        </select>
      </div>
      <div className="flex-1 min-w-[120px]">
        <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">Nro Comp.</label>
        <input
          type="text"
          className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 h-[24px] text-xs font-medium text-zinc-900 outline-none focus:border-[#d97706]"
          placeholder="0001-00001234"
          value={draft.invoiceNumber}
          onChange={(e) => setDraft((p) => ({ ...p, invoiceNumber: e.target.value }))}
        />
      </div>
      <div className="flex-1 min-w-[120px]">
        <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">Fecha</label>
        <input
          type="date"
          className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 h-[24px] text-xs font-medium text-zinc-900 outline-none focus:border-[#d97706]"
          value={draft.date}
          onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))}
        />
      </div>
      <div className="flex-1 min-w-[120px]">
        <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">Medio Pago</label>
        <select
          className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 h-[24px] text-xs font-medium text-zinc-900 outline-none focus:border-[#d97706]"
          value={draft.paymentMethod}
          onChange={(e) => setDraft((p) => ({ ...p, paymentMethod: e.target.value }))}
        >
          <option value="EFECTIVO">EFECTIVO</option>
          <option value="TRANSFERENCIA">TRANSFERENCIA</option>
          <option value="OTRO">OTRO</option>
          {supplierHasCurrentAccount ? <option value="CUENTA_CORRIENTE">CUENTA CTA</option> : null}
        </select>
      </div>
      <div className="flex-1 min-w-[120px]">
        <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">Destino stock</label>
        <select
          className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 h-[24px] text-xs font-medium text-zinc-900 outline-none focus:border-[#d97706]"
          value={draft.location}
          onChange={(e) => setDraft((p) => ({ ...p, location: e.target.value }))}
        >
          <option value="LOCAL">LOCAL</option>
          <option value="GALPON">GALPON</option>
        </select>
      </div>
      <div className="flex-1 lg:max-w-xs xl:max-w-md">
        <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">Boleta</label>
        <div className="flex items-center gap-1 h-[24px]">
          <input
            ref={purchaseReceiptInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleDraftReceiptChange}
          />
          <button
            type="button"
            className="bg-zinc-200 hover:bg-zinc-300 text-zinc-800 rounded px-2 h-full flex items-center justify-center transition-colors text-[9px] font-black uppercase shrink-0"
            onClick={() => purchaseReceiptInputRef.current?.click()}
          >
            {draft.receiptImageDataUrl ? "Cambiar" : "Cargar IMaGE..."}
          </button>
          {draft.receiptImageDataUrl ? (
            <>
              <button
                type="button"
                className="bg-sky-100 hover:bg-sky-200 text-sky-800 rounded px-2 h-full flex items-center justify-center transition-colors text-[9px] font-black uppercase shrink-0"
                onClick={() =>
                  setSelectedReceipt({
                    title: draft.receiptImageName || "Boleta adjunta",
                    url: draft.receiptImageDataUrl,
                  })
                }
              >
                Ver
              </button>
              <button
                type="button"
                className="bg-rose-100 hover:bg-rose-200 text-rose-800 rounded px-2 h-full flex items-center justify-center transition-colors text-[9px] font-black uppercase shrink-0"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    receiptImageDataUrl: "",
                    receiptImageName: "",
                  }))
                }
              >
                X
              </button>
              <span className="text-[9px] text-zinc-600 truncate ml-1">{draft.receiptImageName || "Boleta cargada"}</span>
            </>
          ) : (
            <span className="text-[9px] text-zinc-500 ml-1">Sin adjunto</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function PurchaseSupplierSection({ suppliers, draft, setDraft, supplierSelectRef }) {
  return (
    <div className="bg-[#ededee] border border-[#d1d1d4] rounded p-1 px-2 flex flex-col sm:flex-row items-end gap-2 shrink-0">
      <div className="flex-1 w-full">
        <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">Proveedor</label>
        <SearchableSelect
          inputRef={supplierSelectRef}
          options={suppliers.map((s) => ({
            id: s.id,
            label: String(s.businessName || s.name || "").toUpperCase(),
            subtext: s.taxId || s.cuit || "Sin CUIT",
          }))}
          value={draft.supplierId}
          onChange={(id) => {
            const supplier = suppliers.find((x) => x.id === id);
            const supplierCurrentAccountEnabled = Boolean(
              supplier?.enable_current_account ?? supplier?.enableCurrentAccount
            );
            setDraft((prev) => ({
              ...prev,
              supplierId: id,
              supplierName: supplier?.businessName || supplier?.name || "",
              paymentMethod:
                prev.paymentMethod === "CUENTA_CORRIENTE" && !supplierCurrentAccountEnabled
                  ? "EFECTIVO"
                  : !prev.supplierId && supplierCurrentAccountEnabled
                    ? "CUENTA_CORRIENTE"
                    : prev.paymentMethod,
            }));
          }}
          placeholder="Buscar proveedor..."
          inputClassName="bg-white border-[#cfcfd4] rounded px-2 py-0 h-[24px] text-xs font-medium text-zinc-900 placeholder:text-zinc-500 focus:border-[#d97706] w-full"
          dropdownClassName="bg-white border-[#cfcfd4]"
          optionClassName="border-[#ececf1]"
        />
      </div>

      <button
        className="bg-[#f07c0f] hover:bg-[#df6f08] text-white border border-[#d86b07] rounded px-3 h-[24px] flex items-center justify-center transition-colors text-[10px] font-black uppercase shrink-0"
        onClick={() => supplierSelectRef.current?.focus()}
        type="button"
      >
        Buscar Prv. (F2)
      </button>
    </div>
  );
}

export function PurchaseItemsSection({
  itemsPanelRef,
  codeInputRef,
  search,
  setSearch,
  addCurrentSearchItem,
  openProductSearch,
  draft,
  selectedIdx,
  setSelectedIdx,
  formatQuantity,
}) {
  return (
    <div
      ref={itemsPanelRef}
      className="bg-[#ededee] border border-[#d1d1d4] rounded flex flex-col overflow-visible md:flex-1 min-h-[18rem] md:min-h-0 md:overflow-hidden"
    >
      <div className="p-1 border-b border-[#d8d8dc] flex flex-col gap-1 shrink-0">
        <div className="flex flex-col xl:flex-row gap-1 items-end">
          <div className="flex-1 flex gap-1 w-full items-center">
            <label className="text-[10px] font-black text-zinc-700 uppercase shrink-0">Cod / F5:</label>
            <input
              ref={codeInputRef}
              className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 h-[26px] text-xs font-medium text-zinc-900 outline-none focus:border-[#d97706] placeholder:text-zinc-500"
              placeholder="Escanee o busque..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCurrentSearchItem();
                } else if (e.key === "F5") {
                  e.preventDefault();
                  openProductSearch();
                }
              }}
              autoComplete="off"
            />
            <button
              className="bg-white hover:bg-zinc-50 border border-[#caa57f] text-[#b26a1e] rounded w-[26px] h-[26px] flex items-center justify-center transition-colors"
              onClick={openProductSearch}
              title="Busqueda de Articulos (F5)"
              type="button"
            >
              <span className="text-xs font-black">?</span>
            </button>
          </div>

          <button
            className="w-full xl:w-auto bg-[#f07c0f] hover:bg-[#df6f08] text-white font-black rounded px-3 h-[26px] transition-colors text-[10px] uppercase shrink-0"
            onClick={addCurrentSearchItem}
            type="button"
          >
            + AGREGAR
          </button>
        </div>
      </div>

      <div className="overflow-visible md:flex-1 md:min-h-0 md:overflow-auto">
        <table className="w-full text-[11px] md:text-xs text-left min-w-[660px]">
          <thead className="text-[9px] uppercase text-zinc-600 tracking-wide bg-[#f5f5f6] border-b border-[#d8d8dc] sticky top-0 z-10">
            <tr>
              <th className="px-3 py-1 font-black w-16">CANT</th>
              <th className="px-3 py-1 font-black w-24">CODIGO</th>
              <th className="px-3 py-1 font-black">DESCRIPCION</th>
              <th className="px-3 py-1 font-black w-24 text-right">COSTO UNIT.</th>
              <th className="px-3 py-1 font-black w-24 text-right">MAYORISTA</th>
              <th className="px-3 py-1 font-black w-24 text-right">MINORISTA</th>
              <th className="px-3 py-1 font-black w-24 text-right">SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            {draft.items.map((it, idx) => (
              <tr
                key={`${it.productId}-${idx}`}
                onClick={() => setSelectedIdx(idx)}
                className={`border-b border-[#e5e5e8] cursor-pointer ${selectedIdx === idx ? "bg-[#ffe9d2]" : "hover:bg-[#f8f8f9]"}`}
              >
                <td className="px-3 py-1 text-zinc-800 font-medium">{formatQuantity(it.qty)}</td>
                <td className="px-3 py-1 text-zinc-600">{it.codigo || "-"}</td>
                <td className="px-3 py-1 font-semibold text-zinc-900 uppercase">{it.name}</td>
                <td className="px-3 py-1 text-right text-zinc-700">${Number(it.unitCost).toFixed(2)}</td>
                <td className="px-3 py-1 text-right text-sky-700 font-bold">${Number(it.priceMayorista || 0).toFixed(2)}</td>
                <td className="px-3 py-1 text-right text-emerald-700 font-bold">${Number(it.salePrice || 0).toFixed(2)}</td>
                <td className="px-3 py-1 text-right font-bold text-zinc-900">${(Number(it.qty) * Number(it.unitCost)).toFixed(2)}</td>
              </tr>
            ))}
            {!draft.items.length ? (
              <tr className="hover:bg-transparent">
                <td colSpan={7} className="text-center py-10 text-zinc-400 focus:outline-none" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PurchaseSummarySection({
  totalItems,
  subtotal,
  clearDraftEntry,
  selectedIdx,
  draft,
  openSelectedCostEditor,
  openSelectedMayoristaEditor,
  openSelectedSalePriceEditor,
  removeSelected,
  submit,
  formatQuantity,
}) {
  const hasSelection = selectedIdx >= 0 && draft.items.length > 0;

  return (
    <div className="bg-[#ededee] border border-[#d1d1d4] rounded-xl px-3 py-2 shrink-0">
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-2 items-center">
          <div>
            <div className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Total Articulos</div>
            <div className="text-sm md:text-base font-bold text-zinc-900">{formatQuantity(totalItems)}</div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Items cargados</div>
            <div className="text-sm md:text-base font-bold text-[#d97706]">{draft.items.length}</div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Total Ingreso</div>
            <div className="text-xl md:text-2xl font-black text-zinc-900">${subtotal.toFixed(2)}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row lg:justify-end gap-2 lg:min-w-[360px]">
          <button
            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 font-black px-3 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase"
            onClick={() => clearDraftEntry()}
            type="button"
          >
            Limpiar borrador
          </button>
          {hasSelection ? (
            <button
              className="bg-white hover:bg-zinc-50 text-amber-700 border border-amber-300 font-black px-3 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase"
              onClick={openSelectedCostEditor}
              type="button"
            >
              Editar costo
            </button>
          ) : null}
          {hasSelection ? (
            <button
              className="bg-white hover:bg-zinc-50 text-sky-700 border border-sky-300 font-black px-3 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase"
              onClick={openSelectedMayoristaEditor}
              type="button"
            >
              Editar mayorista
            </button>
          ) : null}
          {hasSelection ? (
            <button
              className="bg-white hover:bg-zinc-50 text-emerald-700 border border-emerald-300 font-black px-3 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase"
              onClick={openSelectedSalePriceEditor}
              type="button"
            >
              Editar minorista
            </button>
          ) : null}
          {hasSelection ? (
            <button
              className="bg-white hover:bg-zinc-50 text-rose-600 border border-rose-300 font-black px-3 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase"
              onClick={removeSelected}
              type="button"
            >
              Quitar Seleccion
            </button>
          ) : null}

          <button
            className="bg-[#f07c0f] hover:bg-[#df6f08] text-white font-black px-4 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={submit}
            disabled={draft.items.length === 0 || !draft.supplierId}
          >
            Guardar Ingreso
          </button>
        </div>
      </div>
    </div>
  );
}




