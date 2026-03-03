import { useState } from "react";
import api, { isAndroidApk, setToken } from "../api";

export default function LoginView({ onLogin, onError, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    onError("");
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", { username, password });
      const role = String(data?.user?.role || "").toUpperCase();
      if (isAndroidApk && role === "VENDEDOR") {
        setToken(null);
        onError("En la APK no se permite ingresar con el rol VENDEDOR.");
        return;
      }
      setToken(data?.token);
      onLogin(data?.user || null);
    } catch (err) {
      if (!err.response) {
        onError(`No se pudo conectar con la API (${api.defaults.baseURL})`);
      } else {
        onError(err.response?.data?.message || "Login invalido");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white grid place-items-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-graphite-950 border border-zinc-800 rounded-2xl p-6 space-y-4"
      >
        <h1 className="text-xl font-black text-burnt-500 uppercase">Distribuidora La Familia</h1>
        <div>
          <label className="text-xs uppercase text-zinc-500 font-bold">Usuario</label>
          <input
            className="input mt-1"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoFocus
            autoComplete="username"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <div>
          <label className="text-xs uppercase text-zinc-500 font-bold">Contrasena</label>
          <input
            className="input mt-1"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        {error ? <div className="text-sm text-rose-400">{error}</div> : null}
        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
