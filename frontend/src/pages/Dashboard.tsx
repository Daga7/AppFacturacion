import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/auth";

const modules = [
  {
    to: "/inventario",
    icon: "⊞",
    title: "Inventario",
    desc: "Productos, categorías y control de stock por sucursal",
    color: "from-blue-600/20 to-blue-800/20 border-blue-900/40",
  },
  {
    to: "/facturacion",
    icon: "⊡",
    title: "Facturación",
    desc: "Registrar ventas, pagos y gestionar créditos",
    color: "from-emerald-600/20 to-emerald-800/20 border-emerald-900/40",
  },
  {
    to: "/informes",
    icon: "⊟",
    title: "Informes",
    desc: "Resumen de ventas, productos top y estado de inventario",
    color: "from-purple-600/20 to-purple-800/20 border-purple-900/40",
  },
];

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">
          Bienvenido, {user?.username}
        </h2>
        <p className="text-slate-400 mt-1">
          Panel de administración del sistema de facturación
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {modules.map((mod) => (
          <Link
            key={mod.to}
            to={mod.to}
            className={`bg-gradient-to-br ${mod.color} border rounded-2xl p-6 hover:scale-[1.02] transition-transform`}
          >
            <span className="text-4xl">{mod.icon}</span>
            <h3 className="text-lg font-semibold text-white mt-4">
              {mod.title}
            </h3>
            <p className="text-sm text-slate-400 mt-1">{mod.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
