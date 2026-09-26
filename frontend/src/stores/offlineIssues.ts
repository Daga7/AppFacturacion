import { create } from "zustand";
import { api } from "../lib/api";

// Cantidad de avisos sin revisar de lo registrado sin internet (insignia del
// menú del administrador).
interface OfflineIssuesState {
  open: number;
  refresh: () => Promise<void>;
}

export const useOfflineIssues = create<OfflineIssuesState>((set) => ({
  open: 0,
  refresh: async () => {
    try {
      const { open } = await api.get<{ open: number }>("/sync/issues/count", { fresh: true });
      set({ open });
    } catch {
      // Sin conexión se conserva el último valor.
    }
  },
}));
