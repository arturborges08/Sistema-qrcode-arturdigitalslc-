import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { api } from "../lib/api";
import type { Plate } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { Button, buttonClass, ErrorBox, Spinner } from "../components/ui";

const SIZES = [4, 5, 6, 7, 8, 9];

export function PrintQrPage() {
  const { id = "" } = useParams();
  const { data: plate, error, loading } = useAsync(() => api<Plate>(`/plates/${id}`), [id]);
  const [cm, setCm] = useState(7);

  if (loading) return <Spinner />;
  if (error || !plate) return <div className="p-6"><ErrorBox message={error ?? "Plaquinha não encontrada"} /></div>;

  return (
    <div className="min-h-dvh bg-white">
      <div className="border-b border-zinc-200 bg-stone-50 print:hidden">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to={`/plaquinhas/${plate.id}`} className={buttonClass("ghost", "sm")}>
            <ArrowLeft className="size-4" aria-hidden /> Voltar
          </Link>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{plate.businessName} · {plate.internalName}</p>
            <p className="truncate font-mono text-xs text-zinc-500">{plate.permanentUrl}</p>
          </div>
          <label htmlFor="tam" className="text-sm text-zinc-600">Tamanho</label>
          <select id="tam" value={cm} onChange={(e) => setCm(Number(e.target.value))} className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-sm">
            {SIZES.map((s) => <option key={s} value={s}>{s} × {s} cm</option>)}
          </select>
          <Button variant="primary" size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Imprimir
          </Button>
        </div>
        <p className="mx-auto max-w-3xl px-4 pb-3 text-xs text-zinc-500">
          Na janela de impressão, use escala 100% (“tamanho real”) e desative “ajustar à página” para manter a medida exata.
        </p>
      </div>
      <div className="flex justify-center p-8 print:p-0">
        <img src={`/api/plates/${plate.id}/qr.svg`} alt={`QR Code ${plate.permanentUrl}`} style={{ width: `${cm}cm`, height: `${cm}cm` }} />
      </div>
    </div>
  );
}
