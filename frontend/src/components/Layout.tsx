import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { APP_NAME } from "../lib/constants";

const baseNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: "◉" },
  { to: "/inventario", label: "Inventario", icon: "⊞" },
  { to: "/facturacion", label: "Facturación", icon: "⊡" },
  { to: "/informes", label: "Informes", icon: "⊟" },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  // El cajero solo ve su módulo de caja; a facturación llega desde la
  // tarjeta "Registrar ventas".
  const navItems =
    user?.role === "CASHIER"
      ? [{ to: "/caja", label: "Caja", icon: "▣" }]
      : baseNavItems;
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const closeSidebar = () => setOpen(false);

  const sidebar = (
    <aside className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col h-full shrink-0">
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white tracking-tight">
          {APP_NAME}
        </h1>
        <button
          onClick={closeSidebar}
          className="lg:hidden text-slate-400 hover:text-white text-lg"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={closeSidebar}
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
  );

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Desktop: sidebar fijo a la izquierda */}
      <div className="hidden lg:flex shrink-0">{sidebar}</div>

      {/* Backdrop oscuro al abrir sidebar en mobile/tablet */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar deslizante para mobile/tablet */}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </div>

      {/* Contenido principal */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Barra superior con hamburguesa (solo mobile/tablet) */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/50 sticky top-0 z-30">
          <button
            onClick={() => setOpen(true)}
            className="text-slate-400 hover:text-white text-xl"
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="text-sm font-medium text-white truncate">
            {APP_NAME}
          </span>
        </div>

        <div className="flex-1 p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}