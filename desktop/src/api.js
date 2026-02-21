import axios from "axios";

const host =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "localhost";
const rawApiUrl = (import.meta.env.VITE_API_URL || "").trim();
const normalizedApiUrl = rawApiUrl
  ? rawApiUrl.replace(/\/+$/, "")
  : `http://${host}:4000/api`;
const baseURL = normalizedApiUrl.endsWith("/api")
  ? normalizedApiUrl
  : `${normalizedApiUrl}/api`;
export const apiOrigin = normalizedApiUrl.replace(/\/api$/i, "");

function ensureSocketPort4000(urlLike) {
  const trimmed = String(urlLike || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.port) return parsed.origin;
    return `${parsed.protocol}//${parsed.hostname}:4000`;
  } catch {
    const hasPort = /:\d+$/.test(trimmed);
    return hasPort ? trimmed : `${trimmed}:4000`;
  }
}

// Socket.IO necesita conectarse directo al puerto 4000.
const rawSocketUrl = (import.meta.env.VITE_SOCKET_URL || "").trim();
export const socketOrigin =
  ensureSocketPort4000(rawSocketUrl) || ensureSocketPort4000(apiOrigin);

const api = axios.create({
  baseURL,
});

export function setToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem("lf_token", token);
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem("lf_token");
  }
}

export function hydrateToken() {
  const token = localStorage.getItem("lf_token");
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  }
  return token;
}

// Import/Export functions
export async function downloadTemplate(entity) {
  const response = await api.get(`/import-export/template/${entity}`, {
    responseType: "blob",
  });
  return response.data;
}

export async function exportData(entity) {
  const response = await api.get(`/import-export/export/${entity}`, {
    responseType: "blob",
  });
  return response.data;
}

export async function validateImport(entity, file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/import-export/validate/${entity}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function importData(entity, file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/import-export/import/${entity}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export default api;
