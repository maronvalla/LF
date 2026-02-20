import { useEffect, useState } from "react";
import api from "../api";

export default function Auditoria({ user, setToast }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (String(user?.role || "").toUpperCase() !== "ADMIN") return;
    api
      .get("/audit")
      .then((r) => setRows(r.data || []))
      .catch(() => {
        setRows([]);
        setToast?.({ message: "No se pudo cargar auditoria", type: "error" });
      });
  }, [user?.role, setToast]);

  if (String(user?.role || "").toUpperCase() !== "ADMIN") {
    return <div className="card rounded-lg p-6 bg-zinc-900 border-zinc-800">Sin acceso</div>;
  }

  return (
    <div className="card rounded-lg p-4 bg-zinc-900 border-zinc-800">
      <h2 className="text-xl font-black text-[#e85d04] uppercase mb-3">Auditoria</h2>
      <table className="w-full text-sm">
        <thead className="text-zinc-400 uppercase text-[10px]">
          <tr>
            <th className="text-left py-2">Fecha</th>
            <th className="text-left py-2">Actor</th>
            <th className="text-left py-2">Accion</th>
            <th className="text-left py-2">Entidad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-zinc-800">
              <td className="py-2">{new Date(r.created_at).toLocaleString()}</td>
              <td className="py-2">{r.full_name || "-"}</td>
              <td className="py-2">{r.action}</td>
              <td className="py-2">{r.entity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
