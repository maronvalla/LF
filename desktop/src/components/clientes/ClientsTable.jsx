import { getDefaultPriceListKey, getPriceListLabel } from "../../utils/priceLists";

export default function ClientsTable({
  rows,
  filteredRows,
  priceLists,
  priceListsConfig,
  onEdit,
  onDelete,
}) {
  return (
    <div className="flex-1 bg-[#121212] border border-zinc-800/80 rounded-xl flex flex-col min-h-0 overflow-hidden relative">
      <div className="flex-1 overflow-auto">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-[#1a1a1a] text-zinc-400 text-[10px] uppercase tracking-widest sticky top-0 z-10 shadow-sm border-b border-zinc-800/80">
            <tr>
              <th className="px-5 py-4 font-bold w-[24%]">Nombre / Razon Social</th>
              <th className="px-5 py-4 font-bold w-[12%]">Telefono</th>
              <th className="px-5 py-4 font-bold w-[30%]">Direccion</th>
              <th className="px-5 py-4 font-bold w-[10%]">Codigo</th>
              <th className="px-5 py-4 font-bold w-[12%]">Lista Precio</th>
              <th className="px-5 py-4 font-bold w-[10%] text-center">Cta. Cte.</th>
              <th className="px-5 py-4 font-bold text-center w-[6%]">GPS</th>
              <th className="px-5 py-4 font-bold text-center w-[6rem]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-zinc-600">
                  No hay clientes registrados.
                </td>
              </tr>
            ) : (
              filteredRows.map((client) => (
                <tr key={client.id} className="hover:bg-zinc-800/30 transition-colors group">
                  <td
                    className="px-5 py-3 font-bold text-white cursor-pointer truncate"
                    onClick={() => onEdit(client)}
                    title={client.name}
                  >
                    {client.name}
                  </td>
                  <td className="px-5 py-3 text-zinc-400 truncate" title={client.phone || "-"}>
                    {client.phone || "-"}
                  </td>
                  <td className="px-5 py-3 text-zinc-400 truncate" title={client.address || "-"}>
                    {client.address || "-"}
                  </td>
                  <td className="px-5 py-3 text-zinc-300 font-mono truncate" title={client.code || "-"}>
                    {client.code || "-"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/20">
                      {getPriceListLabel(
                        priceLists,
                        client.preferred_price_list || getDefaultPriceListKey(priceListsConfig)
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {client.enable_current_account || client.enableCurrentAccount ? (
                      <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        Habilitada
                      </span>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {client.latitude && client.longitude ? (
                      <span className="text-cyan-400" title={`${client.latitude}, ${client.longitude}`}>
                        <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </span>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(client);
                        }}
                        className="bg-zinc-800 hover:bg-[#e85d04] text-zinc-400 hover:text-white p-1.5 rounded transition-colors"
                        title="Editar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(client.id);
                        }}
                        className="bg-zinc-800 hover:bg-rose-500 text-zinc-400 hover:text-white p-1.5 rounded transition-colors"
                        title="Eliminar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
