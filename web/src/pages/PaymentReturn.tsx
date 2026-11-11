import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useAuth } from "../auth";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import type { Billing } from "../lib/types";
import { Button, Card, Spinner, buttonClass } from "../components/ui";

type Outcome = "paid" | "already_paid" | "not_paid" | "unknown_order" | "amount_mismatch";

/** A InfinitePay traz a pessoa de volta para cá com order_nsu, transaction_nsu e slug no endereço. */
export function PaymentReturnPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<{ outcome?: Outcome; billing?: Billing; error?: string; loading: boolean }>({ loading: true });
  const started = useRef(false);

  const orderNsu = params.get("order_nsu");
  const transactionNsu = params.get("transaction_nsu");
  const slug = params.get("slug");
  const receipt = params.get("receipt_url");

  async function confirm() {
    setState({ loading: true });
    try {
      const r = await api<{ outcome: Outcome; billing: Billing }>("/billing/confirm", {
        method: "POST",
        body: { order_nsu: orderNsu, transaction_nsu: transactionNsu, slug },
      });
      setState({ ...r, loading: false });
      await refresh();
    } catch (e) {
      setState({ error: (e as Error).message, loading: false });
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (orderNsu && transactionNsu && slug) void confirm();
    else setState({ loading: false, error: "Não recebemos os dados do pagamento. Se você pagou, aguarde alguns minutos e veja a página do plano." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ok = state.outcome === "paid" || state.outcome === "already_paid";
  const receiptSafe = receipt && /^https:\/\/([a-z0-9-]+\.)*infinitepay\.io\//i.test(receipt) ? receipt : null;

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-8 text-center">
        {state.loading ? (
          <Spinner label="Confirmando o pagamento com a InfinitePay…" />
        ) : ok ? (
          <>
            <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden />
            <h1 className="mt-4 text-xl font-bold text-zinc-900">Pagamento confirmado!</h1>
            <p className="mt-2 text-sm text-zinc-600">
              {state.billing?.paidUntil ? `Seu plano está ativo até ${formatDate(state.billing.paidUntil)}.` : "Seu plano está ativo."}
            </p>
            <Link to="/minhas" className={`${buttonClass("primary")} mt-6 w-full`}>
              Começar a usar
            </Link>
          </>
        ) : state.outcome === "not_paid" ? (
          <>
            <Clock className="mx-auto size-12 text-amber-600" aria-hidden />
            <h1 className="mt-4 text-xl font-bold text-zinc-900">Pagamento ainda não aprovado</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Pix e cartão podem levar alguns instantes. Tente verificar de novo. Se você não concluiu o pagamento, volte ao plano.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button variant="primary" onClick={confirm}>Verificar de novo</Button>
              <Link to="/plano" className={buttonClass("secondary")}>Voltar ao plano</Link>
            </div>
          </>
        ) : (
          <>
            <XCircle className="mx-auto size-12 text-red-600" aria-hidden />
            <h1 className="mt-4 text-xl font-bold text-zinc-900">Não conseguimos confirmar</h1>
            <p className="mt-2 text-sm text-zinc-600">
              {state.error ??
                (state.outcome === "unknown_order"
                  ? "Este pagamento não pertence à conta que está aberta. Entre com a conta que fez o pagamento."
                  : "O valor pago não corresponde ao plano. Fale com o suporte.")}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {orderNsu && transactionNsu && slug && <Button variant="primary" onClick={confirm}>Tentar de novo</Button>}
              <Link to="/plano" className={buttonClass("secondary")}>Ir para o plano</Link>
            </div>
          </>
        )}
        {receiptSafe && !state.loading && (
          <a href={receiptSafe} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
            Ver comprovante
          </a>
        )}
      </Card>
    </div>
  );
}
