import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { app, loginAgent, prisma, request, resetData } from "./helpers.js";

beforeEach(resetData);
afterAll(() => prisma.$disconnect());

describe("Lote de plaquinhas em branco", () => {
  it("gera N plaquinhas únicas, sem destino, agrupadas no lote", async () => {
    const c = await loginAgent();
    const res = await c.post("/api/plates/batch", { quantity: 50, batchName: "Gráfica outubro" });
    expect(res.status).toBe(201);
    expect(res.body.batchName).toBe("Gráfica outubro");
    expect(res.body.items).toHaveLength(50);
    const codes = new Set(res.body.items.map((p: { code: string }) => p.code));
    expect(codes.size).toBe(50);
    for (const p of res.body.items) {
      expect(p).toMatchObject({ configured: false, destinationUrl: null, businessName: null, batchName: "Gráfica outubro", active: true });
    }
    expect(res.body.items[0].internalName).toBe("Gráfica outubro · 001");
    expect(res.body.items[49].internalName).toBe("Gráfica outubro · 050");
    expect(await prisma.plate.count({ where: { batchName: "Gráfica outubro" } })).toBe(50);
  });

  it("um segundo lote com o mesmo nome continua a numeração", async () => {
    const c = await loginAgent();
    await c.post("/api/plates/batch", { quantity: 3, batchName: "L" });
    const res = await c.post("/api/plates/batch", { quantity: 2, batchName: "L" });
    expect(res.body.items.map((p: { internalName: string }) => p.internalName)).toEqual(["L · 004", "L · 005"]);
  });

  it("usa nome automático quando não informado", async () => {
    const c = await loginAgent();
    const res = await c.post("/api/plates/batch", { quantity: 1 });
    expect(res.body.batchName).toMatch(/^Lote \d{2}\/\d{2}\/\d{4}/);
  });

  it("rejeita quantidades inválidas", async () => {
    const c = await loginAgent();
    for (const quantity of [0, -1, 201, 2.5, "abc"]) {
      const r = await c.post("/api/plates/batch", { quantity });
      expect(r.status).toBe(400);
    }
    expect(await prisma.plate.count()).toBe(0);
  });

  it("exige login e CSRF", async () => {
    expect((await request(app).post("/api/plates/batch").send({ quantity: 5 })).status).toBe(401);
    const c = await loginAgent();
    expect((await c.agent.post("/api/plates/batch").send({ quantity: 5 })).status).toBe(403);
  });

  it("a folha do lote traz um QR por plaquinha, cada um com seu endereço permanente", async () => {
    const c = await loginAgent();
    const created = (await c.post("/api/plates/batch", { quantity: 4, batchName: "F" })).body.items;
    const sheet = await c.get(`/api/plates/batch-qr?batch=F`);
    expect(sheet.status).toBe(200);
    expect(sheet.body.items).toHaveLength(4);
    for (const [i, item] of sheet.body.items.entries()) {
      expect(item.code).toBe(created[i].code);
      expect(item.permanentUrl).toBe(`https://qr.teste.local/r/${created[i].code}`);
      expect(item.svgDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    }
    // O PNG individual de uma plaquinha do lote decodifica para o endereço dela
    const png = PNG.sync.read((await c.get(`/api/plates/${created[2].id}/qr.png`).buffer(true)).body);
    expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(created[2].permanentUrl);
  });

  it("lista lotes com total e quantas faltam configurar", async () => {
    const c = await loginAgent();
    const items = (await c.post("/api/plates/batch", { quantity: 3, batchName: "A" })).body.items;
    await c.patch(`/api/plates/${items[0].id}`, { businessName: "Cliente", destinationUrl: "https://exemplo.com" });
    const res = await c.get("/api/plates/batches");
    expect(res.body.items).toEqual([expect.objectContaining({ batchName: "A", total: 3, unconfigured: 2 })]);
    const stats = await c.get("/api/plates/stats");
    expect(stats.body.unconfigured).toBe(2);
    const filtered = await c.get("/api/plates?status=unconfigured");
    expect(filtered.body.total).toBe(2);
    const byBatch = await c.get("/api/plates?batch=A");
    expect(byBatch.body.total).toBe(3);
  });
});

describe("Escanear plaquinha em branco", () => {
  it("visitante vê aviso, sem redirecionar e sem dados internos", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates/batch", { quantity: 1, batchName: "Segredo interno" })).body.items[0];
    const res = await request(app).get(`/r/${p.code}`);
    expect(res.status).toBe(404);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain("ainda não ativada");
    expect(res.text).not.toContain("Segredo interno");
    expect(res.text).not.toContain(p.id);
    expect(res.text).toContain(`/login?voltar=%2Fr%2F${p.code}`);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers.vary).toContain("Cookie");
  });

  it("administrador logado é levado à tela de configuração da plaquinha", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates/batch", { quantity: 1 })).body.items[0];
    const res = await c.get(`/r/${p.code}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/plaquinhas/${p.id}?configurar=1`);
  });

  it("cookie inválido é tratado como visitante", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates/batch", { quantity: 1 })).body.items[0];
    const res = await request(app).get(`/r/${p.code}`).set("Cookie", "qr_session=falso");
    expect(res.status).toBe(404);
  });

  it("depois de configurar, o mesmo QR leva ao link para todos, inclusive o admin", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates/batch", { quantity: 1 })).body.items[0];
    const saved = await c.patch(`/api/plates/${p.id}`, {
      businessName: "Pizzaria Bella",
      internalName: "Balcão",
      destinationUrl: "https://g.page/r/pizzaria/review",
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ configured: true, code: p.code, permanentUrl: p.permanentUrl });
    expect((await request(app).get(`/r/${p.code}`)).headers.location).toBe("https://g.page/r/pizzaria/review");
    expect((await c.get(`/r/${p.code}`)).headers.location).toBe("https://g.page/r/pizzaria/review");
    const hist = (await c.get(`/api/plates/${p.id}/history`)).body.items;
    expect(hist).toEqual([expect.objectContaining({ previousUrl: null, newUrl: "https://g.page/r/pizzaria/review" })]);
  });

  it("plaquinha em branco desativada mostra aviso de inativa", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates/batch", { quantity: 1 })).body.items[0];
    await c.patch(`/api/plates/${p.id}`, { active: false });
    expect((await c.get(`/r/${p.code}`)).status).toBe(410);
  });

  it("busca por código (usada pelo leitor da câmera)", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates/batch", { quantity: 1 })).body.items[0];
    expect((await c.get(`/api/plates/by-code/${p.code}`)).body.id).toBe(p.id);
    expect((await c.get(`/api/plates/by-code/NaoExiste9`)).status).toBe(404);
    expect((await c.get(`/api/plates/by-code/../x`)).status).not.toBe(200);
    expect((await request(app).get(`/api/plates/by-code/${p.code}`)).status).toBe(401);
  });

  it("não é possível apagar o link de uma plaquinha já configurada", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates/batch", { quantity: 1 })).body.items[0];
    await c.patch(`/api/plates/${p.id}`, { destinationUrl: "https://exemplo.com" });
    const r = await c.patch(`/api/plates/${p.id}`, { destinationUrl: null });
    expect(r.status).toBe(400);
  });
});
