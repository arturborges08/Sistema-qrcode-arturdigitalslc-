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
import { BatchesPage } from "./pages/Batches";
import { BatchNewPage } from "./pages/BatchNew";
import { BatchPrintPage } from "./pages/BatchPrint";
import { ScanPage } from "./pages/Scan";
import { ClientsPage } from "./pages/Clients";
import { ClientDetailPage } from "./pages/ClientDetail";
import { AccountPage } from "./pages/Account";
import { MyPlatesPage } from "./pages/client/MyPlates";
import { MyPlateDetailPage } from "./pages/client/MyPlateDetail";
import { api } from "./lib/api";
import { LandingPage } from "./pages/Landing";
import { SignupPage } from "./pages/Signup";
import { PlanPage } from "./pages/Plan";
import { PaymentReturnPage } from "./pages/PaymentReturn";
import { MyPlateNewPage } from "./pages/client/MyPlateNew";
import { SubscriptionsPage } from "./pages/Subscriptions";

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Spinner label="Verificando sessão…" />;
  if (status === "anonymous") {
    // Quem chega na raiz do site sem conta vê a página inicial; nas outras páginas, vai para o login e depois volta.
    if (location.pathname === "/") return <Navigate to="/inicio" replace />;
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Área do dono do sistema. Cliente revendedor que cair aqui vai para a área dele. */
function OwnerOnly() {
  const { role } = useAuth();
  return role === "CLIENT" ? <Navigate to="/minhas" replace /> : <Outlet />;
}

function ClientOnly() {
  const { role, billing } = useAuth();
  if (role !== "CLIENT") return <Navigate to="/" replace />;
  // Assinante sem plano em dia só acessa a página do plano.
  if (billing?.required && !billing.active) return <Navigate to="/plano" replace />;
  return <Outlet />;
}

type ScanTarget = { id: string; configured: boolean };

function ClientScanPage() {
  return (
    <ScanPage
      lookup={(code) => api<ScanTarget>(`/me/plates/by-code/${encodeURIComponent(code)}`)}
      pathFor={(p) => `/minhas/${p.id}${p.configured ? "" : "?configurar=1"}`}
      description="Aponte a câmera para o QR Code da plaquinha para definir ou trocar o link."
    />
  );
}

const router = createBrowserRouter([
  { path: "/inicio", element: <LandingPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/cadastro", element: <SignupPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <OwnerOnly />,
        children: [
          { path: "/plaquinhas/:id/imprimir", element: <PrintQrPage /> },
          { path: "/lotes/imprimir", element: <BatchPrintPage /> },
        ],
      },
      {
        element: <Layout />,
        children: [
          {
            element: <OwnerOnly />,
            children: [
              { path: "/", element: <DashboardPage /> },
              { path: "/plaquinhas", element: <PlatesListPage /> },
              { path: "/plaquinhas/nova", element: <PlateNewPage /> },
              { path: "/plaquinhas/:id", element: <PlateDetailPage /> },
              { path: "/lotes", element: <BatchesPage /> },
              { path: "/lotes/novo", element: <BatchNewPage /> },
              { path: "/clientes", element: <ClientsPage /> },
              { path: "/clientes/:id", element: <ClientDetailPage /> },
              { path: "/assinaturas", element: <SubscriptionsPage /> },
              { path: "/escanear", element: <ScanPage /> },
            ],
          },
          {
            element: <ClientOnly />,
            children: [
              { path: "/minhas", element: <MyPlatesPage /> },
              { path: "/minhas/escanear", element: <ClientScanPage /> },
              { path: "/minhas/nova", element: <MyPlateNewPage /> },
              { path: "/minhas/:id", element: <MyPlateDetailPage /> },
            ],
          },
          { path: "/conta", element: <AccountPage /> },
          { path: "/plano", element: <PlanPage /> },
          { path: "/pagamento/retorno", element: <PaymentReturnPage /> },
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
