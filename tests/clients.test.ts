import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app, loginAgent, nextIp, prisma, request, resetData } from "./helpers.js";

beforeEach(resetData);
afterAll(() => prisma.$disconnect());

const CLIENT_A = { name: "Revenda Ana", email: "ana@revenda.local", password: "senha-ana-123" };
const CLIENT_B = { name: "Revenda Beto", email: "beto@revenda.local", password: "senha-beto-123" };
const URL_A = "https://g.page/r/ana-cliente/review";

/** Dono cria um lote, dois clientes, e entrega o lote ao cliente A. */
async function setup() {
  const owner = await loginAgent();
  const batch = await owner.post("/api/plates/batch", { quantity: 3, batchName: "Lote Ana" });
  const other = await owner.post("/api/plates/batch", { quantity: 1, batchName: "Lote do dono" });
  const a = await owner.post("/api/clients", CLIENT_A);
  const b = await owner.post("/api/clients", CLIENT_B);
  expect(a.status).toBe(201);
  const assign = await owner.post(`/api/clients/${a.body.id}/assign`, { batchName: "Lote Ana" });
  expect(assign.body).toEqual({ assigned: 3, skipped: 0 });
  return {
    owner,
    clientA: a.body,
    clientB: b.body,
    plates: batch.body.items as { id: string; code: string }[],
    ownerPlate: other.body.items[0] as { id: string; code: string },
  };
}

describe("Clientes revendedores", () => {
  it("dono cadastra cliente; e-mail repetido e senha curta são recusados", async () => {
    const owner = await loginAgent();
    const res = await owner.post("/api/clients", CLIENT_A);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Revenda Ana", email: "ana@revenda.local", active: true, plates: 0 });
    expect(res.body.passwordHash).toBeUndefined();
    expect((await owner.post("/api/clients", CLIENT_A)).status).toBe(409);
    expect((await owner.post("/api/clients", { ...CLIENT_B, password: "curta" })).status).toBe(400);
    const list = await owner.get("/api/clients");
    expect(list.body.items).toHaveLength(1);
  });

  it("cliente entra, vê só as plaquinhas dele e define o link", async () => {
    const { plates, ownerPlate } = await setup();
    const a = await loginAgent(CLIENT_A);
    const session = await a.get("/api/auth/session");
    expect(session.body).toMatchObject({ role: "CLIENT", name: "Revenda Ana" });

    const list = await a.get("/api/me/plates");
    expect(list.body.total).toBe(3);
    expect(list.body.items.map((p: { id: string }) => p.id).sort()).toEqual(plates.map((p) => p.id).sort());
    expect(list.body.items[0].notes).toBeUndefined();

    const byCode = await a.get(`/api/me/plates/by-code/${plates[0].code}`);
    expect(byCode.status).toBe(200);
    expect((await a.get(`/api/me/plates/by-code/${ownerPlate.code}`)).status).toBe(404);

    const patch = await a.patch(`/api/me/plates/${plates[0].id}`, { destinationUrl: URL_A, businessName: "Pizzaria da Ana" });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ destinationUrl: URL_A, configured: true, businessName: "Pizzaria da Ana" });

    // O QR da plaquinha agora redireciona para o link definido pelo cliente.
    const r = await request(app).get(`/r/${plates[0].code}`).set("X-Forwarded-For", nextIp());
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe(URL_A);

    const hist = await a.get(`/api/me/plates/${plates[0].id}/history`);
    expect(hist.body.items[0]).toMatchObject({ previousUrl: null, newUrl: URL_A, changedBy: { name: "Revenda Ana", role: "CLIENT" } });
  });

  it("cliente não mexe em plaquinha de outro nem do dono", async () => {
    const { ownerPlate, plates } = await setup();
    const b = await loginAgent(CLIENT_B);
    expect((await b.get("/api/me/plates")).body.total).toBe(0);
    expect((await b.get(`/api/me/plates/${plates[0].id}`)).status).toBe(404);
    expect((await b.patch(`/api/me/plates/${plates[0].id}`, { destinationUrl: URL_A })).status).toBe(404);
    expect((await b.patch(`/api/me/plates/${ownerPlate.id}`, { destinationUrl: URL_A })).status).toBe(404);
    expect((await b.get(`/api/me/plates/${plates[0].id}/history`)).status).toBe(404);
    const p = await prisma.plate.findUniqueOrThrow({ where: { id: plates[0].id } });
    expect(p.destinationUrl).toBeNull();
  });

  it("cliente não acessa o painel do dono", async () => {
    const { plates, clientB } = await setup();
    const a = await loginAgent(CLIENT_A);
    for (const path of ["/api/plates", "/api/plates/stats", "/api/plates/batches", "/api/clients", `/api/plates/${plates[0].id}`]) {
      expect((await a.get(path)).status, path).toBe(403);
    }
    expect((await a.post("/api/plates/batch", { quantity: 5 })).status).toBe(403);
    expect((await a.post("/api/clients", CLIENT_B)).status).toBe(403);
    expect((await a.patch(`/api/plates/${plates[0].id}`, { clientId: clientB.id })).status).toBe(403);
    expect((await a.delete(`/api/plates/${plates[0].id}`)).status).toBe(403);
  });

  it("cliente só altera link e nome; outros campos são recusados", async () => {
    const { plates } = await setup();
    const a = await loginAgent(CLIENT_A);
    for (const body of [{ code: "XXXXXXXX" }, { active: false }, { clientId: null }, { notes: "x" }, { internalName: "x" }]) {
      expect((await a.patch(`/api/me/plates/${plates[0].id}`, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await a.patch(`/api/me/plates/${plates[0].id}`, { destinationUrl: "javascript:alert(1)" })).status).toBe(400);
  });

  it("alteração do cliente exige token CSRF", async () => {
    const { plates } = await setup();
    const a = await loginAgent(CLIENT_A);
    const res = await a.agent.patch(`/api/me/plates/${plates[0].id}`).set("X-Forwarded-For", nextIp()).send({ destinationUrl: URL_A });
    expect(res.status).toBe(403);
  });

  it("dono não usa a área do cliente", async () => {
    const owner = await loginAgent();
    expect((await owner.get("/api/me/plates")).status).toBe(403);
  });

  it("plaquinha em branco escaneada pelo cliente dono abre a tela de configurar; outro cliente vê aviso", async () => {
    const { plates } = await setup();
    const a = await loginAgent(CLIENT_A);
    const ra = await a.get(`/r/${plates[1].code}`);
    expect(ra.status).toBe(302);
    expect(ra.headers.location).toBe(`/minhas/${plates[1].id}?configurar=1`);
    const b = await loginAgent(CLIENT_B);
    const rb = await b.get(`/r/${plates[1].code}`);
    expect(rb.status).toBe(404);
    expect(rb.headers.location).toBeUndefined();
  });

  it("atribuir lote não toma plaquinhas de outro cliente sem reassign", async () => {
    const { owner, clientB, plates } = await setup();
    const r = await owner.post(`/api/clients/${clientB.id}/assign`, { batchName: "Lote Ana" });
    expect(r.body).toEqual({ assigned: 0, skipped: 3 });
    const r2 = await owner.post(`/api/clients/${clientB.id}/assign`, { plateIds: [plates[0].id], reassign: true });
    expect(r2.body.assigned).toBe(1);
    const p = await owner.get(`/api/plates/${plates[0].id}`);
    expect(p.body.client).toMatchObject({ id: clientB.id, name: "Revenda Beto" });
  });

  it("dono atribui e remove plaquinha individual e filtra por cliente", async () => {
    const { owner, clientA, ownerPlate } = await setup();
    expect((await owner.patch(`/api/plates/${ownerPlate.id}`, { clientId: clientA.id })).body.clientId).toBe(clientA.id);
    expect((await owner.get(`/api/plates?client=${clientA.id}`)).body.total).toBe(4);
    expect((await owner.patch(`/api/plates/${ownerPlate.id}`, { clientId: null })).body.clientId).toBeNull();
    expect((await owner.get("/api/plates?client=none")).body.total).toBe(1);
    // clientId precisa ser de um cliente, não do próprio dono.
    const ownerUser = await prisma.adminUser.findFirstOrThrow({ where: { role: "OWNER" } });
    expect((await owner.patch(`/api/plates/${ownerPlate.id}`, { clientId: ownerUser.id })).status).toBe(400);
  });

  it("dono vê no histórico que a troca foi feita pelo cliente", async () => {
    const { owner, plates } = await setup();
    const a = await loginAgent(CLIENT_A);
    await a.patch(`/api/me/plates/${plates[0].id}`, { destinationUrl: URL_A });
    const h = await owner.get(`/api/plates/${plates[0].id}/history`);
    expect(h.body.items[0].changedBy).toMatchObject({ name: "Revenda Ana", email: "ana@revenda.local", role: "CLIENT" });
  });

  it("desativar o cliente encerra a sessão e bloqueia o login; reativar libera", async () => {
    const { owner, clientA } = await setup();
    const a = await loginAgent(CLIENT_A);
    await owner.patch(`/api/clients/${clientA.id}`, { active: false });
    expect((await a.get("/api/me/plates")).status).toBe(401);
    const login = await request(app).post("/api/auth/login").set("X-Forwarded-For", nextIp()).send(CLIENT_A);
    expect(login.status).toBe(403);
    await owner.patch(`/api/clients/${clientA.id}`, { active: true });
    expect((await loginAgent(CLIENT_A)).csrf).toBeTruthy();
  });

  it("dono redefine a senha do cliente; a antiga para de funcionar", async () => {
    const { owner, clientA } = await setup();
    await owner.patch(`/api/clients/${clientA.id}`, { password: "nova-senha-ana" });
    const old = await request(app).post("/api/auth/login").set("X-Forwarded-For", nextIp()).send(CLIENT_A);
    expect(old.status).toBe(401);
    await loginAgent({ email: CLIENT_A.email, password: "nova-senha-ana" });
  });

  it("cliente troca a própria senha", async () => {
    await setup();
    const a = await loginAgent(CLIENT_A);
    expect((await a.post("/api/auth/password", { currentPassword: "errada", newPassword: "outra-senha-1" })).status).toBe(400);
    expect((await a.post("/api/auth/password", { currentPassword: CLIENT_A.password, newPassword: "curta" })).status).toBe(400);
    expect((await a.post("/api/auth/password", { currentPassword: CLIENT_A.password, newPassword: "outra-senha-1" })).status).toBe(204);
    expect((await a.get("/api/me/plates")).status).toBe(200);
    await loginAgent({ email: CLIENT_A.email, password: "outra-senha-1" });
  });

  it("excluir o cliente mantém as plaquinhas funcionando, sem dono", async () => {
    const { owner, clientA, plates } = await setup();
    const a = await loginAgent(CLIENT_A);
    await a.patch(`/api/me/plates/${plates[0].id}`, { destinationUrl: URL_A });
    expect((await owner.delete(`/api/clients/${clientA.id}`)).status).toBe(204);
    const p = await prisma.plate.findUniqueOrThrow({ where: { id: plates[0].id } });
    expect(p.clientId).toBeNull();
    const r = await request(app).get(`/r/${plates[0].code}`).set("X-Forwarded-For", nextIp());
    expect(r.headers.location).toBe(URL_A);
    expect((await a.get("/api/me/plates")).status).toBe(401);
  });
});
