import type { TokenPair, TokenSource } from "../api";

// Tokens de usuarios que cerraron sesión dejando registros sin enviar (por
// ejemplo, cambio de turno sin internet). Se usan solo para enviar esos
// registros y se borran al terminar.

const KEY = "pendingSyncTokens";

const readAll = (): Record<string, TokenPair> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
};

const writeAll = (all: Record<string, TokenPair>) => {
  if (Object.keys(all).length === 0) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(all));
};

export function keepTokensForSync(userId: string, tokens: TokenPair) {
  writeAll({ ...readAll(), [userId]: tokens });
}

export function hasTokensForSync(userId: string) {
  return userId in readAll();
}

// Los saca de la reserva (al volver a iniciar sesión ese usuario).
export function takeTokensForSync(userId: string): TokenPair | null {
  const all = readAll();
  const tokens = all[userId] ?? null;
  delete all[userId];
  writeAll(all);
  return tokens;
}

export function dropTokensForSync(userId: string) {
  takeTokensForSync(userId);
}

export function syncTokenSource(userId: string): TokenSource {
  return {
    read: () => readAll()[userId] ?? {},
    write: (tokens) => keepTokensForSync(userId, tokens),
  };
}
