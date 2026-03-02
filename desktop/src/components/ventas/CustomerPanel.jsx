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
  onCustomerNameChange,
  shiftOptions = [],
  onShiftChange,
  onPaymentConditionChange,
  onDeliveryAddressChange,
  readOnly = false,
}) {
  const lightSelectStyle = { colorScheme: "light" };
  const lightOptionStyle = { color: "#18181b", backgroundColor: "#ffffff" };

  return (
    <div className="bg-[#ededee] border border-[#d1d1d4] rounded-xl p-2.5 flex flex-col gap-2 shrink-0">
      <div className="text-[16px] md:text-[18px] leading-none font-black text-zinc-900">
        Identificacion del Cliente
      </div>
      <div className="flex flex-col gap-2 w-full">
        <div className="w-full">
          <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">
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
            placeholder="Buscar cliente o escribir nombre para mostrador"
            theme="light"
            inputClassName="bg-white border-[#cfcfd4] rounded-lg px-3 py-2 text-sm font-medium text-zinc-900 placeholder:text-zinc-500 focus:border-[#d97706]"
            dropdownClassName="bg-white border-[#cfcfd4]"
            optionClassName="border-[#ececf1]"
            className={readOnly ? "pointer-events-none opacity-70" : ""}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#d7d7db] mt-1">
        <div className="flex gap-2">
          <button
            className="bg-white hover:bg-zinc-50 text-[#b26a1e] border border-[#caa57f] rounded-lg px-4 h-[38px] flex items-center justify-center transition-colors text-[11px] font-black uppercase"
            onClick={() => customerSelectRef.current?.focus()}
            type="button"
            disabled={readOnly}
          >
            Buscar
          </button>
          <button
            className="bg-[#f07c0f] hover:bg-[#df6f08] text-white border border-[#d86b07] rounded-lg px-4 h-[38px] flex items-center justify-center transition-colors text-[11px] font-black uppercase"
            onClick={onOpenQuickClient}
            type="button"
            disabled={readOnly}
          >
            Registrar
          </button>
        </div>
        <div
          className="flex items-center h-[38px] px-3 gap-2 bg-white border border-[#cfcfd4] rounded-lg cursor-pointer select-none"
          onClick={() => !readOnly && onToggleDelivery()}
        >
          <span className="text-[10px] text-zinc-600 uppercase font-black tracking-wide">Es Envio</span>
          <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${isDelivery ? "bg-[#f07c0f]" : "bg-zinc-400"}`}>
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isDelivery ? "translate-x-4" : "translate-x-0"}`} />
          </div>
        </div>
      </div>

      {isDelivery ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">
              Salida Est.
            </label>
            <select
              className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-xs md:text-sm font-semibold text-zinc-800 outline-none focus:border-[#d97706]"
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
          <div>
            <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">
              Condicion
            </label>
            <select
              className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-xs md:text-sm font-semibold text-zinc-800 outline-none focus:border-[#d97706]"
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
          <div className="col-span-1 sm:col-span-2">
            <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">
              Direccion de Entrega
            </label>
            <input
              className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-xs md:text-sm font-medium text-zinc-900 outline-none focus:border-[#d97706]"
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
