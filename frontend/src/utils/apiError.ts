/**
 * Normalizes axios errors to a user-friendly message (PT).
 * Covers: timeout, network, 401, 403, 404, 429, 5xx and other 4xx.
 */

const BACKEND_MESSAGE_KEY = "message";

type AxiosErrorLike = {
  code?: string;
  response?: { status?: number; data?: Record<string, unknown> };
  request?: unknown;
  message?: string;
};

/**
 * Returns a friendly message for the given axios error.
 * Uses backend response.data.message when it adds value (e.g. validation errors).
 */
export function mapApiError(error: unknown): string {
  const err = error as AxiosErrorLike;
  const status = err?.response?.status;
  const backendMessage =
    typeof err?.response?.data === "object" &&
    err.response.data !== null &&
    BACKEND_MESSAGE_KEY in err.response.data
      ? String((err.response.data as Record<string, unknown>)[BACKEND_MESSAGE_KEY])
      : "";

  // Timeout
  if (err?.code === "ECONNABORTED") {
    return "O pedido demorou demasiado. Tente novamente.";
  }

  // No response (network / CORS / server down)
  if (!err?.response && err?.request) {
    return "Serviço indisponível. Verifique a ligação e tente novamente.";
  }

  // HTTP status
  if (typeof status === "number") {
    switch (status) {
      case 401:
        return backendMessage || "Sessão expirada ou inválida. Faça login novamente.";
      case 403:
        return backendMessage || "Não tem permissão para esta ação.";
      case 404:
        return backendMessage || "Recurso não encontrado.";
      case 429:
        return backendMessage || "Muitos pedidos. Aguarde um momento e tente novamente.";
      default:
        if (status >= 500) {
          return backendMessage || "Erro no servidor. Tente mais tarde.";
        }
        // 400 and other 4xx: prefer backend message
        return backendMessage || "Erro na requisição. Tente novamente.";
    }
  }

  return err?.message || "Ocorreu um erro inesperado. Tente novamente.";
}
