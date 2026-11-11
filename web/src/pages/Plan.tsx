import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Check, CreditCard, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth";
import { api } from "../lib/api";
import { daysUntil, formatDate, formatDateTime, formatMoney } from "../lib/format";
import type { BillingStatus } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { Button, Card, CardHeader, ErrorBox, PageHeader, Spinner, buttonClass, cx } from "../components/ui";

const METHOD: Record<string, string> = { pix: "Pix", credit_card: "Cartão", manual: "Cortesia do administrador" };

export function PlanPage() {
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api<BillingStatus>("/billing/status"), []);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  async function pay() {
    setPaying(true);
    setPayError(null);
    try {
      const { url } = await api<{ url: string }>("/billing/checkout", { method: "POST" });
      // Página de pagamento da InfinitePay. Depois de pagar, ela traz a pessoa de volta para /pagamento/retorno.
      window.location.assign(url);
    } catch (e) {
      setPayError((e as Error).message);
      setPaying(false);
    }
  }

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? "Não foi possível carregar o plano."} onRetry={reload} />;

  if (!data.required) {
    return (
      <>
        <PageHeader title="Plano" />
        <Card className="p-6">
          <p className="flex items-center gap-2 font-medium text-zinc-900">
            <ShieldCheck className="size-5 text-emerald-600" aria-hidden /> Sua conta é isenta de mensalidade.
          </p>
          <p className="mt-1 text-sm text-zinc-500">Contas do administrador e de clientes cadastrados por ele não pagam o plano.</p>
        </Card>
      </>
    );
  }

  const price = formatMoney(data.plan.priceCents);
  const left = data.paidUntil ? daysUntil(data.paidUntil) : null;
  const expiringSoon = data.active && left !== null && left <= 5;

  return (
    <>
      <PageHeader title="Meu plano" description="Acompanhe o vencimento e pague o próximo mês." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden">
          <div
            className={cx(
              "flex items-start gap-3 px-6 py-5",
              data.active ? (expiringSoon ? "bg-amber-50" : "bg-emerald-50") : "bg-brand-50",
            )}
          >
            {data.active ? (
              expiringSoon ? (
                <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
              ) : (
                <Check className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden />
              )
            ) : (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
            )}
            <div>
              <p className="font-semibold text-zinc-900" data-testid="plan-status">
                {data.active
                  ? expiringSoon
                    ? `Seu plano vence em ${left} ${left === 1 ? "dia" : "dias"}`
                    : "Plano ativo"
                  : data.paidUntil
                    ? "Seu plano venceu"
                    : "Falta só o pagamento"}
              </p>
              <p className="mt-0.5 text-sm text-zinc-600">
                {data.active && data.paidUntil
                  ? `Pago até ${formatDate(data.paidUntil)}.`
                  : data.paidUntil
                    ? `Venceu em ${formatDate(data.paidUntil)}. Seus QR Codes param de funcionar ${data.plan.graceDays} dias depois do vencimento. Renove para voltar a usar o painel.`
                    : "Pague o primeiro mês para começar a criar os seus QR Codes."}
              </p>
            </div>
          </div>
          <div className="px-6 py-6">
            <p className="text-sm font-medium text-zinc-500">Plano mensal</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight text-zinc-900">{price}</span>
              <span className="text-zinc-500">/ {data.plan.days} dias</span>
            </p>
            <Button variant="primary" className="mt-5 h-12 w-full text-base sm:w-auto sm:px-8" onClick={pay} loading={paying} icon={<CreditCard className="size-4" aria-hidden />}>
              {data.active ? `Pagar mais ${data.plan.days} dias` : `Pagar ${price}`}
            </Button>
            {payError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {payError}
              </p>
            )}
            <ul className="mt-6 space-y-2 text-sm text-zinc-600">
              <li>• Você será levado à página segura da InfinitePay para pagar por Pix ou cartão.</li>
              <li>• Depois de pagar, toque em “Continuar” para voltar aqui. O acesso é liberado na hora.</li>
              <li>• A cobrança não é automática: a cada mês, você paga de novo por esta página. Pagar antes do vencimento soma os dias.</li>
            </ul>
            {data.active && (
              <Link to="/minhas" className={cx(buttonClass("secondary"), "mt-6")}>
                Ir para as minhas plaquinhas
              </Link>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pagamentos" description="Os últimos pagamentos confirmados." />
          {data.payments.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">Nenhum pagamento ainda.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-zinc-900">{formatMoney(p.amountCents)}</p>
                    <p className="text-xs text-zinc-500">
                      {p.paidAt ? formatDateTime(p.paidAt) : ""} {p.method ? `· ${METHOD[p.method] ?? p.method}` : ""}
                    </p>
                  </div>
                  {p.periodEnd && <p className="text-right text-xs text-zinc-500">até {formatDate(p.periodEnd)}</p>}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-zinc-100 px-5 py-3">
            <button onClick={() => { reload(); void refresh(); }} className="text-sm font-medium text-brand-600 hover:underline">
              Já paguei, atualizar
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
