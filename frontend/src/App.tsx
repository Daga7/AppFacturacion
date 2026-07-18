import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventario from "./pages/Inventario";
import Facturacion from "./pages/Facturacion";
import Informes from "./pages/Informes";
import Caja from "./pages/Caja";
import Layout from "./components/Layout";
import { useAuthStore } from "./stores/auth";

function AppInit() {
  const init = useAuthStore((s) => s.init);
  useEffect(() => { init(); }, [init]);
  return null;
}

// Rutas permitidas al cajero: su pantalla de caja y facturación (a la que
// llega desde "Registrar ventas"). Cualquier otra URL lo devuelve a /caja.
const CASHIER_ROUTES = ["/caja", "/facturacion"];

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
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
