import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import type { RequestStatus } from "../lib/types";

export type StatusFilter = RequestStatus | "ALL";

// Ítem mínimo que cualquier lista de solicitudes maneja (traslados, precios…).
interface WithStatus {
  id: string;
  status: RequestStatus;
}

interface UseRequestListOptions {
  // Ruta base del recurso, sin barra final. Ej: "/transfers", "/price-requests".
  resource: string;
  // Estado inicial del filtro (los admin suelen arrancar en PENDING).
  initialFilter?: StatusFilter;
  // Mensajes de éxito al aprobar/rechazar.
  approveMessage?: string;
  rejectMessage?: string;
  // Efecto extra tras una acción exitosa (p. ej. recargar productos).
  onResolved?: (action: "approve" | "reject") => void;
}

// Encapsula el patrón compartido de una lista de solicitudes con flujo de
// aprobación: carga con filtro por estado, aprobar/rechazar, y flags de UI.
// Lo usan Traslados y Solicitudes de precio (y sirve para futuros módulos).
export function useRequestList<T extends WithStatus>({
  resource,
  initialFilter = "ALL",
  approveMessage = "Solicitud aprobada",
  rejectMessage = "Solicitud rechazada",
  onResolved,
}: UseRequestListOptions) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>(initialFilter);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === "ALL" ? "" : `?status=${filter}`;
      setItems(await api.get<T[]>(`${resource}${q}`));
    } catch {
      setError("Error al cargar las solicitudes");
    }
    setLoading(false);
  }, [resource, filter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const resolve = useCallback(
    async (id: string, action: "approve" | "reject") => {
      setBusyId(id);
      setError(null);
      try {
        await api.post(`${resource}/${id}/${action}`, {});
        setSuccess(action === "approve" ? approveMessage : rejectMessage);
        await load();
        onResolved?.(action);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo procesar");
      }
      setBusyId(null);
    },
    [resource, approveMessage, rejectMessage, load, onResolved],
  );

  return {
    items,
    loading,
    filter,
    setFilter,
    busyId,
    error,
    setError,
    success,
    setSuccess,
    reload: load,
    resolve,
  };
}

// Pestañas de estado estándar para las listas de solicitudes.
export const requestStatusTabs: { key: StatusFilter; label: string }[] = [
  { key: "PENDING", label: "Pendientes" },
  { key: "APPROVED", label: "Aprobadas" },
  { key: "REJECTED", label: "Rechazadas" },
  { key: "ALL", label: "Todas" },
];
