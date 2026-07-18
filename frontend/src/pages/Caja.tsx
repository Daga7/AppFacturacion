import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { BigOptionCard } from "../components/ui/BigOptionCard";
import { UnlockIcon, ReceiptIcon, LockIcon } from "../components/ui/icons";
import { Alert } from "../components/ui/Alert";

// Pantalla de entrada del cajero: las tres acciones del turno.
// "Abrir caja" y "Cerrar caja" están pendientes de definir su flujo.
export default function Caja() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [notice, setNotice] = useState<string | null>(null);

  const pending = (accion: string) =>
    setNotice(`"${accion}" estará disponible pronto — aún estamos definiendo su funcionamiento.`);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-10 mt-6">
        <h2 className="text-2xl font-bold text-white">
          Hola, {user?.username}
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          {user?.branchName} · ¿Qué quieres hacer?
        </p>
      </div>

      {notice && <Alert kind="success" message={notice} onClose={() => setNotice(null)} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BigOptionCard
          icon={<UnlockIcon />}
          title="Abrir caja"
          subtitle="Inicia el turno con la base del día"
          onClick={() => pending("Abrir caja")}
        />
        <BigOptionCard
          icon={<ReceiptIcon />}
          title="Registrar ventas"
          subtitle="Facturación, préstamos y clientes"
          onClick={() => navigate("/facturacion")}
        />
        <BigOptionCard
          icon={<LockIcon />}
          title="Cerrar caja"
          subtitle="Cuadra y cierra el turno"
          onClick={() => pending("Cerrar caja")}
        />
      </div>
    </div>
  );
}
