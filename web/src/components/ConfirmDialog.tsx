import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui";

/** Diálogo modal nativo (<dialog>): prende o foco, fecha com Esc e devolve o foco ao fechar. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        if (loading) e.preventDefault();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-zinc-200 bg-white p-0 shadow-xl backdrop:bg-zinc-900/40"
    >
      <div className="p-5">
        <h2 id="confirm-title" className="text-base font-semibold text-zinc-900">
          {title}
        </h2>
        <div className="mt-2 space-y-2 text-sm text-zinc-600">{children}</div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 px-5 py-4 sm:flex-row sm:justify-end">
        <Button onClick={onClose} disabled={loading} autoFocus>
          Cancelar
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
