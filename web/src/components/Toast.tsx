import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cx } from "./ui";

type Kind = "success" | "error";
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}

const Ctx = createContext<(kind: Kind, message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = Date.now() + Math.random();
      setItems((l) => [...l.slice(-2), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg",
              t.kind === "error" ? "border-red-200" : "border-zinc-200",
            )}
          >
            {t.kind === "error" ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
            )}
            <p className="flex-1 text-zinc-800">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-zinc-400 hover:text-zinc-700" aria-label="Fechar aviso">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
