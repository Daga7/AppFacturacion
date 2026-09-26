import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/auth";
import { OFFLINE_LIMIT_MS, useConnection } from "../lib/offline/connection";
import { useOfflineQueue } from "../lib/offline/queue";
import { hasTokensForSync } from "../lib/offline/tokens";
import { formatTime } from "../lib/format";

const ago = (from: number, now: number) => {
  const minutes = Math.max(0, Math.round((now - from) / 60_000));
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

// "1 registro hecho" / "3 registros hechos".
const records = (n: number) => (n === 1 ? "1 registro hecho" : `${n} registros hechos`);

// Franja superior con el estado de la conexión y de lo registrado sin
// internet. No se muestra cuando hay conexión y no hay nada pendiente.
export function ConnectionBanner() {
  const user = useAuthStore((s) => s.user);
  const online = useConnection((s) => s.online);
  const lastOnlineAt = useConnection((s) => s.lastOnlineAt);
  const dataSavedAt = useConnection((s) => s.dataSavedAt);
  const operations = useOfflineQueue((s) => s.operations);
  const syncing = useOfflineQueue((s) => s.syncing);
  const syncError = useOfflineQueue((s) => s.syncError);
  const notices = useOfflineQueue((s) => s.notices);
  const dismissNotices = useOfflineQueue((s) => s.dismissNotices);

  // Reloj para los "hace X min", actualizado cada minuto.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const isCashier = user?.role === "CASHIER";
  const limitAt = lastOnlineAt ? lastOnlineAt + OFFLINE_LIMIT_MS : null;
  const limitReached = !limitAt || now > limitAt;
  // Registros de otros usuarios que no se pueden enviar hasta que ingresen.
  const waiting = operations.filter((o) => o.userId !== user?.id && !hasTokensForSync(o.userId));
  const waitingNames = [...new Set(waiting.map((o) => o.username))].join(", ");
  const sendable = operations.length - waiting.length;

  const lines: { tone: "warning" | "danger" | "info"; text: string }[] = [];

  if (!online) {
    if (isCashier && limitReached) {
      lines.push({
        tone: "danger",
        text: "Llevas más de 10 horas sin conexión: conéctate a internet para seguir registrando.",
      });
    } else {
      const parts = ["Sin conexión"];
      if (dataSavedAt) parts.push(`mostrando datos guardados ${ago(dataSavedAt, now)}`);
      if (isCashier && limitAt) parts.push(`puedes registrar hasta las ${formatTime(new Date(limitAt).toISOString())}`);
      lines.push({ tone: "warning", text: parts.join(" · ") });
    }
  }
  if (sendable > 0) {
    lines.push({
      tone: "info",
      text:
        online && syncing
          ? `Enviando ${records(sendable)} sin conexión...`
          : `${records(sendable)} sin conexión por enviar${online ? "" : "; se enviará todo solo al volver el internet"}.`,
    });
  }
  if (waiting.length > 0) {
    lines.push({
      tone: "warning",
      text: `Lo registrado sin conexión por ${waitingNames} (${waiting.length}) se enviará cuando ingrese con internet en este equipo.`,
    });
  }
  if (online && syncError && sendable > 0) {
    lines.push({ tone: "danger", text: `No se pudo enviar lo pendiente (se reintenta solo): ${syncError}` });
  }

  if (lines.length === 0 && notices.length === 0) return null;

  const toneCls = {
    warning: "bg-yellow-900/30 border-yellow-800 text-yellow-300",
    danger: "bg-red-900/30 border-red-800 text-red-300",
    info: "bg-brand/15 border-brand/40 text-brand-light",
  };

  return (
    <div className="space-y-2 mb-4">
      {lines.map((line) => (
        <div key={line.text} className={`p-3 border rounded-lg text-sm ${toneCls[line.tone]}`}>
          {line.text}
        </div>
      ))}
      {notices.length > 0 && (
        <div className={`p-3 border rounded-lg text-sm space-y-1 ${toneCls.danger}`}>
          {notices.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
          <button onClick={dismissNotices} className="underline">
            Entendido
          </button>
        </div>
      )}
    </div>
  );
}
