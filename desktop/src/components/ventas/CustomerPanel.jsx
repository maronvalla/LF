import SearchableSelect from "../SearchableSelect";

const WALK_IN_CUSTOMER_ID = "__CONSUMIDOR_FINAL__";

export default function CustomerPanel({
  customerSelectRef,
  customers,
  draft,
  isDelivery,
  deliveryConditions,
  onCustomerChange,
  onToggleDelivery,
  onOpenQuickClient,
  onOpenCustomerSearch,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onCustomerCommit,
  shiftOptions = [],
  onShiftChange,
  onPaymentConditionChange,
  onDeliveryAddressChange,
  readOnly = false,
  customerForceOpenSignal = 0,
}) {
  const lightSelectStyle = { colorScheme: "light" };
  const lightOptionStyle = { color: "#18181b", backgroundColor: "#ffffff" };

  return (
    <div className="bg-[#ededee] border border-[#d1d1d4] rounded p-1 px-2 flex flex-col gap-1 shrink-0">
      <div className="flex flex-wrap items-end gap-2 w-full">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">
            Cliente
          </label>
          <SearchableSelect
            inputRef={customerSelectRef}
            options={[
              { id: WALK_IN_CUSTOMER_ID, label: "CONSUMIDOR FINAL", subtext: "-" },
              ...customers.map((customer) => ({
                id: customer.id,
                label: String(customer.name || "").toUpperCase(),
                subtext: customer.taxId || "Sin CUIT",
              })),
            ]}
            value={draft.customerId}
            onChange={(id) => {
              if (id === WALK_IN_CUSTOMER_ID) {
                onCustomerNameChange("CONSUMIDOR FINAL");
                onCustomerChange("");
                return;
              }
              onCustomerChange(id);
            }}
            freeTextValue={draft.customerName}
            onFreeTextChange={onCustomerNameChange}
            placeholder="Buscar..."
            theme="light"
            inputClassName="bg-white border-[#cfcfd4] rounded px-2 py-0 h-[24px] text-xs font-medium text-zinc-900 placeholder:text-zinc-500 focus:border-[#d97706] w-full"
            dropdownClassName="bg-white border-[#cfcfd4]"
            optionClassName="border-[#ececf1]"
            className={readOnly ? "pointer-events-none opacity-70 flex-1 min-w-[200px]" : "flex-1 min-w-[200px]"}
            forceOpenSignal={customerForceOpenSignal}
            onCommit={onCustomerCommit}
          />
        </div>
        <div className="w-full md:w-[220px]">
          <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">
            Celular presupuesto
          </label>
          <input
            className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 h-[24px] text-xs font-medium text-zinc-900 placeholder:text-zinc-500 outline-none focus:border-[#d97706]"
            value={draft.customerPhone || ""}
            onChange={(event) => onCustomerPhoneChange(event.target.value)}
            placeholder="381..."
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="flex gap-1">
        <button
          className="bg-white hover:bg-zinc-50 text-[#b26a1e] border border-[#caa57f] rounded px-2 h-[24px] flex items-center justify-center transition-colors text-[9px] font-black uppercase"
          onClick={onOpenCustomerSearch}
          type="button"
          disabled={readOnly}
          title="Buscar cliente (F3)"
        >
          Buscar (F3)
        </button>
        <button
          className="bg-[#f07c0f] hover:bg-[#df6f08] text-white border border-[#d86b07] rounded px-2 h-[24px] flex items-center justify-center transition-colors text-[9px] font-black uppercase"
          onClick={onOpenQuickClient}
          type="button"
          disabled={readOnly}
        >
          Nuevo
        </button>
      </div>
      <div
        className="flex items-center h-[24px] px-2 gap-1.5 bg-white border border-[#cfcfd4] rounded cursor-pointer select-none"
        onClick={() => !readOnly && onToggleDelivery()}
      >
        <span className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Es Envio</span>
        <div className={`w-7 h-4 rounded-full p-0.5 transition-colors ${isDelivery ? "bg-[#f07c0f]" : "bg-zinc-400"}`}>
          <div className={`w-3 h-3 bg-white rounded-full transition-transform ${isDelivery ? "translate-x-3" : "translate-x-0"}`} />
        </div>
      </div>

      {isDelivery ? (
        <div className="flex flex-wrap items-end gap-2 w-full border-t border-[#d7d7db] pt-1">
          <div className="flex-1 min-w-[100px]">
            <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">
              Salida Est.
            </label>
            <select
              className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 text-xs font-semibold text-zinc-800 h-[24px] outline-none focus:border-[#d97706]"
              style={lightSelectStyle}
              value={draft.shift}
              onChange={(event) => onShiftChange(event.target.value)}
              disabled={readOnly}
            >
              {(shiftOptions.length
                ? shiftOptions
                : [
                  { value: "MANIANA", label: "MA\u00d1ANA (11:00)" },
                  { value: "TARDE", label: "TARDE (19:00)" },
                ]
              ).map((option) => (
                <option key={option.value} value={option.value} style={lightOptionStyle}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">
              Condicion
            </label>
            <select
              className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 text-xs font-semibold text-zinc-800 h-[24px] outline-none focus:border-[#d97706]"
              style={lightSelectStyle}
              value={draft.paymentCondition}
              onChange={(event) => onPaymentConditionChange(event.target.value)}
              disabled={readOnly}
            >
              {deliveryConditions.map((condition) => (
                <option key={condition.value} value={condition.value} style={lightOptionStyle}>
                  {condition.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-0 block">
              Direccion
            </label>
            <input
              className="w-full bg-white border border-[#cfcfd4] rounded px-2 py-0 text-xs font-medium text-zinc-900 h-[24px] outline-none focus:border-[#d97706]"
              placeholder="Direccion..."
              value={draft.deliveryAddress}
              onChange={(event) => onDeliveryAddressChange(event.target.value)}
              disabled={readOnly}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
