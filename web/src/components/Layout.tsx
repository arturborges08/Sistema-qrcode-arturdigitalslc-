import { NavLink, Outlet, Link } from "react-router-dom";
import { LayoutDashboard, LogOut, QrCode, Plus } from "lucide-react";
import { useAuth } from "../auth";
import { buttonClass, cx } from "./ui";
import { useToast } from "./Toast";

const nav = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/plaquinhas", label: "Plaquinhas", icon: QrCode, end: false },
];

export function Layout() {
  const { email, logout } = useAuth();
  const toast = useToast();

  async function onLogout() {
    try {
      await logout();
    } catch {
      toast("error", "Não foi possível sair. Tente novamente.");
    }
  }

  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link to="/" className="mr-2 flex items-center gap-2 font-semibold text-zinc-900 sm:mr-6">
            <span className="flex size-7 items-center justify-center rounded-md bg-zinc-900 text-white">
              <QrCode className="size-4" aria-hidden />
            </span>
            <span className="hidden sm:inline">Plaquinhas</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Principal">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium",
                    isActive ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:text-zinc-900",
                  )
                }
              >
                <n.icon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{n.label}</span>
                <span className="sr-only sm:hidden">{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/plaquinhas/nova" className={cx(buttonClass("primary", "sm"), "hidden sm:inline-flex")}>
              <Plus className="size-4" aria-hidden />
              Nova plaquinha
            </Link>
            <span className="hidden max-w-48 truncate text-sm text-zinc-500 lg:inline" title={email ?? ""}>
              {email}
            </span>
            <button onClick={onLogout} className={buttonClass("ghost", "sm")} aria-label="Sair">
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
