import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventario from "./pages/Inventario";
import Facturacion from "./pages/Facturacion";
import Informes from "./pages/Informes";
import Caja from "./pages/Caja";
import Telegram from "./pages/Telegram";
import Traslados from "./pages/Traslados";
import PedidosEspeciales from "./pages/PedidosEspeciales";
import ListaCompras from "./pages/ListaCompras";
import SolicitudesPrecio from "./pages/SolicitudesPrecio";
import Layout from "./components/Layout";
import { useAuthStore } from "./stores/auth";

function AppInit() {
  const init = useAuthStore((s) => s.init);
  useEffect(() => { init(); }, [init]);
  return null;
}

// Rutas permitidas al cajero (vendedor): caja, facturación y sus módulos
// propios (traslados, pedidos especiales, lista de compras, solicitudes de
// precio). Cualquier otra URL lo devuelve a /caja.
const CASHIER_ROUTES = [
  "/caja",
  "/facturacion",
  "/traslados",
  "/pedidos-especiales",
  "/lista-compras",
  "/solicitudes-precio",
];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "CASHIER" && !CASHIER_ROUTES.includes(location.pathname)) {
    return <Navigate to="/caja" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInit />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/caja" element={<Caja />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/facturacion" element={<Facturacion />} />
          <Route path="/informes" element={<Informes />} />
          <Route path="/traslados" element={<Traslados />} />
          <Route path="/pedidos-especiales" element={<PedidosEspeciales />} />
          <Route path="/lista-compras" element={<ListaCompras />} />
          <Route path="/solicitudes-precio" element={<SolicitudesPrecio />} />
          <Route path="/telegram" element={<Telegram />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
