import axios from "axios";
import { AuthStorage } from "../utils/AuthStorage";
import { mapApiError } from "../utils/apiError";

/**
 * API base URL: runtime (window.APP_CONFIG.apiUrl) > build-time (VITE_API_URL) > '/api'.
 * Full URL (http/https) is used as-is; otherwise treated as path (e.g. /api).
 */
function getBaseURL(): string {
  const runtime = typeof window !== "undefined" ? window.APP_CONFIG?.apiUrl : undefined;
  const buildTime = import.meta.env.VITE_API_URL;
  const raw = runtime ?? buildTime ?? "/api";
  if (raw && (raw.startsWith("http://") || raw.startsWith("https://"))) {
    return raw.replace(/\/$/, "");
  }
  return raw || "/api";
}

export const baseURL = getBaseURL();

const createApiInstance = (contentType: string, timeout = 60000) => {
  const instance = axios.create({
    baseURL: baseURL,
    headers: {
      "Content-Type": contentType,
    },
    timeout,
  });

  instance.interceptors.request.use(
    (config) => {
      const token = AuthStorage.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      (error as { message?: string }).message = mapApiError(error);

      if (error.response?.status === 401) {
        const errorMessage = error.response?.data?.message || "";
        const isTokenError =
          errorMessage.includes("token") ||
          errorMessage.includes("Token") ||
          errorMessage.includes("expired") ||
          errorMessage.includes("invalid") ||
          errorMessage.includes("Unauthorized");

        if (isTokenError || !errorMessage) {
          AuthStorage.clearAuth();
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
        }
      }

      return Promise.reject(error);
    }
  );

  return instance;
};

export const api = createApiInstance("application/json");
export const apiFormData = createApiInstance("multipart/form-data");
export const apiLongRunning = createApiInstance("application/json", 600000); // 10 minutes for large exports
