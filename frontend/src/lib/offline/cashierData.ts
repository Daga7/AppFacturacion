import { api } from "../api";
import { todayEndISO, todayStartISO } from "../format";
import { useConnection } from "./connection";

// Consultas que el cajero necesita sin internet. Las pantallas usan estas
// mismas URLs para que coincidan con la copia guardada.
export const offlineUrls = {
  cash: "/cash/current",
  products: "/products",
  branches: "/branches",
  customers: (branchId: string) => `/customers?branchId=${branchId}`,
  loans: (branchId: string) => `/loans?branchId=${branchId}`,
  // "Ventas de hoy" = el día calendario en Colombia.
  todaySales: (branchId: string) =>
    `/sales?branchId=${branchId}&from=${todayStartISO()}&to=${todayEndISO()}&limit=200`,
};

// Descarga todo lo que el cajero usa sin internet: al entrar, al volver la
// red y cada pocos minutos, para que quien sale a cobrar lleve datos al día.
export async function prefetchCashierData(branchId: string) {
  const results = await Promise.allSettled([
    api.get(offlineUrls.cash, { offline: true }),
    api.get(offlineUrls.products, { offline: true }),
    api.get(offlineUrls.customers(branchId), { offline: true }),
    api.get(offlineUrls.loans(branchId), { offline: true }),
    api.get(offlineUrls.todaySales(branchId), { offline: true, fresh: true }),
  ]);
  // Si la red se cayó a mitad, lo que llegó fue la copia vieja.
  const connection = useConnection.getState();
  if (connection.online && results.every((r) => r.status === "fulfilled")) {
    connection.markDataSaved();
  }
}
