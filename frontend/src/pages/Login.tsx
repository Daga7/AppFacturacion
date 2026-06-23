import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { APP_NAME } from "../lib/constants";

type RoleKey = "ADMIN" | "SUPERVISOR" | "CASHIER";

const roles: { key: RoleKey; label: string; icon: string; desc: string }[] = [
  {
    key: "ADMIN",
    label: "Administrador",
    icon: "⚙️",
    desc: "Gestión completa del sistema, usuarios y reportes",
  },
  {
    key: "SUPERVISOR",
    label: "Supervisor",
    icon: "📋",
    desc: "Supervisa ventas, inventario y movimientos",
  },
  {
    key: "CASHIER",
    label: "Cajero",
    icon: "💰",
    desc: "Registra ventas y gestiona pagos",
  },
];

export default function Login() {
  const [selected, setSelected] = useState<RoleKey | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const user = useAuthStore((s) => s.user);
  const { login, loading, error } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    await login(username, password);
  };

  const handleBack = () => {
    setSelected(null);
    setUsername("");
    setPassword("");
    useAuthStore.setState({ error: null });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-white mb-2">
            [APP_NAME]
          </h1>
          <p className="text-slate-400 text-sm">
            Selecciona tu rol para ingresar
          </p>
        </div>

        {!selected ? (
          <div className="grid gap-4">
            {roles.map((role) => (
              <button
                key={role.key}
                onClick={() => setSelected(role.key)}
                className="group relative flex items-center gap-4 p-5 rounded-2xl border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/80 hover:border-slate-600 transition-all duration-200 text-left cursor-pointer"
              >
                <span className="text-2xl">{role.icon}</span>
                <div>
                  <div className="font-semibold text-white group-hover:text-brand-light transition-colors">
                    {role.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {role.desc}
                  </div>
                </div>
                <svg
                  className="ml-auto w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ))}
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-5 animate-in"
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div>
                <div className="text-lg font-semibold text-white">
                  {roles.find((r) => r.key === selected)?.label}
                </div>
                <div className="text-xs text-slate-500">
                  Ingresa tus credenciales
                </div>
              </div>
            </div>

            <input
              type="text"
              placeholder="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-700/50 bg-slate-900/60 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
              autoFocus
            />

            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-700/50 bg-slate-900/60 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
            />

            {error && (
              <div className="text-red-400 text-sm text-center bg-red-400/10 rounded-lg py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-3 rounded-xl bg-brand hover:bg-brand-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-all cursor-pointer"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
