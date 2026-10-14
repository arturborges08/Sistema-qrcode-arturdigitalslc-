import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./ui";
import { useToast } from "./Toast";

export function CopyButton({ value, label = "Copiar", size = "sm" }: { value: string; label?: string; size?: "sm" | "md" }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      toast("error", "Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }
  return (
    <Button size={size} onClick={copy} icon={done ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}>
      {done ? "Copiado" : label}
    </Button>
  );
}
