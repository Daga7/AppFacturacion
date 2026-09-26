import { createStore, get, set } from "idb-keyval";

// Última respuesta de cada consulta que se usa sin internet (productos,
// clientes, préstamos, caja, ventas del día), guardada en IndexedDB.
// Se separa por sede: dos cajeros de sedes distintas en el mismo equipo no
// comparten, por ejemplo, el estado de la caja.

const store = createStore("bodegon-cache", "snapshots");

let scope = "";
export const setSnapshotScope = (branchId: string) => {
  scope = branchId;
};

const key = (url: string) => `${scope}|${url}`;

export async function saveSnapshot(url: string, data: unknown) {
  try {
    await set(key(url), { data, savedAt: Date.now() }, store);
  } catch {
    // Sin IndexedDB (modo privado): simplemente no hay copia.
  }
}

// null = no hay copia (la copia misma puede ser null, p. ej. caja cerrada).
export async function readSnapshot<T>(url: string): Promise<{ data: T; savedAt: number } | null> {
  try {
    return (await get<{ data: T; savedAt: number }>(key(url), store)) ?? null;
  } catch {
    return null;
  }
}
