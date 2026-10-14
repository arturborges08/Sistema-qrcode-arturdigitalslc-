import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { api } from "../lib/api";
import type { BatchQrItem } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { Button, buttonClass, ErrorBox, Spinner } from "../components/ui";

const SIZES = [3, 4, 5, 6, 7, 8];

export function BatchPrintPage() {
  const [params] = useSearchParams();
  const name = params.get("nome") ?? "";
  const { data, error, loading } = useAsync(
    () => api<{ batchName: string; items: BatchQrItem[] }>(`/plates/batch-qr?batch=${encodeURIComponent(name)}`),
    [name],
  );
  const [cm, setCm] = useState(5);
  const [showCode, setShowCode] = useState(true);

  if (loading) return <Spinner label="Gerando QR Codes…" />;
  if (error || !data) return <div className="p-6"><ErrorBox message={error ?? "Lote não encontrado"} /></div>;

  return (
    <div className="min-h-dvh bg-white">
      <div className="border-b border-zinc-200 bg-stone-50 print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/lotes" className={buttonClass("ghost", "sm")}>
            <ArrowLeft className="size-4" aria-hidden /> Lotes
          </Link>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{data.batchName}</p>
            <p className="text-xs text-zinc-500">{data.items.length} QR Codes, todos diferentes</p>
          </div>
          <label htmlFor="tam" className="text-sm text-zinc-600">Tamanho</label>
          <select id="tam" value={cm} onChange={(e) => setCm(Number(e.target.value))} className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-sm">
            {SIZES.map((s) => <option key={s} value={s}>{s} × {s} cm</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input type="checkbox" checked={showCode} onChange={(e) => setShowCode(e.target.checked)} className="size-4" />
            Mostrar código
          </label>
          <Button variant="primary" size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Imprimir / salvar PDF
          </Button>
        </div>
        <p className="mx-auto max-w-5xl px-4 pb-3 text-xs text-zinc-500">
          Use escala 100% na impressão. Para enviar à gráfica, escolha “Salvar como PDF”. Cada QR Code é único: não duplique a mesma imagem em várias plaquinhas.
        </p>
      </div>
      <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-[0.8cm] p-[1cm] print:max-w-none print:p-0" data-testid="batch-grid">
        {data.items.map((q) => (
          <figure key={q.id} className="flex break-inside-avoid flex-col items-center" style={{ width: `${cm}cm` }}>
            <img src={q.svgDataUri} alt={`QR Code ${q.permanentUrl}`} style={{ width: `${cm}cm`, height: `${cm}cm` }} />
            {showCode && <figcaption className="mt-1 font-mono text-[9pt] text-zinc-700">{q.code}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  );
}
