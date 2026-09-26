// Ingreso sin internet. Cada vez que un cajero entra con internet se guarda
// en este equipo una huella de su contraseña (PBKDF2 con sal, nunca la
// contraseña). Sin conexión, la contraseña escrita se compara contra esa
// huella. Solo pueden entrar así quienes ya ingresaron antes en este equipo.

export interface StoredUser {
  id: string;
  username: string;
  role: string;
  branchId: string;
  branchName: string;
}

interface Credential {
  user: StoredUser;
  salt: string;
  hash: string;
  savedAt: number;
}

const KEY = "offlineCredentials";
const ITERATIONS = 150_000;
// Igual que la vida del refresh token: pasada una semana sin entrar con
// internet hay que volver a hacerlo.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const readAll = (): Record<string, Credential> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
};

const writeAll = (all: Record<string, Credential>) =>
  localStorage.setItem(KEY, JSON.stringify(all));

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

// crypto.subtle solo existe en HTTPS o localhost.
const supported = () => typeof crypto !== "undefined" && !!crypto.subtle;

export async function rememberCredential(username: string, password: string, user: StoredUser) {
  if (user.role !== "CASHIER" || !supported()) return;
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt);
    writeAll({ ...readAll(), [username]: { user, salt: toBase64(salt), hash, savedAt: Date.now() } });
  } catch {
    // Si no se puede guardar, ese usuario simplemente no podrá entrar sin red.
  }
}

// La contraseña ya no es válida en el servidor (se cambió o se borró el usuario).
export function forgetCredential(username: string) {
  const all = readAll();
  if (!(username in all)) return;
  delete all[username];
  writeAll(all);
}

export async function verifyOffline(
  username: string,
  password: string,
): Promise<{ user: StoredUser } | { error: string }> {
  const credential = readAll()[username];
  if (!credential) {
    return {
      error:
        "Sin conexión. Para entrar sin internet, este usuario debe haber ingresado antes con internet en este equipo.",
    };
  }
  if (Date.now() - credential.savedAt > MAX_AGE_MS) {
    return {
      error:
        "Sin conexión, y hace más de 7 días que este usuario no ingresa con internet en este equipo.",
    };
  }
  if (!supported()) {
    return { error: "Sin conexión. Este navegador no permite ingresar sin internet." };
  }
  const hash = await derive(password, fromBase64(credential.salt));
  if (hash !== credential.hash) return { error: "Credenciales inválidas" };
  return { user: credential.user };
}
