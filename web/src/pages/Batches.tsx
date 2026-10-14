import { Link } from "react-router-dom";
import { Layers, Plus, Printer } from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { BatchSummary } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { buttonClass, Card, EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";

export function BatchesPage() {
  const { data, error, loading, reload } = useAsync(() => api<{ items: BatchSummary[] }>("/plates/batches"), []);
  return (
    <>
      <PageHeader
        title="Lotes"
        description="QR Codes gerados em quantidade para imprimir antes de saber o link."
        actions={
          <Link to="/lotes/novo" className={buttonClass("primary")}>
            <Plus className="size-4" aria-hidden /> Gerar lote
          </Link>
        }
      />
      <Card>
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-5" />}
            title="Nenhum lote gerado"
            description="Gere um lote para imprimir várias plaquinhas de uma vez."
            action={<Link to="/lotes/novo" className={buttonClass("primary")}>Gerar lote</Link>}
          />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {data.items.map((b) => (
              <li key={b.batchName} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900">{b.batchName}</p>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {b.total} plaquinhas · {b.unconfigured} em branco · gerado em {formatDateTime(b.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/plaquinhas?lote=${encodeURIComponent(b.batchName)}`} className={buttonClass("secondary", "sm")}>
                    Ver plaquinhas
                  </Link>
                  <Link to={`/lotes/imprimir?nome=${encodeURIComponent(b.batchName)}`} className={buttonClass("secondary", "sm")}>
                    <Printer className="size-4" aria-hidden /> Imprimir
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
