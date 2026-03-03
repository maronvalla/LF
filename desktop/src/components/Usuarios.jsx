import { Fragment, useEffect, useRef, useState } from "react";
import api from "../api";
import ConfirmModal from "./ventas/ConfirmModal";

export default function Usuarios({ user, setToast }) {
  const [rows, setRows] = useState([]);
  const [sellerAliasesByUser, setSellerAliasesByUser] = useState({});
  const [sellerAliasDrafts, setSellerAliasDrafts] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolverRef = useRef(null);

  const showConfirm = (message) =>
    new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({ message });
    });

  const resolveConfirm = (value) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmState(null);
    if (typeof resolver === "function") resolver(Boolean(value));
  };


  const [draft, setDraft] = useState({
    username: "",
    fullName: "",
    password: "",
    role: "VENDEDOR",
    isActive: true
  });

  const fetchUsers = async () => {
    try {
      if (String(user?.role || "").toUpperCase() !== "ADMIN") return;
      const [usersRes, aliasesRes] = await Promise.all([
        api.get("/users"),
        api.get("/settings/seller-aliases"),
      ]);
      setRows(usersRes.data || []);
      setSellerAliasesByUser(aliasesRes.data?.aliasesByUser || {});
    } catch {
      setRows([]);
      setSellerAliasesByUser({});
      setToast?.({ message: "No se pudieron cargar usuarios", type: "error" });
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [user?.role, setToast]);

  useEffect(() => {
    const nextDrafts = {};
    rows.forEach((row) => {
      nextDrafts[row.id] = "";
    });
    setSellerAliasDrafts(nextDrafts);
  }, [rows]);

  const openNew = () => {
    setDraft({
      username: "",
      fullName: "",
      password: "",
      role: "VENDEDOR",
      isActive: true
    });
    setShowModal(true);
  };

  const openPasswordModal = (row) => {
    setPasswordModalUser(row);
    setPasswordDraft("");
  };

  const closePasswordModal = () => {
    setPasswordModalUser(null);
    setPasswordDraft("");
  };

  const saveUser = async () => {
    try {
      if (!draft.username || !draft.fullName || !draft.password) {
        setToast?.({ message: "Complete todos los campos obligatorios", type: "warning" });
        return;
      }

      const payload = {
        username: draft.username.trim(),
        fullName: draft.fullName.trim(),
        password: draft.password,
        role: draft.role,
        isActive: draft.isActive
      };

      await api.post("/users", payload);
      setToast?.({ message: "Usuario creado exitosamente", type: "success" });
      setShowModal(false);
      fetchUsers();
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "Error al crear usuario",
        type: "error"
      });
    }
  };

  const deleteUser = async (row) => {
    const label = row.full_name || row.username || "este usuario";
    const confirmed = await showConfirm(`¿Seguro que quieres borrar a ${label}?`);
    if (!confirmed) return;

    try {
      await api.delete(`/users/${row.id}`);
      setToast?.({ message: "Usuario borrado correctamente", type: "success" });
      fetchUsers();
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo borrar el usuario",
        type: "error",
      });
    }
  };

  const updatePassword = async () => {
    const nextPassword = String(passwordDraft || "");
    if (nextPassword.trim().length < 6) {
      setToast?.({ message: "La contrasena debe tener al menos 6 caracteres", type: "warning" });
      return;
    }

    try {
      await api.put(`/users/${passwordModalUser.id}/password`, {
        password: nextPassword,
      });
      setToast?.({ message: "Contrasena actualizada correctamente", type: "success" });
      closePasswordModal();
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo actualizar la contrasena",
        type: "error",
      });
    }
  };

  const saveSellerAliases = async (nextAliasesByUser) => {
    try {
      const payload = { aliasesByUser: nextAliasesByUser };
      const { data } = await api.put("/settings/seller-aliases", payload);
      setSellerAliasesByUser(data?.aliasesByUser || {});
      return true;
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudieron guardar los nombres operativos",
        type: "error",
      });
      return false;
    }
  };

  const addSellerAlias = async (row) => {
    const value = String(sellerAliasDrafts[row.id] || "").trim();
    if (!value) {
      setToast?.({ message: "Escribe un nombre operativo", type: "warning" });
      return;
    }

    const current = Array.isArray(sellerAliasesByUser[row.id]) ? sellerAliasesByUser[row.id] : [];
    if (current.some((alias) => String(alias).trim().toUpperCase() === value.toUpperCase())) {
      setToast?.({ message: "Ese nombre operativo ya existe", type: "warning" });
      return;
    }

    const next = {
      ...sellerAliasesByUser,
      [row.id]: [...current, value],
    };

    const saved = await saveSellerAliases(next);
    if (!saved) return;
    setSellerAliasDrafts((prev) => ({ ...prev, [row.id]: "" }));
    setToast?.({ message: "Nombre operativo guardado", type: "success" });
  };

  const removeSellerAlias = async (row, aliasToRemove) => {
    const confirmed = await showConfirm(`¿Seguro que quieres borrar el nombre operativo ${aliasToRemove}?`);
    if (!confirmed) return;

    const current = Array.isArray(sellerAliasesByUser[row.id]) ? sellerAliasesByUser[row.id] : [];
    const filtered = current.filter((alias) => alias !== aliasToRemove);
    const next = { ...sellerAliasesByUser };
    if (filtered.length) next[row.id] = filtered;
    else delete next[row.id];

    const saved = await saveSellerAliases(next);
    if (!saved) return;
    setToast?.({ message: "Nombre operativo borrado", type: "success" });
  };

  if (String(user?.role || "").toUpperCase() !== "ADMIN") {
    return <div className="card rounded-lg p-6 bg-zinc-900 border-zinc-800">Solo ADMIN</div>;
  }

  const visibleRows = rows.filter((row) => row.is_active);

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex justify-between items-end px-2">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight uppercase">Usuarios</h2>
          <p className="text-xs text-zinc-400 mt-1">Gestión de accesos y roles (Solo Administradores)</p>
        </div>
        <button
          onClick={openNew}
          className="bg-[#e85d04] hover:bg-[#d14f00] text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
        >
          <span>Nuevo Usuario</span>
        </button>
      </div>

      <div className="flex-1 bg-[#121212] border border-zinc-800/80 rounded-xl flex flex-col min-h-0 overflow-hidden relative">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#1a1a1a] text-zinc-400 text-[10px] uppercase tracking-widest sticky top-0 z-10 shadow-sm border-b border-zinc-800/80">
              <tr>
                <th className="px-5 py-4 font-bold">Usuario</th>
                <th className="px-5 py-4 font-bold">Nombre</th>
                <th className="px-5 py-4 font-bold">Rol</th>
                <th className="px-5 py-4 font-bold text-center">Activo</th>
                <th className="px-5 py-4 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-zinc-600">
                    No hay usuarios registrados.
                  </td>
                </tr>
              ) : (
                visibleRows.map((u) => (
                  <Fragment key={u.id}>
                    <tr key={u.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-5 py-3 font-bold text-white">{u.username}</td>
                      <td className="px-5 py-3 text-zinc-300">{u.full_name}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-300">
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-zinc-400">
                        {u.is_active ? "Si" : "No"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openPasswordModal(u)}
                          className="mr-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-amber-200 transition-colors hover:border-amber-400 hover:text-white"
                        >
                          Contrasena
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteUser(u)}
                          disabled={!u.is_active || String(u.id) === String(user?.id || "")}
                          className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-rose-300 transition-colors hover:border-rose-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Borrar
                        </button>
                      </td>
                    </tr>
                    {String(u.role || "").toUpperCase() === "VENDEDOR" ? (
                      <tr key={`${u.id}-aliases`} className="border-b border-zinc-800/50 bg-zinc-950/50">
                        <td colSpan={5} className="px-5 pb-4 pt-1">
                          <div className="rounded-xl border border-zinc-800 bg-[#181818] p-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                              Nombres operativos para esta cuenta
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(sellerAliasesByUser[u.id] || []).length ? (
                                sellerAliasesByUser[u.id].map((alias) => (
                                  <button
                                    key={`${u.id}-${alias}`}
                                    type="button"
                                    onClick={() => removeSellerAlias(u, alias)}
                                    className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-bold text-zinc-200 transition-colors hover:border-rose-500 hover:text-rose-300"
                                    title="Borrar nombre operativo"
                                  >
                                    {alias} ×
                                  </button>
                                ))
                              ) : (
                                <div className="text-xs text-zinc-500">No hay nombres operativos cargados.</div>
                              )}
                            </div>
                            <div className="mt-3 flex gap-2">
                              <input
                                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-sm text-white outline-none focus:border-[#e85d04]"
                                value={sellerAliasDrafts[u.id] || ""}
                                onChange={(e) =>
                                  setSellerAliasDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))
                                }
                                placeholder="Ej: JUAN / MOSTRADOR 1 / TURNO TARDE"
                              />
                              <button
                                type="button"
                                onClick={() => addSellerAlias(u)}
                                className="rounded-lg bg-[#e85d04] px-4 py-2 text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-[#d14f00]"
                              >
                                Agregar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#121212] border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl">
              <h3 className="text-lg font-black text-white uppercase tracking-wider">Nuevo Usuario</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-500 hover:text-white transition-colors"
                type="button"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Usuario *</label>
                <input
                  autoFocus
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                  value={draft.username}
                  onChange={e => setDraft({ ...draft, username: e.target.value })}
                  placeholder="ej: juanp"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Nombre Completo *</label>
                <input
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                  value={draft.fullName}
                  onChange={e => setDraft({ ...draft, fullName: e.target.value })}
                  placeholder="Juan Perez"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Contraseña *</label>
                <input
                  type="password"
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                  value={draft.password}
                  onChange={e => setDraft({ ...draft, password: e.target.value })}
                  placeholder="******"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Rol de Acceso *</label>
                <select
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm font-bold text-[#e85d04] focus:border-[#e85d04] outline-none"
                  value={draft.role}
                  onChange={e => setDraft({ ...draft, role: e.target.value })}
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="CAJERO">CAJERO</option>
                  <option value="VENDEDOR">VENDEDOR</option>
                  <option value="REPARTIDOR">REPARTIDOR</option>
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800 flex justify-end gap-3 bg-[#1a1a1a] rounded-b-2xl">
              <button
                className="px-6 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                onClick={() => setShowModal(false)}
                type="button"
              >
                CANCELAR
              </button>
              <button
                className="px-8 py-2.5 bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg text-sm font-bold shadow-lg transition-colors"
                onClick={saveUser}
              >
                REGISTRAR
              </button>
            </div>
          </div>
        </div>
      )}
      {passwordModalUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#121212] border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-wider">Cambiar contrasena</h3>
                <div className="text-xs text-zinc-500 mt-1">{passwordModalUser.full_name || passwordModalUser.username}</div>
              </div>
              <button
                onClick={closePasswordModal}
                className="text-zinc-500 hover:text-white transition-colors"
                type="button"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1 block">Nueva contrasena *</label>
                <input
                  autoFocus
                  type="password"
                  className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-[#e85d04] outline-none"
                  value={passwordDraft}
                  onChange={(e) => setPasswordDraft(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                />
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800 flex justify-end gap-3 bg-[#1a1a1a] rounded-b-2xl">
              <button
                className="px-6 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                onClick={closePasswordModal}
                type="button"
              >
                CANCELAR
              </button>
              <button
                className="px-8 py-2.5 bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg text-sm font-bold shadow-lg transition-colors"
                onClick={updatePassword}
                type="button"
              >
                GUARDAR
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmState ? (
        <ConfirmModal
          message={confirmState.message}
          onCancel={() => resolveConfirm(false)}
          onConfirm={() => resolveConfirm(true)}
        />
      ) : null}
    </div>
  );
}
