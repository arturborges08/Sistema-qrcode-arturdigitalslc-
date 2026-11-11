import { config } from "../config.js";
import { prisma } from "../db.js";
import { logger } from "./logger.js";
import { checkPayment } from "./infinitepay.js";

const DAY = 24 * 3600 * 1000;

export interface BillingUser {
  role: "OWNER" | "CLIENT";
  selfSignup: boolean;
  paidUntil: Date | null;
}

/** Quem paga: só quem criou a própria conta. Administrador e clientes cadastrados por ele são isentos. */
export const billingRequired = (u: BillingUser) => u.role === "CLIENT" && u.selfSignup;

export const planActive = (u: BillingUser, now = Date.now()) =>
  !billingRequired(u) || (u.paidUntil !== null && u.paidUntil.getTime() > now);

/** Os QR Codes de um assinante vencido continuam funcionando durante a tolerância (PLAN_GRACE_DAYS). */
export const redirectAllowed = (u: BillingUser, now = Date.now()) =>
  !billingRequired(u) || (u.paidUntil !== null && u.paidUntil.getTime() + config().PLAN_GRACE_DAYS * DAY > now);

export function billingDto(u: BillingUser) {
  return {
    required: billingRequired(u),
    active: planActive(u),
    paidUntil: u.paidUntil ? u.paidUntil.toISOString() : null,
  };
}

export function planInfo() {
  const c = config();
  return {
    signupEnabled: Boolean(c.INFINITEPAY_HANDLE),
    priceCents: c.PLAN_PRICE_CENTS,
    days: c.PLAN_DAYS,
    maxPlates: c.PLAN_MAX_PLATES,
  };
}

export type ConfirmOutcome = "paid" | "already_paid" | "not_paid" | "unknown_order" | "amount_mismatch";

/**
 * Confirma um pagamento consultando a InfinitePay (nunca confia só no que chegou no webhook ou na URL de retorno)
 * e, se aprovado, estende o acesso do usuário por PLAN_DAYS dias. Idempotente: o mesmo pagamento nunca conta duas vezes.
 */
export async function confirmPayment(input: {
  orderNsu: string;
  transactionNsu: string;
  slug: string;
  receiptUserId?: string;
}): Promise<ConfirmOutcome> {
  const payment = await prisma.payment.findUnique({ where: { id: input.orderNsu } });
  if (!payment || (input.receiptUserId && payment.userId !== input.receiptUserId)) return "unknown_order";
  if (payment.status === "PAID") return "already_paid";

  const check = await checkPayment(input);
  if (!check.paid) return "not_paid";
  if (check.amountCents !== null && check.amountCents < payment.amountCents) {
    logger.error("payment_amount_mismatch", { paymentId: payment.id, expected: payment.amountCents, got: check.amountCents });
    return "amount_mismatch";
  }

  return prisma.$transaction(async (tx) => {
    // Trava o pagamento para que webhook e retorno simultâneos não somem o mês duas vezes.
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`;
    if (rows[0]?.status === "PAID") return "already_paid" as const;
    const user = await tx.adminUser.findUniqueOrThrow({ where: { id: payment.userId }, select: { paidUntil: true } });
    const now = Date.now();
    const base = user.paidUntil && user.paidUntil.getTime() > now ? user.paidUntil.getTime() : now;
    const periodEnd = new Date(base + config().PLAN_DAYS * DAY);
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt: new Date(now),
        transactionNsu: input.transactionNsu,
        invoiceSlug: input.slug,
        captureMethod: check.captureMethod,
        paidAmountCents: check.paidAmountCents,
        periodEnd,
      },
    });
    await tx.adminUser.update({ where: { id: payment.userId }, data: { paidUntil: periodEnd } });
    logger.info("payment_confirmed", { paymentId: payment.id, periodEnd: periodEnd.toISOString() });
    return "paid" as const;
  });
}
