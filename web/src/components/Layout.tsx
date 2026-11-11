import { NavLink, Outlet, Link } from "react-router-dom";
import { BadgeDollarSign, CalendarClock, CreditCard, Layers, LayoutDashboard, LogOut, QrCode, Plus, ScanLine, UserRound, Users } from "lucide-react";
import { useAuth } from "../auth";
import { daysUntil } from "../lib/format";
import { buttonClass, cx } from "./ui";
import { useToast } from "./Toast";
import { Logo, LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { to: string; label: string; short: string; icon: typeof QrCode; end: boolean };

const ownerNav: NavItem[] = [
  { to: "/", label: "Visão geral", short: "Início", icon: LayoutDashboard, end: true },
  { to: "/plaquinhas", label: "Plaquinhas", short: "Plaquinhas", icon: QrCode, end: false },
  { to: "/lotes", label: "Lotes", short: "Lotes", icon: Layers, end: false },
  { to: "/clientes", label: "Clientes", short: "Clientes", icon: Users, end: false },
  { to: "/assinaturas", label: "Assinaturas", short: "Assinaturas", icon: BadgeDollarSign, end: false },
  { to: "/escanear", label: "Escanear", short: "Escanear", icon: ScanLine, end: false },
];
// No celular cabem 5 itens; Lotes e Escanear ficam nos botões da Visão geral.
const ownerMobile = new Set(["/", "/plaquinhas", "/clientes", "/assinaturas"]);

const clientNav: NavItem[] = [
  { to: "/minhas", label: "Minhas plaquinhas", short: "Plaquinhas", icon: QrCode, end: true },
  { to: "/minhas/escanear", label: "Escanear", short: "Escanear", icon: ScanLine, end: false },
];

const planItem: NavItem = { to: "/plano", label: "Meu plano", short: "Plano", icon: CreditCard, end: false };
const accountItem: NavItem = { to: "/conta", label: "Minha conta", short: "Conta", icon: UserRound, end: false };

/*
 * Menu lateral sempre grafite (nos dois temas), por isso usa cores fixas em vez da paleta que muda no modo escuro.
 * Computador grande: ícone + nome. Tablet: só ícones (nome na dica e para leitores de tela). Celular: barra embaixo.
 */
function SideLink({ n }: { n: NavItem }) {
  return (
    <NavLink
      to={n.to}
      end={n.end}
      title={n.label}
      className={({ isActive }) =>
        cx(
          "group flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors",
          "justify-center lg:justify-start",
          isActive ? "bg-[#ffffff14] text-[#fafafa]" : "text-[#a1a1aa] hover:bg-[#ffffff0d] hover:text-[#fafafa]",
        )
      }
    >
      {({ isActive }) => (
        <>
          <n.icon className={cx("size-5 shrink-0", isActive ? "text-[#b79cff]" : "")} aria-hidden />
          <span className="sr-only lg:not-sr-only">{n.label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Layout() {
  const { email, name, role, billing, logout } = useAuth();
  const isClient = role === "CLIENT";
  const blocked = Boolean(billing?.required && !billing.active);
  const nav = blocked ? [planItem] : isClient ? (billing?.required ? [...clientNav, planItem] : clientNav) : ownerNav;
  const toast = useToast();
  const left = billing?.required && billing.active && billing.paidUntil ? daysUntil(billing.paidUntil) : null;
  const home = isClient ? "/minhas" : "/";

  async function onLogout() {
    try {
      await logout();
    } catch {
      toast("error", "Não foi possível sair. Tente novamente.");
    }
  }

  return (
    <div className="min-h-dvh md:pl-[104px] lg:pl-[272px]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>

      {/* Menu lateral (tablet e computador) */}
      <aside className="fixed inset-y-3 left-3 z-30 hidden w-[80px] flex-col rounded-[28px] bg-[#141416] p-3 shadow-xl ring-1 ring-[#ffffff10] md:flex lg:w-[248px]">
        <Link to={home} className="mb-6 flex h-12 items-center justify-center px-1 lg:justify-start lg:px-2" aria-label="Plaquinhas, início">
          <LogoMark className="size-9 lg:hidden" />
          <Logo tone="light" className="hidden lg:inline-flex" />
        </Link>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Principal">
          {nav.map((n) => (
            <SideLink key={n.to} n={n} />
          ))}
          {!isClient && (
            <Link
              to="/plaquinhas/nova"
              title="Nova plaquinha"
              className="mt-3 flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#7c4dff] px-3 text-sm font-semibold text-[#fff] hover:bg-[#8f66ff] lg:justify-start"
            >
              <Plus className="size-5" aria-hidden />
              <span className="sr-only lg:not-sr-only">Nova plaquinha</span>
            </Link>
          )}
        </nav>
        <div className="flex flex-col gap-1 border-t border-[#ffffff14] pt-3">
          {!blocked && <SideLink n={accountItem} />}
          <div className="flex flex-col items-center gap-1 lg:flex-row lg:justify-between">
            <ThemeToggle className="text-[#a1a1aa] hover:bg-[#ffffff0d] hover:text-[#fafafa]" />
            <button
              onClick={onLogout}
              title="Sair"
              className="flex h-10 items-center gap-2 rounded-2xl px-3 text-sm font-medium text-[#a1a1aa] hover:bg-[#ffffff0d] hover:text-[#fafafa]"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="sr-only lg:not-sr-only">Sair</span>
            </button>
          </div>
          <p className="hidden truncate px-2 pt-1 text-xs text-[#71717a] lg:block" title={email ?? ""}>
            {name ?? email}
          </p>
        </div>
      </aside>

      {/* Topo no celular */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 backdrop-blur md:hidden">
        <div className="flex h-14 items-center gap-2 px-4">
          <Link to={home} aria-label="Plaquinhas, início">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <button onClick={onLogout} className={buttonClass("ghost", "sm")} aria-label="Sair">
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {left !== null && left <= 5 && (
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
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

      <main id="conteudo" className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 md:pb-10 lg:px-8 lg:pt-10">
        <Outlet />
      </main>

      {/* Navegação do celular: ícone com nome, sempre ao alcance do polegar. */}
      <nav
        className="fixed inset-x-3 bottom-3 z-30 rounded-[24px] bg-[#141416]/95 pb-[env(safe-area-inset-bottom)] shadow-xl ring-1 ring-[#ffffff10] backdrop-blur md:hidden"
        aria-label="Principal (celular)"
      >
        <ul className="mx-auto flex max-w-md">
          {[...(isClient ? nav : nav.filter((n) => ownerMobile.has(n.to))), ...(blocked ? [] : [accountItem])].map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", isActive ? "text-[#b79cff]" : "text-[#a1a1aa]")
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
