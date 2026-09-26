import { create } from "zustand";
import { api, HttpError, OfflineError, ping, sessionTokens } from "../lib/api";
import { setSnapshotScope } from "../lib/offline/cache";
import {
  forgetCredential,
  rememberCredential,
  verifyOffline,
  type StoredUser,
} from "../lib/offline/credentials";
import { dropTokensForSync, keepTokensForSync, takeTokensForSync } from "../lib/offline/tokens";
import { useOfflineQueue } from "../lib/offline/queue";

type User = StoredUser;

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

const USER_KEY = "authUser";
// Sesión iniciada sin internet que el servidor aún no ha confirmado.
const OFFLINE_SESSION_KEY = "offlineSession";
const RECONNECT_MESSAGE =
  "Volvió la conexión: ingresa de nuevo para enviar lo registrado sin internet.";

// Contraseña de un ingreso sin internet, solo en memoria: al volver la red se
// usa para obtener los tokens sin pedirla otra vez.
let offlinePassword: string | null = null;

const readStoredUser = (): User | null => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? "null");
  } catch {
    return null;
  }
};

// El usuario se guarda para poder abrir la app sin internet.
function storeSession(user: User, offline: boolean) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (offline) localStorage.setItem(OFFLINE_SESSION_KEY, "1");
  else localStorage.removeItem(OFFLINE_SESSION_KEY);
  setSnapshotScope(user.branchId);
}

function clearSession() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(OFFLINE_SESSION_KEY);
  offlinePassword = null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;
  // Sesión iniciada sin internet y aún sin confirmar con el servidor.
  offlineSession: boolean;

  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => void;
  // Al volver la red, confirma con el servidor una sesión iniciada sin internet.
  reconnect: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const startOnlineSession = (data: LoginResponse, username: string, password: string) => {
    sessionTokens.write(data);
    // Si dejó registros sin enviar en otra sesión, ahora salen con estos tokens.
    dropTokensForSync(data.user.id);
    storeSession(data.user, false);
    offlinePassword = null;
    void rememberCredential(username, password, data.user);
    set({
      user: data.user,
      accessToken: data.accessToken,
      offlineSession: false,
      loading: false,
      error: null,
    });
  };

  const startOfflineSession = async (username: string, password: string) => {
    const result = await verifyOffline(username, password);
    if ("error" in result) {
      set({ error: result.error, loading: false });
      return;
    }
    // Si cerró sesión con registros sin enviar, recupera sus tokens.
    const tokens = takeTokensForSync(result.user.id);
    if (tokens) sessionTokens.write(tokens);
    offlinePassword = password;
    storeSession(result.user, true);
    set({
      user: result.user,
      accessToken: tokens?.accessToken ?? null,
      offlineSession: true,
      loading: false,
    });
  };

  // Sesión guardada desde el primer render: al recargar (con o sin red) no se
  // pasa por el login; init() la confirma luego con el servidor.
  const stored = readStoredUser();
  if (stored) setSnapshotScope(stored.branchId);

  return {
    user: stored,
    accessToken: localStorage.getItem("accessToken"),
    loading: false,
    error: null,
    offlineSession: stored !== null && localStorage.getItem(OFFLINE_SESSION_KEY) === "1",

    login: async (username: string, password: string) => {
      set({ loading: true, error: null });
      try {
        const data = await api.post<LoginResponse>("/auth/login", {
          username,
          password,
        });
        startOnlineSession(data, username, password);
      } catch (err) {
        if (err instanceof OfflineError) {
          await startOfflineSession(username, password);
          return;
        }
        // La contraseña ya no sirve en el servidor: tampoco sin internet.
        if (err instanceof HttpError && err.status === 401) forgetCredential(username);
        set({
          error: err instanceof Error ? err.message : "Error al iniciar sesión",
          loading: false,
        });
      }
    },

    logout: () => {
      const { user } = get();
      const { accessToken, refreshToken } = sessionTokens.read();
      const hasPending = useOfflineQueue
        .getState()
        .operations.some((o) => o.userId === user?.id);
      if (user && hasPending && accessToken && refreshToken) {
        keepTokensForSync(user.id, { accessToken, refreshToken });
      }
      clearSession();
      set({ user: null, accessToken: null, error: null, offlineSession: false });
    },

    init: () => {
      const token = localStorage.getItem("accessToken");
      const stored = readStoredUser();
      const offline = localStorage.getItem(OFFLINE_SESSION_KEY) === "1";

      // Con el usuario guardado la app abre al instante, con o sin red.
      if (stored) {
        setSnapshotScope(stored.branchId);
        set({ user: stored, accessToken: token, offlineSession: offline });
      }

      if (!token) {
        if (stored && offline) {
          // Ingreso sin internet sin tokens: sirve solo mientras no haya red.
          void ping().then((reachable) => {
            if (!reachable) return;
            get().logout();
            set({ error: RECONNECT_MESSAGE });
          });
        } else if (stored) {
          get().logout();
        }
        return;
      }

      api
        .get<User>("/auth/me")
        .then((user) => {
          storeSession(user, false);
          set({ user, offlineSession: false });
        })
        .catch((err) => {
          // Sin internet se sigue con el usuario guardado.
          if (err instanceof OfflineError) return;
          get().logout();
        });
    },

    reconnect: async () => {
      const { user, offlineSession } = get();
      if (!user || !offlineSession) return;
      const password = offlinePassword;
      try {
        if (password) {
          const data = await api.post<LoginResponse>("/auth/login", {
            username: user.username,
            password,
          });
          startOnlineSession(data, user.username, password);
          return;
        }
        if (!sessionTokens.read().accessToken) throw new HttpError(RECONNECT_MESSAGE, 401);
        const me = await api.get<User>("/auth/me");
        storeSession(me, false);
        set({ user: me, offlineSession: false });
      } catch (err) {
        if (err instanceof OfflineError) return;
        // La contraseña con la que entró sin internet ya no sirve en el servidor.
        if (password && err instanceof HttpError && err.status === 401) {
          forgetCredential(user.username);
        }
        get().logout();
        set({ error: RECONNECT_MESSAGE });
      }
    },
  };
});
