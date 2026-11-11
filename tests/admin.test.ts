import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app, loginAgent, nextIp, prisma, request, resetData } from "./helpers.js";

beforeEach(resetData);
afterAll(() => prisma.$disconnect());

const DAY = 24 * 3600 * 1000;

async function subscriber(email: string, paidUntil: Date | null) {
  const r = await request(app)
    .post("/api/auth/signup")
    .set("X-Forwarded-For", nextIp())
    .send({ name: email.split("@")[0], email, password: "senha-assinante-1" });
  expect(r.status).toBe(201);
  return prisma.adminUser.update({ where: { email }, data: { paidUntil } });
}

describe("Painel do administrador: assinaturas", () => {
  it("só o administrador acessa", async () => {
    expect((await request(app).get("/api/admin/overview")).status).toBe(401);
    await subscriber("a@s.local", new Date(Date.now() + 5 * DAY));
    const sub = await loginAgent({ email: "a@s.local", password: "senha-assinante-1" });
    expect((await sub.get("/api/admin/overview")).status).toBe(403);
    expect((await sub.get("/api/admin/subscribers")).status).toBe(403);
  });

  it("resumo conta assinantes e soma só pagamentos reais confirmados", async () => {
    const a = await subscriber("ativo@s.local", new Date(Date.now() + 10 * DAY));
    const b = await subscriber("vencendo@s.local", new Date(Date.now() + 2 * DAY));
    await subscriber("vencido@s.local", new Date(Date.now() - 2 * DAY));
    await subscriber("nunca@s.local", null);
    await prisma.payment.createMany({
      data: [
        { userId: a.id, amountCents: 990, status: "PAID", paidAt: new Date(), captureMethod: "pix", transactionNsu: "t1" },
        { userId: b.id, amountCents: 990, status: "PAID", paidAt: new Date(), captureMethod: "credit_card", transactionNsu: "t2" },
        { userId: b.id, amountCents: 990, status: "PENDING" },
        { userId: b.id, amountCents: 0, status: "PAID", paidAt: new Date(), captureMethod: "manual" },
      ],
    });
    const owner = await loginAgent();
    const r = await owner.get("/api/admin/overview");
    expect(r.status).toBe(200);
    expect(r.body.subscribers).toEqual({ total: 4, active: 2, expired: 1, neverPaid: 1, expiringSoon: 1 });
    expect(r.body.revenue).toMatchObject({ monthCents: 1980, monthCount: 2, totalCents: 1980, totalCount: 2 });
    expect(r.body.pendingCheckouts7d).toBe(1);
    expect(r.body.daily).toHaveLength(30);
    expect(r.body.daily.at(-1).cents).toBe(1980);
    expect(r.body.daily.reduce((s: number, d: { cents: number }) => s + d.cents, 0)).toBe(1980);
    expect(r.body.integration).toMatchObject({ handleConfigured: true, handle: "loja-teste", webhookUrl: "https://qr.teste.local/api/billing/webhook", httpsOk: true });
    // Clientes do administrador não entram na conta de assinantes.
    await owner.post("/api/clients", { name: "Revenda", email: "rev@r.local", password: "senha-rev-123" });
    expect((await owner.get("/api/admin/overview")).body.subscribers.total).toBe(4);

    const list = await owner.get("/api/admin/subscribers?status=expiring");
    expect(list.body.items.map((i: { email: string }) => i.email)).toEqual(["vencendo@s.local"]);
    expect(list.body.items[0]).toMatchObject({ planActive: true, paymentsCount: 1, totalPaidCents: 990 });
    expect((await owner.get("/api/admin/subscribers?status=unpaid")).body.items).toHaveLength(1);
    expect((await owner.get("/api/admin/subscribers?q=vencido")).body.items).toHaveLength(1);
    const pays = await owner.get("/api/admin/payments");
    expect(pays.body.total).toBe(3);
  });

  it("estender dá dias de cortesia; encerrar bloqueia na hora", async () => {
    const u = await subscriber("x@s.local", null);
    const owner = await loginAgent();
    const ext = await owner.post(`/api/admin/subscribers/${u.id}/extend`, { days: 15 });
    expect(ext.status).toBe(200);
    const until = new Date(ext.body.paidUntil).getTime();
    expect(until).toBeGreaterThan(Date.now() + 14 * DAY);
    const manual = await prisma.payment.findFirstOrThrow({ where: { userId: u.id } });
    expect(manual).toMatchObject({ amountCents: 0, captureMethod: "manual", status: "PAID" });

    const sub = await loginAgent({ email: "x@s.local", password: "senha-assinante-1" });
    expect((await sub.get("/api/me/plates")).status).toBe(200);

    expect((await owner.post(`/api/admin/subscribers/${u.id}/end-plan`)).status).toBe(200);
    expect((await sub.get("/api/me/plates")).status).toBe(402);

    expect((await owner.post(`/api/admin/subscribers/${u.id}/extend`, { days: 0 })).status).toBe(400);
    // Cliente do administrador não é assinante.
    const c = await owner.post("/api/clients", { name: "Revenda", email: "rev@r.local", password: "senha-rev-123" });
    expect((await owner.post(`/api/admin/subscribers/${c.body.id}/extend`, { days: 5 })).status).toBe(404);
  });

  it("admin salva a InfiniteTag pelo painel; ela passa a valer nas cobranças", async () => {
    const owner = await loginAgent();
    let o = await owner.get("/api/admin/overview");
    expect(o.body.integration).toMatchObject({ handle: "loja-teste", handleSource: "variavel" });

    expect((await owner.patch("/api/admin/settings/infinitepay", { handle: "x" })).status).toBe(404);
    const bad = await request(app).put("/api/admin/settings/infinitepay").send({ handle: "x" });
    expect(bad.status).toBe(401);
    const invalid = await owner.agent.put("/api/admin/settings/infinitepay").set("X-Forwarded-For", "10.9.9.9").set("X-CSRF-Token", owner.csrf).send({ handle: "minha loja" });
    expect(invalid.status).toBe(400);

    const ok = await owner.agent.put("/api/admin/settings/infinitepay").set("X-Forwarded-For", "10.9.9.9").set("X-CSRF-Token", owner.csrf).send({ handle: "$minhaloja" });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ handle: "minhaloja", source: "painel" });
    o = await owner.get("/api/admin/overview");
    expect(o.body.integration).toMatchObject({ handle: "minhaloja", handleSource: "painel", handleConfigured: true });
    expect(await prisma.appSetting.findUnique({ where: { key: "infinitepay_handle" } })).toMatchObject({ value: "minhaloja" });

    // Apagar volta a usar a variável do Railway.
    const cleared = await owner.agent.put("/api/admin/settings/infinitepay").set("X-Forwarded-For", "10.9.9.9").set("X-CSRF-Token", owner.csrf).send({ handle: "" });
    expect(cleared.body).toEqual({ handle: "loja-teste", source: "variavel" });

    // Assinante não pode alterar.
    await subscriber("s@s.local", null);
    const sub = await loginAgent({ email: "s@s.local", password: "senha-assinante-1" });
    const forbidden = await sub.agent.put("/api/admin/settings/infinitepay").set("X-Forwarded-For", "10.9.9.8").set("X-CSRF-Token", sub.csrf).send({ handle: "hack" });
    expect(forbidden.status).toBe(403);
  });
});
