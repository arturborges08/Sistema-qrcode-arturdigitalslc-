import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Plate } from "../lib/types";
import { Button, buttonClass, Card, Field, Input, PageHeader } from "../components/ui";
import { useToast } from "../components/Toast";

const MAX = 200;

export function BatchNewPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [quantity, setQuantity] = useState("20");
  const [batchName, setBatchName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(quantity);
    if (!Number.isInteger(n) || n < 1 || n > MAX) return setError(`Informe um número de 1 a ${MAX}`);
    setError(null);
    setSaving(true);
    try {
      const res = await api<{ batchName: string; items: Plate[] }>("/plates/batch", {
        method: "POST",
        body: { quantity: n, batchName: batchName.trim() || undefined },
      });
      toast("success", `${res.items.length} QR Codes gerados.`);
      nav(`/lotes/imprimir?nome=${encodeURIComponent(res.batchName)}`);
    } catch (err) {
      setError(err instanceof ApiError && err.fields?.length ? err.fields[0].message : (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/lotes" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" aria-hidden /> Lotes
      </Link>
      <PageHeader title="Gerar lote em branco" description="Cria vários QR Codes únicos para imprimir agora e configurar depois." />
      <Card>
        <form onSubmit={onSubmit} className="space-y-5 p-5" noValidate>
          <Field label="Quantidade de plaquinhas" htmlFor="quantity" error={error} hint={`De 1 a ${MAX} por lote.`}>
            <Input id="quantity" type="number" inputMode="numeric" min={1} max={MAX} value={quantity} invalid={!!error} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          </Field>
          <Field label="Nome do lote (opcional)" htmlFor="batchName" hint="Ex.: Pedido gráfica outubro. Se ficar vazio, usamos a data e a hora.">
            <Input id="batchName" maxLength={80} value={batchName} onChange={(e) => setBatchName(e.target.value)} />
          </Field>
          <ol className="list-decimal space-y-1 rounded-lg bg-stone-50 px-5 py-4 pl-9 text-sm text-zinc-600">
            <li>Imprima a folha de QR Codes e produza as plaquinhas.</li>
            <li>Quando for instalar, abra o painel no celular e escaneie a plaquinha.</li>
            <li>Cole o link do cliente e salve. Pronto: a plaquinha já funciona.</li>
          </ol>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={saving}>
              Gerar QR Codes
            </Button>
          </div>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-zinc-500">
        Já tem o link do cliente? <Link to="/plaquinhas/nova" className={buttonClass("ghost", "sm")}>Cadastrar uma plaquinha</Link>
      </p>
    </div>
  );
}
