import { Link } from "react-router-dom";
import { Layers, Plus, QrCode, ScanLine } from "lucide-react";
import { api } from "../lib/api";
import type { Stats } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { buttonClass, Card, CardHeader, EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";
import { PlateRow } from "../components/PlateRow";

const TONES = { green: "bg-emerald-500", gray: "bg-zinc-400", amber: "bg-amber-500" } as const;

function Stat({ label, value, tone }: { label: string; value: number; tone?: keyof typeof TONES }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-3xl font-semibold tabular-nums tracking-tight">
        {tone && <span className={`size-2 rounded-full ${TONES[tone]}`} aria-hidden />}
        {value}
      </p>
    </Card>
  );
}

export function DashboardPage() {
  const { data, error, loading, reload } = useAsync(() => api<Stats>("/plates/stats"), []);

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Resumo das plaquinhas cadastradas"
        actions={
          <>
            <Link to="/escanear" className={buttonClass("secondary")}>
              <ScanLine className="size-4" aria-hidden />
              Escanear
            </Link>
            <Link to="/lotes/novo" className={buttonClass("secondary")}>
              <Layers className="size-4" aria-hidden />
              Gerar lote
            </Link>
            <Link to="/plaquinhas/nova" className={buttonClass("primary")}>
              <Plus className="size-4" aria-hidden />
              Nova plaquinha
            </Link>
          </>
        }
      />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total cadastrado" value={data.total} />
            <Stat label="Ativos" value={data.active} tone="green" />
            <Stat label="Inativos" value={data.inactive} tone="gray" />
            <Stat label="Em branco" value={data.unconfigured} tone="amber" />
          </div>
          <Card>
            <CardHeader
              title="Cadastradas recentemente"
              action={
                data.total > 0 ? (
                  <Link to="/plaquinhas" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
                    Ver todas
                  </Link>
                ) : undefined
              }
            />
            {data.recent.length === 0 ? (
              <EmptyState
                icon={<QrCode className="size-5" />}
                title="Nenhuma plaquinha ainda"
                description="Cadastre a primeira plaquinha para gerar o QR Code permanente."
                action={
                  <Link to="/plaquinhas/nova" className={buttonClass("primary")}>
                    <Plus className="size-4" aria-hidden />
                    Cadastrar plaquinha
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {data.recent.map((p) => (
                  <PlateRow key={p.id} plate={p} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
