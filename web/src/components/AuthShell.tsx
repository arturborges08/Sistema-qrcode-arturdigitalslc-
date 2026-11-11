import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

/** Moldura das telas de entrar e criar conta. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link to="/inicio" aria-label="Plaquinhas, página inicial">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{title}</h1>
            {subtitle && <div className="mt-1.5 text-sm text-zinc-500">{subtitle}</div>}
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">{children}</div>
          {footer && <div className="mt-5 text-center text-sm text-zinc-600">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
