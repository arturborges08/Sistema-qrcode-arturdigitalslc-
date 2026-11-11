import express, { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { billingDto, billingRequired, confirmPayment, planInfo } from "../lib/billing.js";
import { AppError } from "../lib/errors.js";
import { createCheckoutLink, InfinitePayError } from "../lib/infinitepay.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middleware/auth.js";
import { billingLimiter } from "../middleware/rateLimit.js";

export const billingRouter = Router();

// Público: preço e se o cadastro está aberto (usado na página inicial e no cadastro).
billingRouter.get("/plan", (_req, res) => {
  res.json(planInfo());
});

billingRouter.get("/status", requireAuth, async (req, res, next) => {
  try {
    const payments = billingRequired(req.auth!)
      ? await prisma.payment.findMany({
          where: { userId: req.auth!.adminId, status: "PAID" },
          orderBy: { paidAt: "desc" },
          take: 12,
          select: { id: true, amountCents: true, paidAt: true, periodEnd: true, captureMethod: true },
        })
      : [];
    res.json({
      ...billingDto(req.auth!),
      plan: planInfo(),
      payments: payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        paidAt: p.paidAt?.toISOString() ?? null,
        periodEnd: p.periodEnd?.toISOString() ?? null,
        method: p.captureMethod,
      })),
    });
  } catch (e) {
    next(e);
  }
});

const PENDING_REUSE_MS = 6 * 3600 * 1000;

// Cria (ou reaproveita) o link de pagamento do próximo mês e devolve o endereço para o navegador abrir.
billingRouter.post("/checkout", billingLimiter, requireAuth, async (req, res, next) => {
  try {
    if (!billingRequired(req.auth!)) throw new AppError(400, "Sua conta é isenta do plano mensal.", "billing_not_required");
    const cfg = config();
    if (!cfg.INFINITEPAY_HANDLE) throw new AppError(503, "O pagamento ainda não foi configurado pelo administrador.", "billing_not_configured");

    const recent = await prisma.payment.findFirst({
      where: {
        userId: req.auth!.adminId,
        status: "PENDING",
        amountCents: cfg.PLAN_PRICE_CENTS,
        checkoutUrl: { not: null },
        createdAt: { gt: new Date(Date.now() - PENDING_REUSE_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent?.checkoutUrl) {
      res.json({ url: recent.checkoutUrl });
      return;
    }

    const payment = await prisma.payment.create({ data: { userId: req.auth!.adminId, amountCents: cfg.PLAN_PRICE_CENTS } });
    try {
      const url = await createCheckoutLink({
        orderNsu: payment.id,
        priceCents: cfg.PLAN_PRICE_CENTS,
        description: `Plano mensal Plaquinhas (${cfg.PLAN_DAYS} dias)`,
        redirectUrl: `${cfg.APP_BASE_URL}/pagamento/retorno`,
        webhookUrl: `${cfg.APP_BASE_URL}/api/billing/webhook`,
        customer: { name: req.auth!.name ?? undefined, email: req.auth!.email },
      });
      await prisma.payment.update({ where: { id: payment.id }, data: { checkoutUrl: url } });
      res.json({ url });
    } catch (e) {
      await prisma.payment.delete({ where: { id: payment.id } }).catch(() => undefined);
      if (e instanceof InfinitePayError) {
        logger.error("checkout_failed", { error: e.message });
        throw new AppError(502, "Não foi possível abrir o pagamento agora. Tente de novo em alguns minutos.", "checkout_failed");
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
});

const ConfirmSchema = z.object({
  order_nsu: z.uuid("Pagamento não identificado"),
  transaction_nsu: z.string().trim().min(1).max(128),
  slug: z.string().trim().min(1).max(128),
});

// Chamado pela página /pagamento/retorno com os parâmetros que a InfinitePay coloca no endereço.
billingRouter.post("/confirm", billingLimiter, requireAuth, async (req, res, next) => {
  try {
    const data = ConfirmSchema.parse(req.body ?? {});
    const outcome = await confirmPayment({
      orderNsu: data.order_nsu,
      transactionNsu: data.transaction_nsu,
      slug: data.slug,
      receiptUserId: req.auth!.adminId,
    }).catch((e) => {
      if (e instanceof InfinitePayError) {
        throw new AppError(502, "Não foi possível confirmar com a InfinitePay agora. Tente de novo em instantes.", "check_failed");
      }
      throw e;
    });
    const user = await prisma.adminUser.findUniqueOrThrow({
      where: { id: req.auth!.adminId },
      select: { role: true, selfSignup: true, paidUntil: true },
    });
    res.json({ outcome, billing: billingDto(user) });
  } catch (e) {
    next(e);
  }
});

const WebhookSchema = z.object({
  order_nsu: z.string().trim().max(128),
  transaction_nsu: z.string().trim().min(1).max(128),
  invoice_slug: z.string().trim().min(1).max(128),
});

// Webhook da InfinitePay. Não tem assinatura, então nada é liberado sem consultar /payment_check.
// 200 = recebido; 400 = a InfinitePay tenta de novo.
billingRouter.post("/webhook", express.json({ type: () => true, limit: "50kb" }), async (req, res) => {
  const parsed = WebhookSchema.safeParse(req.body ?? {});
  if (!parsed.success || !z.uuid().safeParse(parsed.data.order_nsu).success) {
    logger.warn("webhook_ignored", { reason: "payload_invalido" });
    // Não é um pedido nosso: responder 200 evita reenvios inúteis.
    res.status(200).json({ ok: true });
    return;
  }
  try {
    const outcome = await confirmPayment({
      orderNsu: parsed.data.order_nsu,
      transactionNsu: parsed.data.transaction_nsu,
      slug: parsed.data.invoice_slug,
    });
    logger.info("webhook_processed", { outcome });
    if (outcome === "not_paid") {
      res.status(400).json({ ok: false });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    logger.error("webhook_failed", { error: e instanceof Error ? e.message : String(e) });
    res.status(400).json({ ok: false });
  }
});
