import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { StatusBadge } from "../components/ui/StatusBadge";
import { EmptyState } from "../components/ui/EmptyState";
import { primaryBtnCls, ghostBtnCls } from "../components/ui/inputs";

interface TgLink {
  id: string;
  chatId: string;
  label?: string | null;
  verifiedAt: string;
}

interface TgStatus {
  linked: boolean;
  links: TgLink[];
  maxLinks: number;
  pendingCode?: string | null;
}

interface LinkCode {
  code: string;
  command: string;
  expiresInMinutes: number;
  botUsername: string | null;
}

// Vinculación de la cuenta con Telegram: se pueden vincular varios chats
// (hasta el máximo que indique el backend), cada uno con su propio código.
export default function Telegram() {
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [linkCode, setLinkCode] = useState<LinkCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.get<TgStatus>("/telegram/status"));
    } catch { setError("Error al consultar el estado de Telegram"); }
    setLoading(false);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { loadStatus(); }, [loadStatus]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const generateCode = async () => {
    setSaving(true);
    setError(null);
    try {
      setLinkCode(await api.post<LinkCode>("/telegram/link-code"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el código");
    }
    setSaving(false);
  };

  const verify = async () => {
    setSaving(true);
    await loadStatus();
    const fresh = await api.get<TgStatus>("/telegram/status").catch(() => null);
    if (fresh && !fresh.pendingCode) {
      setLinkCode(null);
      setSuccess("¡Chat vinculado!");
      setStatus(fresh);
    }
    setSaving(false);
  };

  const unlink = async (link: TgLink) => {
    if (!confirm(`¿Desvincular el chat ${link.label ?? link.chatId}?`)) return;
    setSaving(true);
    try {
      await api.delete(`/telegram/links/${link.id}`);
      setSuccess("Chat desvinculado");
      await loadStatus();
    } catch { setError("Error al desvincular"); }
    setSaving(false);
  };

  const links = status?.links ?? [];
  const maxLinks = status?.maxLinks ?? 5;

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-6">Vincular Telegram</h2>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert kind="success" message={success} onClose={() => setSuccess(null)} />}

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : (
        <div className="space-y-4">
          <Card className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white font-medium">Chats vinculados</p>
              <StatusBadge tone={links.length > 0 ? "success" : "neutral"}>
                {links.length} de {maxLinks}
              </StatusBadge>
            </div>

            {links.length === 0 ? (
              <EmptyState message="Aún no hay chats vinculados" />
            ) : (
              <div className="space-y-2">
                {links.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 border border-slate-800 rounded-lg p-3">
                    <div className="min-w-0 text-sm">
                      <p className="text-white font-medium truncate">
                        {l.label ? `@${l.label}` : `Chat ${l.chatId}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        ID {l.chatId} · verificado {formatDateTime(l.verifiedAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => unlink(l)}
                      disabled={saving}
                      className="text-xs text-slate-400 hover:text-red-400 shrink-0"
                    >
                      Desvincular
                    </button>
                  </div>
                ))}
              </div>
            )}

            {links.length < maxLinks && (
              <button onClick={generateCode} disabled={saving} className={primaryBtnCls}>
                {saving ? "Generando..." : links.length > 0 ? "Vincular otro chat" : "Generar código"}
              </button>
            )}
          </Card>

          {linkCode && (
            <Card className="p-6 space-y-4">
              <p className="text-sm text-slate-400">Tu código de vinculación:</p>
              <p className="text-3xl font-bold font-mono text-brand-light tracking-wider text-center py-2">
                {linkCode.code}
              </p>
              <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
                <li>
                  Abre el bot en Telegram
                  {linkCode.botUsername ? (
                    <> : <span className="text-brand-light font-mono">@{linkCode.botUsername}</span></>
                  ) : (
                    " (el bot del negocio)"
                  )}
                  {" "}desde el dispositivo o chat que quieres vincular
                </li>
                <li>
                  Envíale este mensaje:{" "}
                  <code className="bg-slate-800 px-2 py-0.5 rounded font-mono text-emerald-400">
                    {linkCode.command}
                  </code>
                </li>
                <li>Vuelve aquí y pulsa "Verificar vinculación".</li>
              </ol>
              <p className="text-xs text-slate-500">
                El código vence en {linkCode.expiresInMinutes} minutos y sirve para un solo chat.
              </p>
              <button onClick={verify} disabled={saving} className={ghostBtnCls}>
                {saving ? "Verificando..." : "Verificar vinculación"}
              </button>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
