import { create } from "zustand";

// Sede seleccionada globalmente (arriba en Facturación e Informes). Se
// persiste para que la elección se mantenga entre módulos y recargas; si no
// hay selección, cada página usa la sede del usuario logueado.

interface BranchState {
  branchId: string | null;
  setBranchId: (id: string) => void;
}

export const useBranchStore = create<BranchState>((set) => ({
  branchId: localStorage.getItem("selectedBranchId"),
  setBranchId: (id: string) => {
    localStorage.setItem("selectedBranchId", id);
    set({ branchId: id });
  },
}));
