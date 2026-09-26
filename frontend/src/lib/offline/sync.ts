import { api, HttpError, OfflineError, ping, sessionTokens, type TokenSource } from "../api";
import { useAuthStore } from "../../stores/auth";
import { useConnection } from "./connection";
import { useOfflineQueue, type PendingOperation } from "./queue";
import { dropTokensForSync, hasTokensForSync, syncTokenSource } from "./tokens";
import { prefetchCashierData } from "./cashierData";

// Envío de lo registrado sin internet a POST /sync. Corre al abrir la app, al
// volver la red, al registrar algo y cada 30 segundos mientras haya
// pendientes o no haya conexión.

export interface SyncResult {
  id: string;
  // applied: se registró. duplicate: ya había llegado antes. rejected: datos
  // inválidos, no se registró (el administrador recibe el aviso).
  status: "applied" | "duplicate" | "rejected";
  error?: string;
  result?: Record<string, unknown> | null;
  issues?: string[];
}

// online: la persona espera la respuesta y aplican las validaciones normales.
// offline: ya ocurrió; el servidor lo registra y anota lo que no cuadre.
export const toWire = (op: PendingOperation, mode: "online" | "offline") => ({
  id: op.id,
  type: op.type,
  mode,
  occurredAt: op.occurredAt,
  summary: op.summary,
  payload: op.payload,
});

const SYNC_TIMEOUT_MS = 30_000;
const BATCH_SIZE = 20;
const LOOP_MS = 30_000;
// Cada cuánto se renuevan los datos guardados mientras hay conexión.
const DATA_MAX_AGE_MS = 5 * 60 * 1000;

let running: Promise<void> | null = null;
// Se pidió otra vuelta mientras corría una (p. ej. se registró algo nuevo).
let again = false;
// Hay que descargar los datos ya, sin esperar a que envejezcan (otro usuario).
let refreshRequested = false;

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runSync();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function runSync() {
  await useOfflineQueue.getState().reload();
  const wasOnline = useConnection.getState().online;
  if (!wasOnline && !(await ping())) return;

  // Una sesión iniciada sin internet obtiene sus tokens antes de enviar.
  await useAuthStore.getState().reconnect();

  const pending = useOfflineQueue.getState().operations;
  if (pending.length > 0) await flush(pending);
  if (!useConnection.getState().online) return;

  // Datos guardados para trabajar sin internet (solo el cajero los usa).
  const user = useAuthStore.getState().user;
  const { dataSavedAt } = useConnection.getState();
  const stale = !dataSavedAt || Date.now() - dataSavedAt > DATA_MAX_AGE_MS;
  if (user?.role === "CASHIER" && !useAuthStore.getState().offlineSession) {
    if (refreshRequested || !wasOnline || pending.length > 0 || stale) {
      refreshRequested = false;
      await prefetchCashierData(user.branchId);
    }
  }
  // Volvió la red: las pantallas cambian la copia guardada por datos frescos.
  if (!wasOnline) useOfflineQueue.getState().bump();
}

// Tokens para enviar las operaciones de un usuario: los de la sesión abierta
// si es el mismo, o los que dejó guardados al cerrar sesión con pendientes.
function tokensFor(userId: string): TokenSource | null {
  if (userId === useAuthStore.getState().user?.id) {
    const { accessToken, refreshToken } = sessionTokens.read();
    return accessToken || refreshToken ? sessionTokens : null;
  }
  return hasTokensForSync(userId) ? syncTokenSource(userId) : null;
}

// Tramos consecutivos del mismo usuario, en el orden original.
function runsByUser(ops: PendingOperation[]) {
  const runs: { userId: string; ops: PendingOperation[] }[] = [];
  for (const op of ops) {
    const last = runs[runs.length - 1];
    if (last?.userId === op.userId) last.ops.push(op);
    else runs.push({ userId: op.userId, ops: [op] });
  }
  return runs;
}

async function flush(ops: PendingOperation[]) {
  const queue = useOfflineQueue.getState();
  useOfflineQueue.setState({ syncing: true });
  let applied = 0;
  try {
    for (const run of runsByUser(ops)) {
      const tokens = tokensFor(run.userId);
      // Sin tokens esperan a que ese usuario vuelva a entrar con internet.
      if (!tokens) continue;
      try {
        for (let i = 0; i < run.ops.length; i += BATCH_SIZE) {
          const batch = run.ops.slice(i, i + BATCH_SIZE);
          const { results } = await api.post<{ results: SyncResult[] }>(
            "/sync",
            { operations: batch.map((o) => toWire(o, "offline")) },
            { tokens, timeoutMs: SYNC_TIMEOUT_MS },
          );
          const done: string[] = [];
          for (const r of results) {
            const op = batch.find((o) => o.id === r.id);
            if (!op) continue;
            done.push(op.id);
            if (r.status === "rejected") {
              queue.addNotice(
                `No se pudo guardar: ${op.summary} (${r.error}). El administrador quedó avisado.`,
              );
            } else {
              applied++;
            }
          }
          await queue.remove(done);
        }
      } catch (err) {
        if (!(err instanceof HttpError && err.status === 401)) throw err;
        // Tokens vencidos: hace falta que ese usuario ingrese de nuevo.
        if (run.userId === useAuthStore.getState().user?.id) {
          useAuthStore.getState().logout();
          useAuthStore.setState({
            error: "Tu sesión venció: ingresa de nuevo para enviar lo registrado sin internet.",
          });
          return;
        }
        dropTokensForSync(run.userId);
        continue;
      }
      const stillPending = useOfflineQueue.getState().operations.some((o) => o.userId === run.userId);
      if (run.userId !== useAuthStore.getState().user?.id && !stillPending) {
        dropTokensForSync(run.userId);
      }
    }
    useOfflineQueue.setState({ syncError: null });
  } catch (err) {
    // Sin red se reintenta en la siguiente vuelta; otros errores se muestran
    // y también se reintentan (el servidor no duplica lo ya recibido).
    if (!(err instanceof OfflineError)) {
      useOfflineQueue.setState({
        syncError: err instanceof Error ? err.message : "Error al enviar lo registrado sin conexión",
      });
    }
  } finally {
    useOfflineQueue.setState({ syncing: false });
    if (applied > 0) queue.bump();
  }
}

export function startSyncLoop(): () => void {
  const trigger = () => void syncNow();
  const onOffline = () => useConnection.getState().markOffline();
  const onVisible = () => {
    if (document.visibilityState === "visible") trigger();
  };

  window.addEventListener("online", trigger);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(trigger, LOOP_MS);
  // Al entrar (o cambiar de usuario) se descargan de una vez sus datos, para
  // que pueda salir a cobrar apenas inicia sesión.
  const unsubscribe = useAuthStore.subscribe((state, prev) => {
    if (state.user && state.user.id !== prev.user?.id) {
      refreshRequested = true;
      trigger();
    }
  });

  // Pide al navegador no borrar los datos guardados por falta de espacio.
  void navigator.storage?.persist?.().catch(() => undefined);
  // Caché de la API del service worker anterior: ya no se usa.
  void globalThis.caches?.delete("api-cache").catch(() => undefined);

  trigger();
  return () => {
    window.removeEventListener("online", trigger);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(timer);
    unsubscribe();
  };
}
