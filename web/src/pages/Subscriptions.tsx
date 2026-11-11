import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Clock, ExternalLink, Search, Users, XCircle } from "lucide-react";
import { api } from "../lib/api";
import { daysUntil, formatDate, formatDateTime, formatMoney } from "../lib/format";
import type { PlanInfo } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { Button, Card, CardHeader, EmptyState, ErrorBox, Input, PageHeader, Spinner, cx } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { useToast } from "../components/Toast";

interface AdminPayment {
  id: string;
  status: "PAID" | "PENDING";
  amountCents: number;
  method: string | null;
  paidAt: string | null;
  periodEnd: string | null;
  createdAt: string;
  transactionNsu: string | null;
  user: { id: string; name: string | null; email: string };
}

interface Overview {
  subscribers: { total: number; active: number; expired: number; neverPaid: number; expiringSoon: number };
  revenue: { monthCents: number; monthCount: number; last30Cents: number; last30Count: number; totalCents: number; totalCount: number };
  pendingCheckouts7d: number;
  recentPayments: AdminPayment[];
  integration: {
    provider: string;
    handleConfigured: boolean;
    handle: string | null;
    apiUrl: string;
    webhookUrl: string;
    redirectUrl: string;
    httpsOk: boolean;
    lastConfirmedPaymentAt: string | null;
    plan: PlanInfo;
  };
}

interface Subscriber {
  id: string;
  name: string | null;
  email: string;
  active: boolean;
  paidUntil: string | null;
  planActive: boolean;
  createdAt: string;
  plates: number;
  paymentsCount: number;
  totalPaidCents: number;
  lastPaymentAt: string | null;
}

const METHOD: Record<string, string> = { pix: "Pix", credit_card: "Cartão", manual: "Cortesia" };
const FILTERS = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Em dia" },
  { value: "expiring", label: "Vencem em 7 dias" },
  { value: "expired", label: "Vencidos" },
  { value: "unpaid", label: "Nunca pagaram" },
] as const;

function Metric({ icon, label, value, hint, tone = "zinc" }: { icon: ReactNode; label: string; value: string | number; hint?: string; tone?: "zinc" | "brand" | "emerald" | "amber" }) {
  const toneCls = { zinc: "bg-zinc-100 text-zinc-600", brand: "bg-brand-50 text-brand-700", emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700" }[tone];
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <span className={cx("flex size-7 items-center justify-center rounded-lg", toneCls)}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </Card>
  );
}

function StatusPill({ s }: { s: Subscriber }) {
  if (!s.active) return <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Conta desativada</span>;
  if (!s.paidUntil) return <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Nunca pagou</span>;
  if (!s.planActive) return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Venceu {formatDate(s.paidUntil)}</span>;
  const d = daysUntil(s.paidUntil);
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", d <= 7 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>
      Até {formatDate(s.paidUntil)}
    </span>
  );
}

export function SubscriptionsPage() {
  const toast = useToast();
  const overview = useAsync(() => api<Overview>("/admin/overview"), []);
  const [status, setStatus] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const subs = useAsync(
    () => api<{ items: Subscriber[] }>(`/admin/subscribers?status=${status}${query ? `&q=${encodeURIComponent(query)}` : ""}`),
    [status, query],
  );
  const [extendFor, setExtendFor] = useState<Subscriber | null>(null);
  const [days, setDays] = useState("30");
  const [endFor, setEndFor] = useState<Subscriber | null>(null);
  const [busy, setBusy] = useState(false);

  function reloadAll() {
    overview.reload();
    subs.reload();
  }

  async function doExtend() {
    if (!extendFor) return;
    setBusy(true);
    try {
      const r = await api<{ paidUntil: string }>(`/admin/subscribers/${extendFor.id}/extend`, { method: "POST", body: { days: Number(days) } });
      toast("success", `Acesso liberado até ${formatDate(r.paidUntil)}.`);
      setExtendFor(null);
      reloadAll();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doEnd() {
    if (!endFor) return;
    setBusy(true);
    try {
      await api(`/admin/subscribers/${endFor.id}/end-plan`, { method: "POST" });
      toast("success", "Plano encerrado. O painel desta pessoa foi bloqueado.");
      setEndFor(null);
      reloadAll();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const o = overview.data;

  return (
    <>
      <PageHeader title="Assinaturas" description="Quem paga o plano mensal, quanto entrou e o estado da InfinitePay." />

      {overview.loading && !o ? (
        <Spinner />
      ) : overview.error || !o ? (
        <ErrorBox message={overview.error ?? "Não foi possível carregar."} onRetry={overview.reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              icon={<CircleDollarSign className="size-4" aria-hidden />}
              tone="brand"
              label="Recebido este mês"
              value={formatMoney(o.revenue.monthCents)}
              hint={`${o.revenue.monthCount} ${o.revenue.monthCount === 1 ? "pagamento" : "pagamentos"} · valor bruto, antes das taxas`}
            />
            <Metric icon={<CheckCircle2 className="size-4" aria-hidden />} tone="emerald" label="Assinantes em dia" value={o.subscribers.active} hint={`de ${o.subscribers.total} cadastrados`} />
            <Metric icon={<Clock className="size-4" aria-hidden />} tone="amber" label="Vencem em 7 dias" value={o.subscribers.expiringSoon} />
            <Metric
              icon={<XCircle className="size-4" aria-hidden />}
              label="Vencidos / nunca pagaram"
              value={`${o.subscribers.expired} / ${o.subscribers.neverPaid}`}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Últimos 30 dias: {formatMoney(o.revenue.last30Cents)} · Total desde o início: {formatMoney(o.revenue.totalCents)} ({o.revenue.totalCount}{" "}
            pagamentos). Cortesias não entram na soma. As taxas da InfinitePay não vêm pela API: confira o valor líquido no app da InfinitePay.
          </p>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <IntegrationCard i={o.integration} pending={o.pendingCheckouts7d} />
            <Card>
              <CardHeader title="Últimos pagamentos" description="Confirmados com a InfinitePay (e cortesias)." />
              {o.recentPayments.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-zinc-500">Nenhum pagamento ainda.</p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {o.recentPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-900">{p.user.name ?? p.user.email}</p>
                        <p className="truncate text-xs text-zinc-500">
                          {p.paidAt ? formatDateTime(p.paidAt) : ""} · {p.method ? METHOD[p.method] ?? p.method : "—"}
                        </p>
                      </div>
                      <p className={cx("shrink-0 font-semibold tabular-nums", p.amountCents > 0 ? "text-emerald-700" : "text-zinc-500")}>
                        {p.amountCents > 0 ? `+ ${formatMoney(p.amountCents)}` : "Cortesia"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      <Card className="mt-6">
        <CardHeader title="Assinantes" description="Contas criadas pelo cadastro público. Clientes que você cadastrou ficam em Clientes e não pagam." />
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar assinantes">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatus(f.value)}
                aria-pressed={status === f.value}
                className={cx(
                  "rounded-full px-3 py-1 text-sm font-medium",
                  status === f.value ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <form
            className="relative sm:ml-auto sm:w-64"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q.trim());
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            <Input aria-label="Buscar por nome ou e-mail" placeholder="Buscar nome ou e-mail" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
        </div>
        {subs.loading && !subs.data ? (
          <Spinner />
        ) : subs.error ? (
          <div className="p-4">
            <ErrorBox message={subs.error} onRetry={subs.reload} />
          </div>
        ) : !subs.data || subs.data.items.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title={status === "all" && !query ? "Nenhum assinante ainda" : "Ninguém neste filtro"}
            description={status === "all" && !query ? "Quando alguém criar conta pela página inicial, aparece aqui." : undefined}
          />
        ) : (
          <ul className="divide-y divide-zinc-100" data-testid="subscribers">
            {subs.data.items.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-zinc-900">{s.name ?? s.email}</span>
                    <StatusPill s={s} />
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {s.email} · {s.plates} QR {s.plates === 1 ? "Code" : "Codes"} · pagou {formatMoney(s.totalPaidCents)} em {s.paymentsCount}{" "}
                    {s.paymentsCount === 1 ? "vez" : "vezes"} · desde {formatDate(s.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => { setDays("30"); setExtendFor(s); }}>
                    Dar dias grátis
                  </Button>
                  {s.planActive && (
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setEndFor(s)}>
                      Encerrar plano
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!extendFor}
        title="Dar dias grátis"
        confirmLabel="Liberar acesso"
        loading={busy}
        onConfirm={doExtend}
        onClose={() => setExtendFor(null)}
      >
        <p className="text-sm text-zinc-600">
          Os dias são somados ao vencimento de <strong>{extendFor?.name ?? extendFor?.email}</strong>, sem cobrança. Fica registrado como cortesia.
        </p>
        <label htmlFor="extend-days" className="mt-4 block text-sm font-medium text-zinc-800">
          Quantos dias?
        </label>
        <Input id="extend-days" type="number" min={1} max={366} inputMode="numeric" className="mt-1.5 w-32" value={days} onChange={(e) => setDays(e.target.value)} />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!endFor}
        title="Encerrar o plano agora?"
        confirmLabel="Encerrar plano"
        danger
        loading={busy}
        onConfirm={doEnd}
        onClose={() => setEndFor(null)}
      >
        <p className="text-sm text-zinc-600">
          O painel de <strong>{endFor?.name ?? endFor?.email}</strong> fica bloqueado na hora. Os QR Codes dessa pessoa param depois de{" "}
          {o?.integration.plan.graceDays ?? 3} dias. Não há estorno automático: devolução de dinheiro é feita no app da InfinitePay.
        </p>
      </ConfirmDialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-sm text-zinc-900">{children}</dd>
    </div>
  );
}

function IntegrationCard({ i, pending }: { i: Overview["integration"]; pending: number }) {
  return (
    <Card>
      <CardHeader
        title="InfinitePay"
        description="Configuração da cobrança. A InfiniteTag é definida na variável INFINITEPAY_HANDLE do Railway."
        action={
          i.handleConfigured && i.httpsOk ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="size-3.5" aria-hidden /> Configurada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              <AlertTriangle className="size-3.5" aria-hidden /> Falta configurar
            </span>
          )
        }
      />
      <dl className="divide-y divide-zinc-100 px-5">
        <Row label="InfiniteTag">
          {i.handle ? (
            <span className="font-mono">${i.handle}</span>
          ) : (
            <span className="text-amber-800">Não definida. O cadastro público está fechado até você criar INFINITEPAY_HANDLE no Railway.</span>
          )}
        </Row>
        <Row label="Plano">
          {formatMoney(i.plan.priceCents)} a cada {i.plan.days} dias · até {i.plan.maxPlates} QR Codes · {i.plan.graceDays} dias de tolerância
        </Row>
        <Row label="Endereço do site">
          {i.httpsOk ? "Usa https ✓" : <span className="text-amber-800">APP_BASE_URL sem https: a InfinitePay exige https no webhook.</span>}
        </Row>
        <Row label="Webhook">
          <span className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-zinc-100 px-1.5 py-1 text-xs">{i.webhookUrl}</code>
            <CopyButton value={i.webhookUrl} />
          </span>
          <span className="mt-1 block text-xs text-zinc-500">Enviado automaticamente em cada cobrança. Não precisa cadastrar em lugar nenhum.</span>
        </Row>
        <Row label="Último pagamento">{i.lastConfirmedPaymentAt ? formatDateTime(i.lastConfirmedPaymentAt) : "Nenhum ainda"}</Row>
        <Row label="Links abertos">
          {pending} {pending === 1 ? "cobrança aberta" : "cobranças abertas"} nos últimos 7 dias sem pagamento confirmado
        </Row>
      </dl>
      <div className="border-t border-zinc-100 px-5 py-3">
        <a
          href="https://www.infinitepay.io/checkout-documentacao"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
        >
          Documentação da InfinitePay <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    </Card>
  );
}
