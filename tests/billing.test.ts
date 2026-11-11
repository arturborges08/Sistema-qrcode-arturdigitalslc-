import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app, loginAgent, nextIp, prisma, request, resetData } from "./helpers.js";

/**
 * Servidor falso que imita a API do Checkout Integrado da InfinitePay
 * (POST /links e POST /payment_check, conforme https://www.infinitepay.io/checkout-documentacao).
 * Isto testa a NOSSA lógica; não prova que a API real responde exatamente assim.
 */
const fake = {
  links: [] as Record<string, unknown>[],
  checks: [] as Record<string, unknown>[],
  paid: new Set<string>(), // order_nsu aprovados
  amount: 990,
  linkStatus: 200,
};
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/links") {
      fake.links.push(body);
      res.statusCode = fake.linkStatus;
      res.end(JSON.stringify({ url: `https://checkout.infinitepay.io/loja-teste/${body.order_nsu}` }));
      return;
    }
    if (req.url === "/payment_check") {
      fake.checks.push(body);
      const paid = fake.paid.has(body.order_nsu) && body.transaction_nsu === "tx-1" && body.slug === "slug-1";
      res.end(JSON.stringify({ success: paid, paid, amount: fake.amount, paid_amount: fake.amount, installments: 1, capture_method: "pix" }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
});

beforeAll(() => new Promise<void>((r) => server.listen(4599, "127.0.0.1", () => r())));
afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetData();
  fake.links = [];
  fake.checks = [];
  fake.paid.clear();
  fake.amount = 990;
  fake.linkStatus = 200;
});

const USER = { name: "Maria Assinante", email: "maria@assinante.local", password: "senha-maria-123" };
const DAY = 24 * 3600 * 1000;

async function signup(data = USER) {
  const ip = nextIp();
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/signup").set("X-Forwarded-For", ip).send(data);
  const csrf = res.body.csrfToken as string;
  const h = (r: request.Test) => r.set("X-Forwarded-For", ip).set("X-CSRF-Token", csrf);
  return {
    res,
    get: (u: string) => h(agent.get(u)),
    post: (u: string, body?: object) => h(agent.post(u)).send(body),
  };
}

async function payViaWebhook(orderNsu: string) {
  fake.paid.add(orderNsu);
  return request(app)
    .post("/api/billing/webhook")
    .send({ invoice_slug: "slug-1", amount: 990, paid_amount: 990, installments: 1, capture_method: "pix", transaction_nsu: "tx-1", order_nsu: orderNsu });
}

describe("Plano mensal (InfinitePay)", () => {
  it("informa o plano publicamente", async () => {
    const r = await request(app).get("/api/billing/plan");
    expect(r.body).toEqual({ signupEnabled: true, priceCents: 990, days: 30, maxPlates: 20 });
  });

  it("cadastro público cria assinante bloqueado até pagar", async () => {
    const u = await signup();
    expect(u.res.status).toBe(201);
    expect(u.res.body).toMatchObject({ role: "CLIENT", selfSignup: true, billing: { required: true, active: false, paidUntil: null } });
    const blocked = await u.get("/api/me/plates");
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe("payment_required");
    // E-mail repetido
    expect((await signup()).res.status).toBe(409);
    // Senha curta
    expect((await signup({ ...USER, email: "x@y.local", password: "123" })).res.status).toBe(400);
  });

  it("checkout cria link com handle, preço em centavos, order_nsu, retorno e webhook", async () => {
    const u = await signup();
    const r = await u.post("/api/billing/checkout");
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/^https:\/\/checkout\.infinitepay\.io\/loja-teste\//);
    expect(fake.links).toHaveLength(1);
    const sent = fake.links[0] as { handle: string; items: { price: number; quantity: number }[]; order_nsu: string; redirect_url: string; webhook_url: string };
    expect(sent.handle).toBe("loja-teste");
    expect(sent.items).toEqual([{ quantity: 1, price: 990, description: expect.any(String) }]);
    expect(sent.redirect_url).toBe("https://qr.teste.local/pagamento/retorno");
    expect(sent.webhook_url).toBe("https://qr.teste.local/api/billing/webhook");
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: sent.order_nsu } });
    expect(payment).toMatchObject({ status: "PENDING", amountCents: 990 });
    // Clicar de novo reaproveita o mesmo link em vez de criar outro.
    const again = await u.post("/api/billing/checkout");
    expect(again.body.url).toBe(r.body.url);
    expect(fake.links).toHaveLength(1);
  });

  it("webhook só libera depois de confirmar com payment_check; é idempotente", async () => {
    const u = await signup();
    await u.post("/api/billing/checkout");
    const orderNsu = (fake.links[0] as { order_nsu: string }).order_nsu;

    // Webhook falso (pagamento não aprovado na InfinitePay) não libera nada.
    const forged = await request(app)
      .post("/api/billing/webhook")
      .send({ invoice_slug: "slug-1", transaction_nsu: "tx-1", order_nsu: orderNsu });
    expect(forged.status).toBe(400);
    expect((await u.get("/api/me/plates")).status).toBe(402);

    const ok = await payViaWebhook(orderNsu);
    expect(ok.status).toBe(200);
    expect(fake.checks.at(-1)).toEqual({ handle: "loja-teste", order_nsu: orderNsu, transaction_nsu: "tx-1", slug: "slug-1" });
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { email: USER.email } });
    const until = user.paidUntil!.getTime();
    expect(until).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(until).toBeLessThan(Date.now() + 31 * DAY);
    expect((await u.get("/api/me/plates")).status).toBe(200);

    // Reenvio do mesmo webhook não soma outro mês.
    expect((await payViaWebhook(orderNsu)).status).toBe(200);
    const again = await prisma.adminUser.findUniqueOrThrow({ where: { email: USER.email } });
    expect(again.paidUntil!.getTime()).toBe(until);
  });

  it("retorno do pagamento confirma pela conta logada; pedido de outra pessoa é recusado", async () => {
    const u = await signup();
    await u.post("/api/billing/checkout");
    const orderNsu = (fake.links[0] as { order_nsu: string }).order_nsu;
    fake.paid.add(orderNsu);

    const other = await signup({ ...USER, email: "outra@assinante.local" });
    const stolen = await other.post("/api/billing/confirm", { order_nsu: orderNsu, transaction_nsu: "tx-1", slug: "slug-1" });
    expect(stolen.body.outcome).toBe("unknown_order");

    const r = await u.post("/api/billing/confirm", { order_nsu: orderNsu, transaction_nsu: "tx-1", slug: "slug-1" });
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("paid");
    expect(r.body.billing).toMatchObject({ required: true, active: true });
    const twice = await u.post("/api/billing/confirm", { order_nsu: orderNsu, transaction_nsu: "tx-1", slug: "slug-1" });
    expect(twice.body.outcome).toBe("already_paid");
  });

  it("valor menor que o preço não libera", async () => {
    const u = await signup();
    await u.post("/api/billing/checkout");
    const orderNsu = (fake.links[0] as { order_nsu: string }).order_nsu;
    fake.amount = 100;
    expect((await payViaWebhook(orderNsu)).status).toBe(200);
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { email: USER.email } });
    expect(user.paidUntil).toBeNull();
  });

  it("renovar antes de vencer soma 30 dias ao vencimento atual", async () => {
    const u = await signup();
    const current = new Date(Date.now() + 10 * DAY);
    await prisma.adminUser.update({ where: { email: USER.email }, data: { paidUntil: current } });
    await u.post("/api/billing/checkout");
    await payViaWebhook((fake.links[0] as { order_nsu: string }).order_nsu);
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { email: USER.email } });
    expect(user.paidUntil!.getTime()).toBe(current.getTime() + 30 * DAY);
  });

  it("falha da InfinitePay ao criar link devolve erro claro e não deixa pagamento pendente", async () => {
    const u = await signup();
    fake.linkStatus = 500;
    const r = await u.post("/api/billing/checkout");
    expect(r.status).toBe(502);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("administrador e cliente cadastrado pelo administrador são isentos", async () => {
    const owner = await loginAgent();
    const s = await owner.get("/api/auth/session");
    expect(s.body.billing).toEqual({ required: false, active: true, paidUntil: null });
    expect((await owner.post("/api/billing/checkout")).status).toBe(400);

    const c = { name: "Revenda", email: "rev@revenda.local", password: "senha-rev-123" };
    await owner.post("/api/clients", c);
    const client = await loginAgent({ email: c.email, password: c.password });
    expect((await client.get("/api/me/plates")).status).toBe(200);
    // Cliente do administrador não cria plaquinhas sozinho.
    expect((await client.post("/api/me/plates", { businessName: "X", destinationUrl: "https://exemplo.com" })).status).toBe(403);
  });

  it("assinante pago cria plaquinhas até o limite, baixa o QR; vencido para de redirecionar após a tolerância", async () => {
    const u = await signup();
    await prisma.adminUser.update({ where: { email: USER.email }, data: { paidUntil: new Date(Date.now() + 5 * DAY) } });
    const created = await u.post("/api/me/plates", { businessName: "Café da Maria", destinationUrl: "https://exemplo.com/avaliar" });
    expect(created.status).toBe(201);
    const svg = await u.get(`/api/me/plates/${created.body.id}/qr.svg`);
    expect(svg.status).toBe(200);
    expect(svg.headers["content-type"]).toMatch(/image\/svg\+xml/);

    const code = created.body.code as string;
    expect((await request(app).get(`/r/${code}`)).status).toBe(302);

    // Vencido há 1 dia: dentro da tolerância de 3 dias, ainda redireciona; painel bloqueado.
    await prisma.adminUser.update({ where: { email: USER.email }, data: { paidUntil: new Date(Date.now() - 1 * DAY) } });
    expect((await request(app).get(`/r/${code}`)).status).toBe(302);
    expect((await u.get("/api/me/plates")).status).toBe(402);

    // Vencido há 4 dias: o QR mostra o aviso de plano vencido.
    await prisma.adminUser.update({ where: { email: USER.email }, data: { paidUntil: new Date(Date.now() - 4 * DAY) } });
    const r = await request(app).get(`/r/${code}`);
    expect(r.status).toBe(402);
    expect(r.text).toContain("plano desta plaquinha está vencido");

    // Limite do plano
    await prisma.adminUser.update({ where: { email: USER.email }, data: { paidUntil: new Date(Date.now() + 5 * DAY) } });
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { email: USER.email } });
    await prisma.plate.createMany({
      data: Array.from({ length: 19 }, (_, i) => ({ code: `LIMIT${i}abc`, internalName: "x", clientId: user.id })),
    });
    const over = await u.post("/api/me/plates", { businessName: "Mais uma", destinationUrl: "https://exemplo.com" });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe("plan_limit");
  });
});
