import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { APP_NAME } from "../lib/constants";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "◉" },
  { to: "/inventario", label: "Inventario", icon: "⊞" },
  { to: "/facturacion", label: "Facturación", icon: "⊡" },
  { to: "/informes", label: "Informes", icon: "⊟" },
];

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-slate-950">
      <aside className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-800">
          <h1 className="text-lg font-bold text-white tracking-tight">
            [APP_NAME]
          </h1>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand/15 text-brand-light"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand/30 flex items-center justify-center text-brand-light text-xs font-bold">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.username}
              </p>
              <p className="text-xs text-slate-500">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-500 hover:text-red-400 transition-colors text-lg"
              title="Cerrar sesión"
            >
              ⏻
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
