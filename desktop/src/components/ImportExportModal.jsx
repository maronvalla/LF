import { useState, useCallback } from "react";
import api from "../api";

export default function ImportExportModal({ entity, entityLabel, onClose, onSuccess }) {
  const [mode, setMode] = useState("menu"); // menu, import, preview, result
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const ext = droppedFile.name.toLowerCase().split(".").pop();
      if (["csv", "xlsx", "xls"].includes(ext)) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError("Solo se permiten archivos CSV o Excel (.xlsx, .xls)");
      }
    }
  }, []);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const downloadTemplate = async (format = "csv") => {
    setLoading(true);
    try {
      const response = await api.get(`/import-export/template/${entity}?format=${format}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${entity}_plantilla.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError("Error al descargar plantilla");
    } finally {
      setLoading(false);
    }
  };

  const exportData = async (format = "csv") => {
    setLoading(true);
    try {
      const response = await api.get(`/import-export/export/${entity}?format=${format}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `${entity}_export_${new Date().toISOString().slice(0, 10)}.${format}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError("Error al exportar datos");
    } finally {
      setLoading(false);
    }
  };

  const validateFile = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post(`/import-export/validate/${entity}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(response.data);
      setMode("preview");
    } catch (err) {
      setError(err.response?.data?.message || "Error al validar archivo");
    } finally {
      setLoading(false);
    }
  };

  const importFile = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post(`/import-export/import/${entity}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(response.data);
      setMode("result");
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || "Error al importar datos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] grid place-items-center p-6">
      <div className="w-full max-w-2xl bg-graphite-950 border-2 border-zinc-800 rounded-2xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-burnt-500 uppercase">
            Import/Export {entityLabel}
          </h2>
          <button
            className="text-zinc-500 hover:text-white text-2xl"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="bg-rose-600/20 border border-rose-600 text-rose-300 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Menu Mode */}
        {mode === "menu" && (
          <div className="space-y-4">
            {/* Templates */}
            <div>
              <div className="text-xs text-zinc-500 uppercase font-bold mb-2">Descargar Plantilla</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="card bg-zinc-900 hover:bg-zinc-800 border-zinc-700 p-4 flex items-center gap-3 transition-colors"
                  onClick={() => downloadTemplate("csv")}
                  disabled={loading}
                >
                  <span className="text-2xl">📄</span>
                  <div className="text-left">
                    <span className="text-sm font-bold block">CSV</span>
                    <span className="text-[10px] text-zinc-500">Plantilla vacia</span>
                  </div>
                </button>
                <button
                  className="card bg-zinc-900 hover:bg-zinc-800 border-zinc-700 p-4 flex items-center gap-3 transition-colors"
                  onClick={() => downloadTemplate("xlsx")}
                  disabled={loading}
                >
                  <span className="text-2xl">📊</span>
                  <div className="text-left">
                    <span className="text-sm font-bold block">Excel</span>
                    <span className="text-[10px] text-zinc-500">Plantilla .xlsx</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Export */}
            <div>
              <div className="text-xs text-zinc-500 uppercase font-bold mb-2">Exportar Datos</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="card bg-zinc-900 hover:bg-zinc-800 border-zinc-700 p-4 flex items-center gap-3 transition-colors"
                  onClick={() => exportData("csv")}
                  disabled={loading}
                >
                  <span className="text-2xl">📤</span>
                  <div className="text-left">
                    <span className="text-sm font-bold block">Exportar CSV</span>
                    <span className="text-[10px] text-zinc-500">Descargar todo</span>
                  </div>
                </button>
                <button
                  className="card bg-zinc-900 hover:bg-zinc-800 border-zinc-700 p-4 flex items-center gap-3 transition-colors"
                  onClick={() => exportData("xlsx")}
                  disabled={loading}
                >
                  <span className="text-2xl">📤</span>
                  <div className="text-left">
                    <span className="text-sm font-bold block">Exportar Excel</span>
                    <span className="text-[10px] text-zinc-500">Descargar .xlsx</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Import */}
            <div>
              <div className="text-xs text-zinc-500 uppercase font-bold mb-2">Importar Datos</div>
              <button
                className="w-full card bg-burnt-500/20 hover:bg-burnt-500/30 border-burnt-500 p-4 flex items-center gap-3 transition-colors"
                onClick={() => setMode("import")}
                disabled={loading}
              >
                <span className="text-2xl">📥</span>
                <div className="text-left">
                  <span className="text-sm font-bold block">Importar</span>
                  <span className="text-[10px] text-burnt-300">Subir archivo CSV o Excel</span>
                </div>
              </button>
            </div>

            {loading && (
              <div className="text-center text-zinc-500 py-4 animate-pulse">
                Procesando...
              </div>
            )}
          </div>
        )}

        {/* Import Mode - File Selection */}
        {mode === "import" && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                dragOver
                  ? "border-burnt-500 bg-burnt-500/10"
                  : "border-zinc-700 hover:border-zinc-500"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="space-y-2">
                  <span className="text-4xl">{file.name.endsWith(".xlsx") || file.name.endsWith(".xls") ? "📊" : "📄"}</span>
                  <p className="text-burnt-500 font-bold">{file.name}</p>
                  <p className="text-zinc-500 text-sm">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    className="text-rose-400 text-sm hover:underline"
                    onClick={() => setFile(null)}
                  >
                    Cambiar archivo
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-4xl">📂</span>
                  <p className="text-zinc-400">Arrastra tu archivo CSV o Excel aqui</p>
                  <p className="text-zinc-600 text-sm">o</p>
                  <label className="btn btn-muted cursor-pointer inline-block">
                    Seleccionar archivo
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                className="btn btn-muted px-6"
                onClick={() => {
                  setMode("menu");
                  setFile(null);
                }}
              >
                Volver
              </button>
              <button
                className="btn btn-burnt px-6"
                onClick={validateFile}
                disabled={!file || loading}
              >
                {loading ? "Validando..." : "Validar y Preview"}
              </button>
            </div>
          </div>
        )}

        {/* Preview Mode */}
        {mode === "preview" && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="card bg-zinc-900 p-4">
                <div className="text-zinc-500 text-xs uppercase mb-1">Total filas</div>
                <div className="text-2xl font-black text-white">{preview.total}</div>
              </div>
              <div className="card bg-zinc-900 p-4">
                <div className="text-zinc-500 text-xs uppercase mb-1">Errores</div>
                <div
                  className={`text-2xl font-black ${
                    preview.errors.length > 0 ? "text-rose-500" : "text-emerald-500"
                  }`}
                >
                  {preview.errors.length}
                </div>
              </div>
            </div>

            {/* New entities to create */}
            {(preview.toCreate?.categories?.length > 0 ||
              preview.toCreate?.brands?.length > 0 ||
              preview.toCreate?.rubros?.length > 0 ||
              preview.toCreate?.suppliers?.length > 0) && (
              <div className="card bg-emerald-900/20 border-emerald-700 p-4">
                <div className="text-emerald-400 text-sm font-bold mb-2">
                  Se crearan automaticamente:
                </div>
                <div className="space-y-1 text-sm">
                  {preview.toCreate?.categories?.length > 0 && (
                    <div>
                      <span className="text-zinc-400">Categorias:</span>{" "}
                      <span className="text-emerald-300">
                        {preview.toCreate.categories.join(", ")}
                      </span>
                    </div>
                  )}
                  {preview.toCreate?.brands?.length > 0 && (
                    <div>
                      <span className="text-zinc-400">Marcas:</span>{" "}
                      <span className="text-emerald-300">
                        {preview.toCreate.brands.join(", ")}
                      </span>
                    </div>
                  )}
                  {preview.toCreate?.rubros?.length > 0 && (
                    <div>
                      <span className="text-zinc-400">Rubros:</span>{" "}
                      <span className="text-emerald-300">
                        {preview.toCreate.rubros.join(", ")}
                      </span>
                    </div>
                  )}
                  {preview.toCreate?.suppliers?.length > 0 && (
                    <div>
                      <span className="text-zinc-400">Proveedores:</span>{" "}
                      <span className="text-emerald-300">
                        {preview.toCreate.suppliers.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Errors list */}
            {preview.errors.length > 0 && (
              <div className="card bg-rose-900/20 border-rose-700 p-4 max-h-40 overflow-auto">
                <div className="text-rose-400 text-sm font-bold mb-2">Errores encontrados:</div>
                <div className="space-y-1 text-sm">
                  {preview.errors.map((err, idx) => (
                    <div key={idx} className="text-rose-300">
                      Fila {err.row}: {err.field} - {err.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                className="btn btn-muted px-6"
                onClick={() => {
                  setMode("import");
                  setPreview(null);
                }}
              >
                Volver
              </button>
              <button
                className="btn btn-burnt px-6"
                onClick={importFile}
                disabled={loading || preview.errors.length > 0}
              >
                {loading ? "Importando..." : "Confirmar Importacion"}
              </button>
            </div>
          </div>
        )}

        {/* Result Mode */}
        {mode === "result" && result && (
          <div className="space-y-4">
            <div
              className={`text-center py-6 ${
                result.success ? "text-emerald-500" : "text-rose-500"
              }`}
            >
              <span className="text-5xl">{result.success ? "✓" : "✗"}</span>
              <div className="text-xl font-black mt-2">
                {result.success ? "Importacion Exitosa" : "Importacion con errores"}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="card bg-zinc-900 p-4 text-center">
                <div className="text-zinc-500 text-xs uppercase mb-1">Total</div>
                <div className="text-2xl font-black text-white">
                  {result.summary?.total || 0}
                </div>
              </div>
              <div className="card bg-zinc-900 p-4 text-center">
                <div className="text-zinc-500 text-xs uppercase mb-1">Importados</div>
                <div className="text-2xl font-black text-emerald-500">
                  {result.summary?.imported || 0}
                </div>
              </div>
              <div className="card bg-zinc-900 p-4 text-center">
                <div className="text-zinc-500 text-xs uppercase mb-1">Errores</div>
                <div className="text-2xl font-black text-rose-500">
                  {result.summary?.errors || 0}
                </div>
              </div>
            </div>

            {/* Created entities */}
            {(result.summary?.created?.categories?.length > 0 ||
              result.summary?.created?.brands?.length > 0 ||
              result.summary?.created?.rubros?.length > 0 ||
              result.summary?.created?.suppliers?.length > 0) && (
              <div className="card bg-emerald-900/20 border-emerald-700 p-4">
                <div className="text-emerald-400 text-sm font-bold mb-2">
                  Entidades creadas:
                </div>
                <div className="space-y-1 text-sm">
                  {result.summary?.created?.categories?.length > 0 && (
                    <div>
                      <span className="text-zinc-400">Categorias:</span>{" "}
                      <span className="text-emerald-300">
                        {result.summary.created.categories.join(", ")}
                      </span>
                    </div>
                  )}
                  {result.summary?.created?.brands?.length > 0 && (
                    <div>
                      <span className="text-zinc-400">Marcas:</span>{" "}
                      <span className="text-emerald-300">
                        {result.summary.created.brands.join(", ")}
                      </span>
                    </div>
                  )}
                  {result.summary?.created?.rubros?.length > 0 && (
                    <div>
                      <span className="text-zinc-400">Rubros:</span>{" "}
                      <span className="text-emerald-300">
                        {result.summary.created.rubros.join(", ")}
                      </span>
                    </div>
                  )}
                  {result.summary?.created?.suppliers?.length > 0 && (
                    <div>
                      <span className="text-zinc-400">Proveedores:</span>{" "}
                      <span className="text-emerald-300">
                        {result.summary.created.suppliers.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Import errors */}
            {result.errors?.length > 0 && (
              <div className="card bg-rose-900/20 border-rose-700 p-4 max-h-40 overflow-auto">
                <div className="text-rose-400 text-sm font-bold mb-2">Errores:</div>
                <div className="space-y-1 text-sm">
                  {result.errors.map((err, idx) => (
                    <div key={idx} className="text-rose-300">
                      Fila {err.row}: {err.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button className="btn btn-burnt px-8" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
