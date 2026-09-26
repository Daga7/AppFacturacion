import { create } from "zustand";

// Estado de la conexión con el servidor. "online" lo decide la última
// petición (respondió o no), no solo navigator.onLine: el computador puede
// estar conectado al router del local sin que haya internet.

// Tiempo máximo que el cajero puede seguir registrando sin conectarse.
export const OFFLINE_LIMIT_MS = 10 * 60 * 60 * 1000;

const LAST_ONLINE_KEY = "lastOnlineAt";
const DATA_SAVED_KEY = "offlineDataSavedAt";

const readNumber = (key: string): number | null => {
  try {
    const value = Number(localStorage.getItem(key));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
};

const writeNumber = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Sin almacenamiento: el dato vive solo en memoria.
  }
};

interface ConnectionState {
  online: boolean;
  // Última vez que el servidor respondió (cuenta para el límite de 10 horas).
  lastOnlineAt: number | null;
  // Última descarga completa de los datos para trabajar sin internet.
  dataSavedAt: number | null;
  markOnline: () => void;
  markOffline: () => void;
  markDataSaved: () => void;
}

export const useConnection = create<ConnectionState>((set, get) => ({
  online: navigator.onLine,
  lastOnlineAt: readNumber(LAST_ONLINE_KEY),
  dataSavedAt: readNumber(DATA_SAVED_KEY),

  markOnline: () => {
    const now = Date.now();
    const { online, lastOnlineAt } = get();
    // Cada respuesta llega aquí: se evita re-renderizar en cada petición.
    if (online && lastOnlineAt && now - lastOnlineAt < 30_000) return;
    writeNumber(LAST_ONLINE_KEY, now);
    set({ online: true, lastOnlineAt: now });
  },

  markOffline: () => {
    if (get().online) set({ online: false });
  },

  markDataSaved: () => {
    const now = Date.now();
    writeNumber(DATA_SAVED_KEY, now);
    set({ dataSavedAt: now });
  },
}));

// ¿Se pasó el límite de horas sin conectarse? Sin ninguna conexión previa en
// este equipo tampoco se puede trabajar sin internet.
export const offlineLimitReached = () => {
  const { lastOnlineAt } = useConnection.getState();
  return lastOnlineAt === null || Date.now() - lastOnlineAt > OFFLINE_LIMIT_MS;
};

// uuid v4. crypto.randomUUID solo existe en HTTPS/localhost; en la red local
// (p. ej. probando desde la tablet) se arma con getRandomValues.
export const uuid = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
