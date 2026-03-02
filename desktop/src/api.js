import axios from "axios";

const SESSION_EXPIRED_EVENT = "lf:session-expired";
let sessionExpiredNotified = false;

// Detectar si estamos en Capacitor (Android/iOS)
const isCapacitor =
  typeof window !== "undefined" &&
  (window.Capacitor?.isNativePlatform?.() ||
    window.location.protocol === "capacitor:" ||
    window.location.hostname === "localhost" && /android|iphone|ipad/i.test(navigator.userAgent));

// URL de producción para Capacitor
const PRODUCTION_API = "http://146.235.245.156:4000";

const host =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "localhost";
const rawApiUrl = (import.meta.env.VITE_API_URL || "").trim();

// En Capacitor, forzar la URL de producción
const normalizedApiUrl = isCapacitor
  ? PRODUCTION_API
  : rawApiUrl
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
export const socketOrigin = isCapacitor
  ? PRODUCTION_API
  : ensureSocketPort4000(rawSocketUrl) || ensureSocketPort4000(apiOrigin);

const api = axios.create({
  baseURL,
});

function notifySessionExpiredOnce() {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
}

export function setToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem("lf_token", token);
    sessionExpiredNotified = false;
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

export { SESSION_EXPIRED_EVENT };

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const hadToken =
        typeof localStorage !== "undefined" &&
        Boolean(localStorage.getItem("lf_token"));
      setToken(null);
      if (hadToken) notifySessionExpiredOnce();
    }
    return Promise.reject(error);
  }
);

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
