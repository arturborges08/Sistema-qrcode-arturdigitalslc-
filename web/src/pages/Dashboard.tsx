import { Link } from "react-router-dom";
import { Plus, QrCode } from "lucide-react";
import { api } from "../lib/api";
import type { Stats } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { buttonClass, Card, CardHeader, EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";
import { PlateRow } from "../components/PlateRow";

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "gray" }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-3xl font-semibold tabular-nums tracking-tight">
        {tone && <span className={tone === "green" ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-zinc-400"} aria-hidden />}
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
          <Link to="/plaquinhas/nova" className={buttonClass("primary")}>
            <Plus className="size-4" aria-hidden />
            Nova plaquinha
          </Link>
        }
      />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Total cadastrado" value={data.total} />
            <Stat label="Ativos" value={data.active} tone="green" />
            <Stat label="Inativos" value={data.inactive} tone="gray" />
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
