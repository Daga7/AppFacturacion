import { useConnection } from "./offline/connection";
import { readSnapshot, saveSnapshot } from "./offline/cache";

const BASE_URL = import.meta.env.VITE_BASE_URL;

// Consultas que tienen copia para trabajar sin internet: si el servidor no
// responde en este tiempo se usa la copia guardada.
const OFFLINE_GET_TIMEOUT_MS = 12_000;

// No hubo respuesta del servidor: sin internet, o Render caído/despertando.
export class OfflineError extends Error {
  constructor() {
    super("Sin conexión a internet");
    this.name = "OfflineError";
  }
}

// El servidor respondió con error (400, 401, 404...).
export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// De dónde salen los tokens de una petición. Normalmente de la sesión
// abierta; la sincronización usa también los de otros usuarios que cerraron
// sesión dejando registros sin enviar.
export interface TokenSource {
  read: () => Partial<TokenPair>;
  write: (tokens: TokenPair) => void;
}

export const sessionTokens: TokenSource = {
  read: () => ({
    accessToken: localStorage.getItem("accessToken") ?? undefined,
    refreshToken: localStorage.getItem("refreshToken") ?? undefined,
  }),
  write: ({ accessToken, refreshToken }) => {
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
  },
};

interface RequestConfig {
  tokens?: TokenSource;
  timeoutMs?: number;
}

async function send(url: string, options: RequestInit, timeoutMs?: number): Promise<Response> {
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(`${BASE_URL}${url}`, { ...options, signal: controller.signal });
    // 502-504: el servidor está caído o despertando; para la app es lo mismo
    // que no tener red.
    if (res.status >= 502 && res.status <= 504) throw new OfflineError();
    useConnection.getState().markOnline();
    return res;
  } catch (err) {
    // fetch falla con TypeError sin red y con AbortError al vencer el tiempo.
    if (
      err instanceof OfflineError ||
      err instanceof TypeError ||
      (err instanceof DOMException && err.name === "AbortError")
    ) {
      useConnection.getState().markOffline();
      throw new OfflineError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(url: string, options: RequestInit = {}, config: RequestConfig = {}): Promise<T> {
  const tokens = config.tokens ?? sessionTokens;
  const { accessToken, refreshToken } = tokens.read();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (accessToken) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await send(url, { ...options, headers }, config.timeoutMs);

  if (res.status === 401) {
    if (refreshToken && !url.includes("/auth/refresh")) {
      const refreshRes = await send(
        "/auth/refresh",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        },
        config.timeoutMs,
      );

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        tokens.write({ accessToken: data.accessToken, refreshToken: data.refreshToken });

        (headers as Record<string, string>)["Authorization"] =
          `Bearer ${data.accessToken}`;
        res = await send(url, { ...options, headers }, config.timeoutMs);
      }
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new HttpError(error.message || "Error de conexión", res.status);
  }

  // Nest responde sin cuerpo cuando el resultado es null (p. ej. no hay caja
  // abierta); res.json() fallaría con eso.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ¿Responde el servidor? Petición barata (sin base de datos).
export async function ping(): Promise<boolean> {
  try {
    await send("/", {}, 8_000);
    return true;
  } catch {
    return false;
  }
}

interface GetOptions {
  // Esquiva la caché del navegador para los datos que deben verse al
  // instante en todos los dispositivos, como las ventas del día.
  fresh?: boolean;
  // Guarda la respuesta para trabajar sin internet y, si no hay conexión,
  // devuelve la última copia guardada.
  offline?: boolean;
}

async function get<T>(url: string, opts: GetOptions = {}): Promise<T> {
  const init: RequestInit = opts.fresh
    ? { cache: "no-store", headers: { "Cache-Control": "no-cache" } }
    : {};
  if (!opts.offline) return request<T>(url, init);

  try {
    const data = await request<T>(url, init, { timeoutMs: OFFLINE_GET_TIMEOUT_MS });
    void saveSnapshot(url, data);
    return data;
  } catch (err) {
    if (!(err instanceof OfflineError)) throw err;
    const saved = await readSnapshot<T>(url);
    if (!saved) throw err;
    return saved.data;
  }
}

export const api = {
  get,
  post: <T>(url: string, data?: unknown, config?: RequestConfig) =>
    request<T>(url, { method: "POST", body: JSON.stringify(data) }, config),
  patch: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(data) }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};
