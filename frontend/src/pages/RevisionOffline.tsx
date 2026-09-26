import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { OfflineIssue, OfflineIssueType } from "../lib/types";
import { useOfflineIssues } from "../stores/offlineIssues";
import { PageHeader } from "../components/ui/PageHeader";
import { TabPills } from "../components/ui/TabPills";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Alert } from "../components/ui/Alert";
import { StatusBadge, type BadgeTone } from "../components/ui/StatusBadge";
import { ghostBtnCls } from "../components/ui/inputs";

const issueLabels: Record<OfflineIssueType, { label: string; tone: BadgeTone }> = {
  NEGATIVE_STOCK: { label: "Vendido sin stock", tone: "warning" },
  OVERPAYMENT: { label: "Abono mayor al saldo", tone: "warning" },
  LOAN_NOT_FOUND: { label: "Préstamo que ya no existe", tone: "danger" },
  LOAN_ALREADY_CLOSED: { label: "Préstamo ya cerrado", tone: "danger" },
  CASH_ALREADY_OPEN: { label: "Caja ya estaba abierta", tone: "info" },
  NO_CASH_SESSION: { label: "Sin caja abierta", tone: "warning" },
  REJECTED: { label: "No se pudo guardar", tone: "danger" },
};

type Status = "open" | "resolved";

// Avisos de lo registrado sin internet que no cuadró al enviarse: ventas sin
// stock, abonos mayores al saldo, etc. Todo quedó guardado; el administrador
// revisa cada caso y lo marca como revisado.
export default function RevisionOffline() {
  const refreshCount = useOfflineIssues((s) => s.refresh);
  const [status, setStatus] = useState<Status>("open");
  const [issues, setIssues] = useState<OfflineIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setIssues(await api.get<OfflineIssue[]>(`/sync/issues?status=${status}`, { fresh: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar los avisos");
    }
    setLoading(false);
  }, [status]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const resolve = async (id: string) => {
    setResolving(id);
    try {
      await api.post(`/sync/issues/${id}/resolve`);
      setIssues((list) => list.filter((i) => i.id !== id));
      void refreshCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al marcar el aviso");
    }
    setResolving(null);
  };

  return (
    <div>
      <PageHeader
        title="Revisión sin conexión"
        subtitle="Lo registrado sin internet que no cuadró al enviarse. Ya quedó guardado en el sistema: revisa cada caso y márcalo como revisado."
      >
        <TabPills
          tabs={[
            { key: "open", label: "Por revisar" },
            { key: "resolved", label: "Revisados" },
          ]}
          active={status}
          onChange={setStatus}
        />
      </PageHeader>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : issues.length === 0 ? (
        <EmptyState
          message={status === "open" ? "No hay nada pendiente por revisar" : "Aún no hay avisos revisados"}
        />
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => {
            const kind = issueLabels[issue.type];
            return (
              <Card key={issue.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <StatusBadge tone={kind.tone}>{kind.label}</StatusBadge>
                  <span>{issue.branch.name}</span>
                  <span>· {issue.user.username}</span>
                  <span>· ocurrió {formatDateTime(issue.occurredAt)}</span>
                  <span>· se envió {formatDateTime(issue.createdAt)}</span>
                </div>
                <p className="text-sm text-white">{issue.message}</p>
                {status === "open" ? (
                  <button
                    onClick={() => resolve(issue.id)}
                    disabled={resolving === issue.id}
                    className={`${ghostBtnCls} disabled:opacity-50`}
                  >
                    {resolving === issue.id ? "Guardando..." : "Marcar como revisado"}
                  </button>
                ) : (
                  <p className="text-xs text-slate-500">
                    Revisado por {issue.resolvedBy?.username ?? "—"}
                    {issue.resolvedAt && ` · ${formatDateTime(issue.resolvedAt)}`}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
