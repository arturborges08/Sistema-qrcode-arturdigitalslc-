import { Link } from "react-router-dom";
import { ArrowRight, Layers, Plus, QrCode, ScanLine } from "lucide-react";
import { useAuth } from "../auth";
import { formatMoney } from "../lib/format";
import { RevenueChart } from "../components/RevenueChart";
import { api } from "../lib/api";
import type { Stats } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { buttonClass, Card, CardHeader, EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";
import { PlateRow } from "../components/PlateRow";

const TONES = { green: "bg-lime-500", gray: "bg-zinc-400", amber: "bg-brand-500" } as const;

function Stat({ label, value, tone }: { label: string; value: number; tone?: keyof typeof TONES }) {
  return (
    <Card className="px-6 py-5">
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        {tone && <span className={`size-2 rounded-full ${TONES[tone]}`} aria-hidden />}
        {label}
      </p>
      <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-zinc-900 sm:text-5xl">{value}</p>
    </Card>
  );
}

interface OverviewLite {
  subscribers: { total: number; active: number; expiringSoon: number };
  revenue: { monthCents: number; monthCount: number; last30Cents: number };
  daily: { date: string; cents: number }[];
}

/** Destaque grafite com brilho laranja (fica escuro nos dois temas, como o menu lateral). */
function Hero({ stats, ov }: { stats: Stats; ov: OverviewLite | null }) {
  const { name, email } = useAuth();
  const items = [
    { label: "Plaquinhas ativas", value: String(stats.active), dot: "bg-[#a3e635]" },
    { label: "Em branco", value: String(stats.unconfigured), dot: "bg-[#b79cff]" },
    { label: "Assinantes em dia", value: ov ? String(ov.subscribers.active) : "—", dot: "bg-[#7dd3fc]" },
    { label: "Recebido no mês", value: ov ? formatMoney(ov.revenue.monthCents) : "—", dot: "bg-[#fde047]" },
  ];
  return (
    <section className="relative overflow-hidden rounded-[32px] bg-[#17171a] p-6 text-[#fafafa] shadow-xl ring-1 ring-[#ffffff12] sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-[radial-gradient(circle,rgb(124_77_255/0.6),transparent_65%)] blur-2xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-[radial-gradient(circle,rgb(163_230_53/0.14),transparent_65%)] blur-2xl" aria-hidden />
      <div className="relative">
        <p className="text-sm text-[#a1a1aa]">Olá{name ? `, ${name}` : email ? `, ${email.split("@")[0]}` : ""}</p>
        <h2 className="mt-1 max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Suas plaquinhas e assinaturas, num lugar só.</h2>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/plaquinhas/nova" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#fafafa] px-5 text-sm font-semibold text-[#111] hover:bg-white">
            <Plus className="size-4" aria-hidden /> Nova plaquinha
          </Link>
          <Link to="/assinaturas" className="inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-medium text-[#e4e4e7] ring-1 ring-[#ffffff26] hover:bg-[#ffffff0f]">
            Ver assinaturas <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-[#ffffff14] ring-1 ring-[#ffffff14] backdrop-blur 2xl:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="bg-[#1d1d21cc] px-5 py-4">
              <dt className="flex items-center gap-2 text-xs text-[#a1a1aa]">
                <span className={`size-1.5 rounded-full ${it.dot}`} aria-hidden />
                {it.label}
              </dt>
              <dd className="mt-1 whitespace-nowrap text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{it.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function DashboardPage() {
  const { data, error, loading, reload } = useAsync(() => api<Stats>("/plates/stats"), []);
  // Resumo das assinaturas (dados reais). Se falhar, o resto da página continua funcionando.
  const ov = useAsync(() => api<OverviewLite>("/admin/overview").catch(() => null), []);

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Resumo das plaquinhas e do plano mensal"
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
          </>
        }
      />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            <Hero stats={data} ov={ov.data ?? null} />
            <Card className="flex flex-col p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-500">Receita dos últimos 30 dias</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">
                    {ov.data ? formatMoney(ov.data.revenue.last30Cents) : "—"}
                  </p>
                </div>
                <Link to="/assinaturas" className="text-sm font-medium text-brand-600 hover:underline">
                  Detalhes
                </Link>
              </div>
              <div className="mt-auto pt-4">
                {ov.data ? <RevenueChart data={ov.data.daily} /> : <p className="py-10 text-center text-sm text-zinc-500">{ov.loading ? "Carregando…" : "Sem dados de pagamento."}</p>}
              </div>
            </Card>
          </div>
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
                  <Link to="/plaquinhas" className="text-sm font-medium text-brand-600 hover:underline">
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
