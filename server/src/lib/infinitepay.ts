import { config } from "../config.js";
import { logger } from "./logger.js";

/**
 * Integração com o Checkout Integrado da InfinitePay.
 * Documentação oficial: https://www.infinitepay.io/checkout-documentacao
 *
 * - POST {API}/links cria um link de pagamento (só precisa da InfiniteTag em "handle"; preço em centavos).
 * - POST {API}/payment_check confirma se um pagamento foi aprovado.
 * - O webhook da InfinitePay NÃO tem assinatura; por isso todo aviso é confirmado com payment_check antes de liberar acesso.
 * - Não existe cobrança recorrente automática no Checkout Integrado: cada mês é um link novo.
 */

const TIMEOUT_MS = 10_000;

export class InfinitePayError extends Error {}

async function post(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const url = `${config().INFINITEPAY_API_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new InfinitePayError(`Falha de conexão com a InfinitePay: ${e instanceof Error ? e.message : String(e)}`);
  }
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

/**
 * A documentação diz "leve o comprador até a URL do link que vem na resposta", mas não mostra o nome do campo.
 * Procuramos nos nomes mais prováveis e, por último, em qualquer valor https em um domínio da InfinitePay.
 */
export function extractCheckoutUrl(data: unknown): string | null {
  const isInfinitePayUrl = (v: unknown): v is string => {
    if (typeof v !== "string") return false;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && (u.hostname === "infinitepay.io" || u.hostname.endsWith(".infinitepay.io"));
    } catch {
      return false;
    }
  };
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  for (const key of ["url", "link", "checkout_url", "payment_url", "link_url"]) {
    if (isInfinitePayUrl(obj[key])) return obj[key] as string;
  }
  for (const nested of [obj.data, obj.link]) {
    if (nested && typeof nested === "object") {
      const found = extractCheckoutUrl(nested);
      if (found) return found;
    }
  }
  for (const v of Object.values(obj)) if (isInfinitePayUrl(v)) return v;
  return null;
}

export async function createCheckoutLink(input: {
  orderNsu: string;
  priceCents: number;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  customer?: { name?: string; email?: string };
}): Promise<string> {
  const handle = config().INFINITEPAY_HANDLE;
  if (!handle) throw new InfinitePayError("INFINITEPAY_HANDLE não configurado");
  const customer: Record<string, string> = {};
  if (input.customer?.name) customer.name = input.customer.name;
  if (input.customer?.email) customer.email = input.customer.email;
  const { status, data } = await post("/links", {
    handle,
    items: [{ quantity: 1, price: input.priceCents, description: input.description }],
    order_nsu: input.orderNsu,
    redirect_url: input.redirectUrl,
    webhook_url: input.webhookUrl,
    ...(Object.keys(customer).length ? { customer } : {}),
  });
  if (status < 200 || status >= 300) {
    logger.error("infinitepay_link_failed", { status, body: JSON.stringify(data)?.slice(0, 500) });
    throw new InfinitePayError(`InfinitePay recusou a criação do link (HTTP ${status})`);
  }
  const url = extractCheckoutUrl(data);
  if (!url) {
    // Só os nomes dos campos: ajuda a corrigir a integração sem gravar dados no log.
    logger.error("infinitepay_link_without_url", { keys: data && typeof data === "object" ? Object.keys(data) : typeof data });
    throw new InfinitePayError("A InfinitePay respondeu sem o endereço do link de pagamento");
  }
  return url;
}

export interface PaymentCheckResult {
  paid: boolean;
  amountCents: number | null;
  paidAmountCents: number | null;
  captureMethod: string | null;
}

export async function checkPayment(input: { orderNsu: string; transactionNsu: string; slug: string }): Promise<PaymentCheckResult> {
  const handle = config().INFINITEPAY_HANDLE;
  if (!handle) throw new InfinitePayError("INFINITEPAY_HANDLE não configurado");
  const { status, data } = await post("/payment_check", {
    handle,
    order_nsu: input.orderNsu,
    transaction_nsu: input.transactionNsu,
    slug: input.slug,
  });
  if (status < 200 || status >= 300 || !data || typeof data !== "object") {
    logger.error("infinitepay_check_failed", { status });
    throw new InfinitePayError(`Não foi possível consultar o pagamento (HTTP ${status})`);
  }
  const d = data as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
  return {
    paid: d.success === true && d.paid === true,
    amountCents: num(d.amount),
    paidAmountCents: num(d.paid_amount),
    captureMethod: typeof d.capture_method === "string" ? d.capture_method.slice(0, 32) : null,
  };
}
