import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { StatusBadge } from "../components/ui/StatusBadge";
import { primaryBtnCls, secondaryBtnCls, ghostBtnCls } from "../components/ui/inputs";

interface TgStatus {
  linked: boolean;
  chatId?: string | null;
  verifiedAt?: string | null;
  pendingCode?: string | null;
}

interface LinkCode {
  code: string;
  command: string;
  expiresInMinutes: number;
  botUsername: string | null;
}

// Vinculación de la cuenta con Telegram mediante código único: el usuario lo
// genera aquí y se lo envía al bot con /vincular; el backend verifica y guarda
// el chat. Así nadie puede vincularse sin acceso al sistema.
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
    } catch { setError("Error al generar el código"); }
    setSaving(false);
  };

  const verify = async () => {
    setSaving(true);
    await loadStatus();
    setSaving(false);
    setSuccess(null);
  };

  const unlink = async () => {
    if (!confirm("¿Desvincular Telegram de tu cuenta?")) return;
    setSaving(true);
    try {
      await api.post("/telegram/unlink");
      setLinkCode(null);
      setSuccess("Telegram desvinculado");
      await loadStatus();
    } catch { setError("Error al desvincular"); }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-6">Vincular Telegram</h2>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert kind="success" message={success} onClose={() => setSuccess(null)} />}

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : status?.linked ? (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <StatusBadge tone="success">Vinculado y verificado</StatusBadge>
          </div>
          <div className="text-sm space-y-1">
            <p className="text-slate-400">
              Chat vinculado: <span className="text-white font-mono">{status.chatId}</span>
            </p>
            {status.verifiedAt && (
              <p className="text-slate-400">
                Verificado el <span className="text-white">{formatDateTime(status.verifiedAt)}</span>
              </p>
            )}
          </div>
          <button onClick={unlink} disabled={saving} className={secondaryBtnCls}>
            Desvincular
          </button>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="p-6 space-y-3">
            <p className="text-white font-medium">Conecta tu cuenta con el bot de Telegram</p>
            <p className="text-sm text-slate-400">
              Genera un código único, envíaselo al bot y tu cuenta quedará
              vinculada y verificada. El código vence en 15 minutos y solo
              funciona una vez.
            </p>
            <button onClick={generateCode} disabled={saving} className={primaryBtnCls}>
              {saving ? "Generando..." : linkCode ? "Generar otro código" : "Generar código"}
            </button>
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
                El código vence en {linkCode.expiresInMinutes} minutos.
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
