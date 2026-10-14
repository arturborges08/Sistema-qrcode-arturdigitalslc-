import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { PrismaClient } from "@prisma/client";
import { app, loginAgent, prisma, request, resetData, samplePlate } from "./helpers.js";
import { qrSvg } from "../server/src/lib/qr.js";

beforeEach(resetData);
afterAll(() => prisma.$disconnect());

function decodePng(buf: Buffer): string | null {
  const png = PNG.sync.read(buf);
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
}

describe("1. Cadastro de plaquinha", () => {
  it("cria o registro com código aleatório, endereço permanente e histórico inicial", async () => {
    const c = await loginAgent();
    const res = await c.post("/api/plates", samplePlate);
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[23456789A-HJ-NP-Za-km-z]{8}$/);
    expect(res.body.permanentUrl).toBe(`https://qr.teste.local/r/${res.body.code}`);
    expect(res.body).toMatchObject({ ...samplePlate, active: true });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);

    const hist = await c.get(`/api/plates/${res.body.id}/history`);
    expect(hist.body.items).toHaveLength(1);
    expect(hist.body.items[0]).toMatchObject({ previousUrl: null, newUrl: samplePlate.destinationUrl });
  });

  it("gera códigos distintos para cadastros diferentes", async () => {
    const c = await loginAgent();
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) codes.add((await c.post("/api/plates", samplePlate)).body.code);
    expect(codes.size).toBe(20);
  });

  it("rejeita campos obrigatórios vazios", async () => {
    const c = await loginAgent();
    const res = await c.post("/api/plates", { ...samplePlate, businessName: "  " });
    expect(res.status).toBe(400);
    expect(res.body.error.fields[0].path).toBe("businessName");
  });

  it("não aceita que o cliente escolha o código", async () => {
    const c = await loginAgent();
    const res = await c.post("/api/plates", { ...samplePlate, code: "ESCOLHIDO" });
    expect(res.status).toBe(201);
    expect(res.body.code).not.toBe("ESCOLHIDO");
  });
});

describe("2. Geração de QR Code", () => {
  it("o PNG decodificado contém o endereço permanente, não o destino", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    for (const size of ["screen", "print"]) {
      const res = await c.get(`/api/plates/${p.id}/qr.png?size=${size}`).buffer(true);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("image/png");
      const decoded = decodePng(res.body as Buffer);
      expect(decoded).toBe(p.permanentUrl);
      expect(decoded).not.toContain("g.page");
    }
    const print = PNG.sync.read((await c.get(`/api/plates/${p.id}/qr.png?size=print`).buffer(true)).body);
    expect(print.width).toBe(3000);
  });

  it("o SVG é gerado a partir do endereço permanente e é idêntico em downloads repetidos", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    const a = await c.get(`/api/plates/${p.id}/qr.svg`);
    const b = await c.get(`/api/plates/${p.id}/qr.svg?download=1`);
    expect(a.headers["content-type"]).toContain("image/svg+xml");
    expect(b.headers["content-disposition"]).toContain(`${p.code}.svg`);
    const svgA = a.text ?? (a.body as Buffer).toString();
    const svgB = b.text ?? (b.body as Buffer).toString();
    expect(svgA).toBe(svgB);
    expect(svgA).toBe(await qrSvg(p.permanentUrl));
    const after = await c.get(`/api/plates/${p.id}`);
    expect(after.body.code).toBe(p.code);
  });
});

describe("3. Redirecionamento", () => {
  it("/r/:code responde 302 para o destino cadastrado, sem cache", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    const res = await request(app).get(`/r/${p.code}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(samplePlate.destinationUrl);
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  it("o visitante não precisa de login (requisição sem cookie)", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    const res = await request(app).get(`/r/${p.code}`).set("Cookie", "");
    expect(res.status).toBe(302);
  });

  it("código é sensível a maiúsculas/minúsculas", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    const swapped = p.code.replace(/[a-zA-Z]/g, (ch: string) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()));
    if (swapped !== p.code) expect((await request(app).get(`/r/${swapped}`)).status).toBe(404);
  });
});

describe("4. Alteração do destino", () => {
  it("altera o destino sem alterar código nem endereço permanente; mesmo QR leva ao novo destino", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    const qrBefore = decodePng((await c.get(`/api/plates/${p.id}/qr.png`).buffer(true)).body);

    const novo = "https://wa.me/5511999999999";
    const res = await c.patch(`/api/plates/${p.id}`, { destinationUrl: novo });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(p.code);
    expect(res.body.permanentUrl).toBe(p.permanentUrl);
    expect(res.body.destinationUrl).toBe(novo);

    const qrAfter = decodePng((await c.get(`/api/plates/${p.id}/qr.png`).buffer(true)).body);
    expect(qrAfter).toBe(qrBefore);

    const r = await request(app).get(`/r/${p.code}`);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe(novo);

    const hist = (await c.get(`/api/plates/${p.id}/history`)).body.items;
    expect(hist).toHaveLength(2);
    expect(hist[0]).toMatchObject({ previousUrl: samplePlate.destinationUrl, newUrl: novo });
  });

  it("editar nome não altera o código e não gera histórico de destino", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    const res = await c.patch(`/api/plates/${p.id}`, { businessName: "Outro Nome", internalName: "Mesa 2" });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(p.code);
    expect((await c.get(`/api/plates/${p.id}/history`)).body.items).toHaveLength(1);
  });

  it("a API rejeita tentativa de enviar um novo código", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    const res = await c.patch(`/api/plates/${p.id}`, { code: "NOVOCOD1" });
    expect(res.status).toBe(400);
    expect((await c.get(`/api/plates/${p.id}`)).body.code).toBe(p.code);
  });

  it("o banco recusa alteração do código mesmo por SQL direto (trigger)", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    await expect(prisma.$executeRaw`UPDATE plates SET code = 'XXXXXXXX' WHERE id = ${p.id}::uuid`).rejects.toThrow(
      /não pode ser alterado/,
    );
  });
});

describe("5. Persistência no PostgreSQL", () => {
  it("dados criados pela API são lidos por uma conexão independente", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    await c.patch(`/api/plates/${p.id}`, { destinationUrl: "https://example.org/novo" });

    const other = new PrismaClient();
    try {
      const row = await other.plate.findUnique({ where: { code: p.code }, include: { changes: true } });
      expect(row).not.toBeNull();
      expect(row!.destinationUrl).toBe("https://example.org/novo");
      expect(row!.businessName).toBe(samplePlate.businessName);
      expect(row!.changes).toHaveLength(2);
      const [{ count }] = await other.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM plates`;
      expect(Number(count)).toBe(1);
    } finally {
      await other.$disconnect();
    }
  });

  it("estatísticas do painel vêm do banco", async () => {
    const c = await loginAgent();
    await c.post("/api/plates", samplePlate);
    await c.post("/api/plates", { ...samplePlate, active: false });
    await c.post("/api/plates", samplePlate);
    const s = await c.get("/api/plates/stats");
    expect(s.body).toMatchObject({ total: 3, active: 2, inactive: 1 });
    expect(s.body.recent).toHaveLength(3);
  });

  it("exclusão remove o registro e o histórico", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    expect((await c.delete(`/api/plates/${p.id}`)).status).toBe(204);
    expect((await c.get(`/api/plates/${p.id}`)).status).toBe(404);
    expect(await prisma.destinationChange.count({ where: { plateId: p.id } })).toBe(0);
    expect((await request(app).get(`/r/${p.code}`)).status).toBe(404);
  });
});

describe("7. Rejeição de URLs inválidas", () => {
  const invalid = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://exemplo.com/arquivo",
    "//evil.com",
    "evil.com",
    "https://",
    "https://user:senha@exemplo.com",
    "https://exemplo .com",
    "https://exemplo.com/\u0000",
    " ",
    "https://exemplo.com/" + "a".repeat(2100),
  ];
  for (const url of invalid) {
    it(`rejeita ${JSON.stringify(url.slice(0, 50))}`, async () => {
      const c = await loginAgent();
      const created = await c.post("/api/plates", { ...samplePlate, destinationUrl: url });
      expect(created.status).toBe(400);
      expect(created.body.error.fields[0].path).toBe("destinationUrl");
    });
  }

  it("rejeita URL inválida na edição e mantém o destino anterior", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    const res = await c.patch(`/api/plates/${p.id}`, { destinationUrl: "javascript:alert(document.cookie)" });
    expect(res.status).toBe(400);
    expect((await c.get(`/api/plates/${p.id}`)).body.destinationUrl).toBe(samplePlate.destinationUrl);
  });

  it("aceita e normaliza URLs válidas", async () => {
    const c = await loginAgent();
    const res = await c.post("/api/plates", { ...samplePlate, destinationUrl: "  HTTPS://Exemplo.com.br/caminho?x=1  " });
    expect(res.status).toBe(201);
    expect(res.body.destinationUrl).toBe("https://exemplo.com.br/caminho?x=1");
  });
});

describe("8. Identificadores inexistentes", () => {
  it.each(["ABCDEFGH", "zzzz9999", "a", "../../etc", "abc%20def", "a".repeat(40)])("GET /r/%s → 404 com página amigável", async (code) => {
    const res = await request(app).get(`/r/${code}`);
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Link não encontrado");
    expect(res.headers.location).toBeUndefined();
  });

  it("API devolve 404 para id inexistente e 400 para id malformado", async () => {
    const c = await loginAgent();
    expect((await c.get("/api/plates/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await c.patch("/api/plates/00000000-0000-4000-8000-000000000000", { active: false })).status).toBe(404);
    expect((await c.get("/api/plates/123")).status).toBe(400);
  });
});

describe("9. Registros inativos", () => {
  it("plaquinha inativa não redireciona e não expõe o destino; ao reativar volta a funcionar", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", { ...samplePlate, notes: "nota interna secreta" })).body;
    await c.patch(`/api/plates/${p.id}`, { active: false });

    const res = await request(app).get(`/r/${p.code}`);
    expect(res.status).toBe(410);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain("temporariamente indisponível");
    expect(res.text).not.toContain("g.page");
    expect(res.text).not.toContain("secreta");
    expect(res.text).not.toContain(samplePlate.businessName);

    await c.patch(`/api/plates/${p.id}`, { active: true });
    const again = await request(app).get(`/r/${p.code}`);
    expect(again.status).toBe(302);
  });
});

describe("10. Proteção contra redirecionamento aberto", () => {
  it("parâmetros do visitante nunca alteram o destino", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    const attempts = [
      `/r/${p.code}?url=https://evil.com`,
      `/r/${p.code}?next=//evil.com&redirect=https://evil.com&destination=https://evil.com`,
      `/r/${p.code}/https://evil.com`,
    ];
    for (const path of attempts) {
      const res = await request(app).get(path).set("Referer", "https://evil.com").set("X-Forwarded-Host", "evil.com");
      if (res.status === 302) expect(res.headers.location).toBe(samplePlate.destinationUrl);
      else expect(res.status).toBe(404);
      expect(res.headers.location ?? "").not.toContain("evil.com");
    }
  });

  it("caminhos que imitam URLs externas não redirecionam", async () => {
    for (const path of ["/r/https:%2F%2Fevil.com", "/r//evil.com", "/r/%2F%2Fevil.com", "/r/evil.com"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.headers.location).toBeUndefined();
    }
  });

  it("não há rota pública que aceite destino arbitrário", async () => {
    const res = await request(app).post(`/r/abc`).send({ url: "https://evil.com" });
    expect([404, 405]).toContain(res.status);
    expect(res.headers.location).toBeUndefined();
  });

  it("um destino inválido gravado diretamente no banco não é seguido", async () => {
    const c = await loginAgent();
    const p = (await c.post("/api/plates", samplePlate)).body;
    // A constraint do banco já bloqueia esquemas não-http; testamos a camada da aplicação com URL http com credenciais.
    await prisma.$executeRaw`UPDATE plates SET destination_url = 'https://u:p@evil.com' WHERE id = ${p.id}::uuid`;
    const res = await request(app).get(`/r/${p.code}`);
    expect(res.status).toBe(500);
    expect(res.headers.location).toBeUndefined();
    await expect(prisma.$executeRaw`UPDATE plates SET destination_url = 'javascript:alert(1)' WHERE id = ${p.id}::uuid`).rejects.toThrow();
  });
});
