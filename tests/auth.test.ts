import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN, app, loginAgent, nextIp, prisma, request, resetData, samplePlate } from "./helpers.js";

beforeEach(resetData);
afterAll(() => prisma.$disconnect());

describe("6. Bloqueio de acesso não autenticado", () => {
  const routes: [string, string][] = [
    ["get", "/api/plates"],
    ["get", "/api/plates/stats"],
    ["post", "/api/plates"],
    ["get", "/api/plates/00000000-0000-4000-8000-000000000000"],
    ["patch", "/api/plates/00000000-0000-4000-8000-000000000000"],
    ["delete", "/api/plates/00000000-0000-4000-8000-000000000000"],
    ["get", "/api/plates/00000000-0000-4000-8000-000000000000/history"],
    ["get", "/api/plates/00000000-0000-4000-8000-000000000000/qr.png"],
    ["get", "/api/plates/00000000-0000-4000-8000-000000000000/qr.svg"],
    ["get", "/api/auth/session"],
  ];
  for (const [method, path] of routes) {
    it(`${method.toUpperCase()} ${path} sem sessão → 401`, async () => {
      const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path).send(samplePlate);
      expect(res.status).toBe(401);
    });
  }

  it("cookie forjado ou antigo é recusado", async () => {
    const res = await request(app).get("/api/plates").set("Cookie", "qr_session=forjado123");
    expect(res.status).toBe(401);
  });

  it("sessão expirada é recusada e removida", async () => {
    const c = await loginAgent();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await c.get("/api/plates")).status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it("alterações sem token CSRF são recusadas mesmo com sessão válida", async () => {
    const c = await loginAgent();
    const noCsrf = await c.agent.post("/api/plates").send(samplePlate);
    expect(noCsrf.status).toBe(403);
    const wrong = await c.agent.post("/api/plates").set("X-CSRF-Token", "x".repeat(43)).send(samplePlate);
    expect(wrong.status).toBe(403);
    expect(await prisma.plate.count()).toBe(0);
  });

  it("logout invalida a sessão no servidor", async () => {
    const c = await loginAgent();
    expect((await c.post("/api/auth/logout")).status).toBe(204);
    expect((await c.get("/api/plates")).status).toBe(401);
  });
});

describe("Login", () => {
  it("senha errada e e-mail inexistente recebem a mesma resposta", async () => {
    const ip = nextIp();
    const a = await request(app).post("/api/auth/login").set("X-Forwarded-For", ip).send({ ...ADMIN, password: "errada-errada" });
    const b = await request(app).post("/api/auth/login").set("X-Forwarded-For", ip).send({ email: "ninguem@x.com", password: "qualquer" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it("define cookie HttpOnly e SameSite; o token não aparece no corpo", async () => {
    const res = await request(app).post("/api/auth/login").set("X-Forwarded-For", nextIp()).send(ADMIN);
    expect(res.status).toBe(200);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const token = /qr_session=([^;]+)/.exec(cookie)![1];
    expect(JSON.stringify(res.body)).not.toContain(token);
    // O banco guarda só o hash do token
    const s = await prisma.session.findFirst();
    expect(s!.tokenHash).not.toBe(token);
    expect(s!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("senha é guardada com hash scrypt, nunca em texto", async () => {
    const a = await prisma.adminUser.findFirst();
    expect(a!.passwordHash).toMatch(/^scrypt\$/);
    expect(a!.passwordHash).not.toContain(ADMIN.password);
  });

  it("login exige JSON (formulário de outro site não funciona)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", nextIp())
      .type("form")
      .send({ email: ADMIN.email, password: ADMIN.password });
    expect(res.status).toBe(415);
  });

  it("bloqueia após 10 tentativas erradas do mesmo IP, inclusive com a senha certa", async () => {
    const ip = nextIp();
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post("/api/auth/login").set("X-Forwarded-For", ip).send({ ...ADMIN, password: `errada-${i}` });
      expect(r.status).toBe(401);
    }
    const blocked = await request(app).post("/api/auth/login").set("X-Forwarded-For", ip).send(ADMIN);
    expect(blocked.status).toBe(429);
    const otherIp = await request(app).post("/api/auth/login").set("X-Forwarded-For", nextIp()).send(ADMIN);
    expect(otherIp.status).toBe(200);
  });

  it("não existe rota pública de cadastro de usuário", async () => {
    for (const p of ["/api/auth/register", "/api/auth/signup", "/api/users"]) {
      const r = await request(app).post(p).send({ email: "x@x.com", password: "123456789012" });
      expect([401, 404]).toContain(r.status);
    }
    expect(await prisma.adminUser.count()).toBe(1);
  });
});

describe("Saúde e cabeçalhos", () => {
  it("/health confirma conexão com o banco", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "ok" });
  });

  it("aplica cabeçalhos de segurança", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("textos com HTML são guardados como texto e devolvidos como JSON (sem execução)", async () => {
    const c = await loginAgent();
    const res = await c.post("/api/plates", { ...samplePlate, businessName: "<script>alert(1)</script>" });
    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.businessName).toBe("<script>alert(1)</script>");
  });
});
