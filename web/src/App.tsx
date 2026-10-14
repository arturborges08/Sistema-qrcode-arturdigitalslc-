import { Navigate, Outlet, createBrowserRouter, RouterProvider, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { ToastProvider } from "./components/Toast";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { PlatesListPage } from "./pages/PlatesList";
import { PlateNewPage } from "./pages/PlateNew";
import { PlateDetailPage } from "./pages/PlateDetail";
import { PrintQrPage } from "./pages/PrintQr";
import { NotFoundPage } from "./pages/NotFound";

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Spinner label="Verificando sessão…" />;
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/plaquinhas/:id/imprimir", element: <PrintQrPage /> },
      {
        element: <Layout />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/plaquinhas", element: <PlatesListPage /> },
          { path: "/plaquinhas/nova", element: <PlateNewPage /> },
          { path: "/plaquinhas/:id", element: <PlateDetailPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
  );
}
