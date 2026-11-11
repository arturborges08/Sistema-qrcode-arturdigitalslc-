import { NavLink, Outlet, Link } from "react-router-dom";
import { CalendarClock, CreditCard, Layers, LayoutDashboard, LogOut, QrCode, Plus, ScanLine, UserRound, Users } from "lucide-react";
import { useAuth } from "../auth";
import { daysUntil } from "../lib/format";
import { buttonClass, cx } from "./ui";
import { useToast } from "./Toast";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { to: string; label: string; short: string; icon: typeof QrCode; end: boolean };

const ownerNav: NavItem[] = [
  { to: "/", label: "Visão geral", short: "Início", icon: LayoutDashboard, end: true },
  { to: "/plaquinhas", label: "Plaquinhas", short: "Plaquinhas", icon: QrCode, end: false },
  { to: "/lotes", label: "Lotes", short: "Lotes", icon: Layers, end: false },
  { to: "/clientes", label: "Clientes", short: "Clientes", icon: Users, end: false },
  { to: "/escanear", label: "Escanear", short: "Escanear", icon: ScanLine, end: false },
];

const clientNav: NavItem[] = [
  { to: "/minhas", label: "Minhas plaquinhas", short: "Plaquinhas", icon: QrCode, end: true },
  { to: "/minhas/escanear", label: "Escanear", short: "Escanear", icon: ScanLine, end: false },
];

const planItem: NavItem = { to: "/plano", label: "Meu plano", short: "Plano", icon: CreditCard, end: false };
const accountItem: NavItem = { to: "/conta", label: "Minha conta", short: "Conta", icon: UserRound, end: false };

export function Layout() {
  const { email, role, billing, logout } = useAuth();
  const isClient = role === "CLIENT";
  const blocked = Boolean(billing?.required && !billing.active);
  const nav = blocked ? [planItem] : isClient ? (billing?.required ? [...clientNav, planItem] : clientNav) : ownerNav;
  const toast = useToast();
  const left = billing?.required && billing.active && billing.paidUntil ? daysUntil(billing.paidUntil) : null;

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
          <Link to={isClient ? "/minhas" : "/"} className="mr-2 sm:mr-6" aria-label="Plaquinhas, início">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    "flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium",
                    isActive ? "bg-brand-50 text-brand-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                  )
                }
              >
                <n.icon className="size-4" aria-hidden />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {!isClient && (
              <div className="hidden lg:block">
                <Link to="/plaquinhas/nova" className={buttonClass("primary", "sm")}>
                  <Plus className="size-4" aria-hidden />
                  Nova plaquinha
                </Link>
              </div>
            )}
            <ThemeToggle />
            <div className="hidden md:block">
              <NavLink to="/conta" className={buttonClass("ghost", "sm")} aria-label="Minha conta" title={email ?? ""}>
                <UserRound className="size-4" aria-hidden />
                <span className="hidden max-w-48 truncate xl:inline">{email}</span>
              </NavLink>
            </div>
            <button onClick={onLogout} className={buttonClass("ghost", "sm")} aria-label="Sair">
              <LogOut className="size-4" aria-hidden />
              <span className="hidden md:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {left !== null && left <= 5 && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm text-amber-900 sm:px-6">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            <span>
              Seu plano vence em {left} {left === 1 ? "dia" : "dias"}.
            </span>
            <Link to="/plano" className="font-semibold underline underline-offset-2">
              Renovar agora
            </Link>
          </div>
        </div>
      )}

      <main id="conteudo" className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 md:pb-8">
        <Outlet />
      </main>

      {/* Navegação do celular: ícone com nome, sempre ao alcance do polegar. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Principal (celular)"
      >
        <ul className="mx-auto flex max-w-md">
          {[...nav, ...(blocked ? [] : [accountItem])].map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", isActive ? "text-brand-600" : "text-zinc-500")
                }
              >
                <n.icon className="size-5" aria-hidden />
                {n.short}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
