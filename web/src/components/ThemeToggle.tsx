import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cx } from "./ui";

type Theme = "sistema" | "claro" | "escuro";
const ORDER: Theme[] = ["sistema", "claro", "escuro"];
const LABEL: Record<Theme, string> = { sistema: "Tema do sistema", claro: "Modo claro", escuro: "Modo escuro" };

function read(): Theme {
  try {
    const t = localStorage.getItem("tema");
    return t === "claro" || t === "escuro" ? t : "sistema";
  } catch {
    return "sistema";
  }
}

function apply(t: Theme) {
  const dark = t === "escuro" || (t === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Alterna entre tema do sistema, claro e escuro. A escolha fica salva neste navegador. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem("tema", theme);
    } catch {
      /* navegador sem armazenamento: a escolha vale só nesta visita */
    }
    if (theme !== "sistema") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("sistema");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = theme === "claro" ? Sun : theme === "escuro" ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={cx("inline-flex size-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900", className)}
      aria-label={`${LABEL[theme]}. Tocar para mudar para ${LABEL[next].toLowerCase()}`}
      title={`${LABEL[theme]} (tocar para trocar)`}
      data-testid="theme-toggle"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
