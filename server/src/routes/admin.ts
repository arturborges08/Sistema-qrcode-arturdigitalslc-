import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { planInfo } from "../lib/billing.js";
import { notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { AppError } from "../lib/errors.js";
import { HANDLE_PATTERN, setInfinitePayHandle } from "../lib/settings.js";
import { getInfinitePayHandle } from "../lib/settings.js";

/**
 * Painel do dono do sistema: assinantes do plano mensal, pagamentos e estado da integração com a InfinitePay.
 * Todos os números vêm do banco; nada é estimado.
 */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireOwner);

const DAY = 24 * 3600 * 1000;
const TZ = "America/Sao_Paulo";

/** Início do mês atual no fuso de São Paulo (UTC-3, sem horário de verão desde 2019). */
function startOfMonthSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  return new Date(Date.UTC(y, m - 1, 1, 3, 0, 0));
}

const subscriberWhere = { role: "CLIENT", selfSignup: true } as const;

adminRouter.get("/overview", async (_req, res, next) => {
  try {
    const now = new Date();
    const monthStart = startOfMonthSaoPaulo(now);
    const paidReal = { status: "PAID", amountCents: { gt: 0 } } as const;
    const [total, active, neverPaid, monthAgg, last30Agg, allAgg, pending, lastPaid, recent] = await Promise.all([
      prisma.adminUser.count({ where: subscriberWhere }),
      prisma.adminUser.count({ where: { ...subscriberWhere, paidUntil: { gt: now } } }),
      prisma.adminUser.count({ where: { ...subscriberWhere, paidUntil: null } }),
      prisma.payment.aggregate({ where: { ...paidReal, paidAt: { gte: monthStart } }, _sum: { amountCents: true }, _count: true }),
      prisma.payment.aggregate({ where: { ...paidReal, paidAt: { gte: new Date(now.getTime() - 30 * DAY) } }, _sum: { amountCents: true }, _count: true }),
      prisma.payment.aggregate({ where: paidReal, _sum: { amountCents: true }, _count: true }),
      prisma.payment.count({ where: { status: "PENDING", createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
      prisma.payment.findFirst({ where: paidReal, orderBy: { paidAt: "desc" }, select: { paidAt: true } }),
      prisma.payment.findMany({
        where: { status: "PAID" },
        orderBy: { paidAt: "desc" },
        take: 8,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    // Receita por dia nos últimos 30 dias (datas no fuso de São Paulo), para o gráfico.
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
    const since = new Date(now.getTime() - 29 * DAY);
    const recentPaid = await prisma.payment.findMany({
      where: { ...paidReal, paidAt: { gte: new Date(since.getTime() - DAY) } },
      select: { paidAt: true, amountCents: true },
    });
    const buckets = new Map<string, number>();
    for (let i = 0; i < 30; i++) buckets.set(dayKey.format(new Date(since.getTime() + i * DAY)), 0);
    for (const p of recentPaid) {
      const k = dayKey.format(p.paidAt!);
      if (buckets.has(k)) buckets.set(k, buckets.get(k)! + p.amountCents);
    }
    const daily = [...buckets].map(([date, cents]) => ({ date, cents }));

    const expiringSoon = await prisma.adminUser.count({
      where: { ...subscriberWhere, paidUntil: { gt: now, lte: new Date(now.getTime() + 7 * DAY) } },
    });
    const cfg = config();
    const hp = await getInfinitePayHandle();
    res.json({
      subscribers: { total, active, expired: total - active - neverPaid, neverPaid, expiringSoon },
      revenue: {
        // Faturamento bruto confirmado (sem descontar as taxas da InfinitePay, que não vêm na API).
        monthCents: monthAgg._sum.amountCents ?? 0,
        monthCount: monthAgg._count,
        last30Cents: last30Agg._sum.amountCents ?? 0,
        last30Count: last30Agg._count,
        totalCents: allAgg._sum.amountCents ?? 0,
        totalCount: allAgg._count,
        monthStart: monthStart.toISOString(),
      },
      pendingCheckouts7d: pending,
      daily,
      recentPayments: recent.map(paymentDto),
      integration: {
        provider: "InfinitePay (Checkout Integrado)",
        handleConfigured: Boolean(hp.handle),
        // "painel" = salva aqui no painel; "variavel" = vem de INFINITEPAY_HANDLE no Railway.
        handleSource: hp.source,
        // A InfiniteTag é pública (aparece no link de pagamento), então pode ser mostrada.
        handle: hp.handle,
        apiUrl: cfg.INFINITEPAY_API_URL,
        webhookUrl: `${cfg.APP_BASE_URL}/api/billing/webhook`,
        redirectUrl: `${cfg.APP_BASE_URL}/pagamento/retorno`,
        httpsOk: cfg.APP_BASE_URL.startsWith("https://"),
        lastConfirmedPaymentAt: lastPaid?.paidAt?.toISOString() ?? null,
        plan: await planInfo(),
      },
    });
  } catch (e) {
    next(e);
  }
});

type PaymentWithUser = Prisma.PaymentGetPayload<{ include: { user: { select: { id: true; name: true; email: true } } } }>;

function paymentDto(p: PaymentWithUser) {
  return {
    id: p.id,
    status: p.status,
    amountCents: p.amountCents,
    method: p.captureMethod,
    paidAt: p.paidAt?.toISOString() ?? null,
    periodEnd: p.periodEnd?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    transactionNsu: p.transactionNsu,
    user: { id: p.user.id, name: p.user.name, email: p.user.email },
  };
}

const SubsQuery = z.object({
  status: z.enum(["all", "active", "expired", "unpaid", "expiring"]).default("all"),
  q: z.string().trim().max(120).optional(),
});

adminRouter.get("/subscribers", async (req, res, next) => {
  try {
    const { status, q } = SubsQuery.parse(req.query);
    const now = new Date();
    const where: Prisma.AdminUserWhereInput = { ...subscriberWhere };
    if (status === "active") where.paidUntil = { gt: now };
    if (status === "expired") where.paidUntil = { lte: now };
    if (status === "unpaid") where.paidUntil = null;
    if (status === "expiring") where.paidUntil = { gt: now, lte: new Date(now.getTime() + 7 * DAY) };
    if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
    const rows = await prisma.adminUser.findMany({
      where,
      orderBy: [{ paidUntil: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 500,
      select: { id: true, name: true, email: true, active: true, paidUntil: true, createdAt: true },
    });
    const ids = rows.map((r) => r.id);
    const [plates, paid] = await Promise.all([
      prisma.plate.groupBy({ by: ["clientId"], where: { clientId: { in: ids } }, _count: { _all: true } }),
      prisma.payment.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, status: "PAID", amountCents: { gt: 0 } },
        _sum: { amountCents: true },
        _count: { _all: true },
        _max: { paidAt: true },
      }),
    ]);
    const plateMap = new Map(plates.map((p) => [p.clientId, p._count._all]));
    const paidMap = new Map(paid.map((p) => [p.userId, p]));
    res.json({
      items: rows.map((r) => {
        const pm = paidMap.get(r.id);
        return {
          id: r.id,
          name: r.name,
          email: r.email,
          active: r.active,
          paidUntil: r.paidUntil?.toISOString() ?? null,
          planActive: r.paidUntil !== null && r.paidUntil > now,
          createdAt: r.createdAt.toISOString(),
          plates: plateMap.get(r.id) ?? 0,
          paymentsCount: pm?._count._all ?? 0,
          totalPaidCents: pm?._sum.amountCents ?? 0,
          lastPaymentAt: pm?._max.paidAt?.toISOString() ?? null,
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

const IdParam = z.object({ id: z.uuid("Identificador inválido") });
const ExtendSchema = z.object({
  days: z.coerce.number({ error: "Informe os dias" }).int("Use um número inteiro").min(1, "Mínimo de 1 dia").max(366, "Máximo de 366 dias"),
}).strict();

async function getSubscriberOr404(id: string) {
  const u = await prisma.adminUser.findFirst({ where: { id, ...subscriberWhere }, select: { id: true, paidUntil: true } });
  if (!u) throw notFound("Assinante não encontrado");
  return u;
}

// Cortesia: soma dias ao vencimento sem cobrança. Fica registrado como pagamento de R$ 0,00 ("manual").
adminRouter.post("/subscribers/:id/extend", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const { days } = ExtendSchema.parse(req.body ?? {});
    const periodEnd = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM admin_users WHERE id = ${id}::uuid FOR UPDATE`;
      const u = await tx.adminUser.findFirst({ where: { id, ...subscriberWhere }, select: { paidUntil: true } });
      if (!u) throw notFound("Assinante não encontrado");
      const now = Date.now();
      const base = u.paidUntil && u.paidUntil.getTime() > now ? u.paidUntil.getTime() : now;
      const end = new Date(base + days * DAY);
      await tx.adminUser.update({ where: { id }, data: { paidUntil: end } });
      await tx.payment.create({
        data: { userId: id, amountCents: 0, status: "PAID", captureMethod: "manual", paidAt: new Date(now), periodEnd: end },
      });
      return end;
    });
    logger.info("admin_extend", { userId: id, days });
    res.json({ paidUntil: periodEnd.toISOString() });
  } catch (e) {
    next(e);
  }
});

// Encerra o plano agora (painel bloqueado; os QR Codes param depois da tolerância).
adminRouter.post("/subscribers/:id/end-plan", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const u = await getSubscriberOr404(id);
    const now = new Date();
    const paidUntil = u.paidUntil && u.paidUntil < now ? u.paidUntil : now;
    await prisma.adminUser.update({ where: { id }, data: { paidUntil } });
    logger.info("admin_end_plan", { userId: id });
    res.json({ paidUntil: paidUntil.toISOString() });
  } catch (e) {
    next(e);
  }
});

const PaymentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["PAID", "PENDING"]).default("PAID"),
});

adminRouter.get("/payments", async (req, res, next) => {
  try {
    const { page, pageSize, status } = PaymentsQuery.parse(req.query);
    const where: Prisma.PaymentWhereInput = { status };
    const [total, items] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: status === "PAID" ? { paidAt: "desc" } : { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    res.json({ total, page, pageSize, items: items.map(paymentDto) });
  } catch (e) {
    next(e);
  }
});

const HandleSchema = z
  .object({
    handle: z
      .string()
      .trim()
      .max(65)
      .transform((v) => v.replace(/^\$/, ""))
      .nullable(),
  })
  .strict();

// Salva (ou apaga, com handle vazio) a InfiniteTag usada para criar as cobranças.
adminRouter.put("/settings/infinitepay", async (req, res, next) => {
  try {
    const { handle } = HandleSchema.parse(req.body ?? {});
    const value = handle ? handle : null;
    if (value && !HANDLE_PATTERN.test(value)) {
      throw new AppError(400, "InfiniteTag inválida. Use só letras, números, ponto, hífen ou sublinhado (sem espaços).", "validation_error");
    }
    await setInfinitePayHandle(value);
    logger.info("admin_infinitepay_handle_saved", { cleared: value === null });
    res.json(await getInfinitePayHandle());
  } catch (e) {
    next(e);
  }
});
