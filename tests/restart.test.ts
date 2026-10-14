import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN, prisma, resetData, samplePlate } from "./helpers.js";

// Sobe o build de produção (dist/) como processo real, derruba e sobe de novo.
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  APP_BASE_URL: "https://qr.teste.local",
  ADMIN_EMAIL: "",
  ADMIN_PASSWORD: "",
};

let proc: ChildProcess | undefined;

async function start() {
  proc = spawn("node", ["dist/server/index.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  proc.stdout!.on("data", (d) => (output += d));
  proc.stderr!.on("data", (d) => (output += d));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      /* ainda subindo */
    }
    if (proc.exitCode !== null) throw new Error(`servidor saiu: ${output}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`servidor não respondeu: ${output}`);
}

async function stop() {
  if (!proc || proc.exitCode !== null) return;
  const p = proc;
  await new Promise<void>((resolve) => {
    p.once("exit", () => resolve());
    p.kill("SIGTERM");
  });
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.9.9.9" },
    body: JSON.stringify(ADMIN),
  });
  expect(r.status).toBe(200);
  const setCookie = r.headers.get("set-cookie")!;
  expect(setCookie).toMatch(/^__Host-qr_session=/);
  expect(setCookie).toMatch(/Secure/);
  expect(setCookie).toMatch(/HttpOnly/);
  const cookie = setCookie.split(";")[0];
  const { csrfToken } = (await r.json()) as { csrfToken: string };
  return { cookie, csrfToken };
}

describe("11. Funcionamento após reinicialização (build de produção)", () => {
  beforeAll(resetData);
  afterAll(async () => {
    await stop();
    await prisma.$disconnect();
  });

  it("registro, sessão e redirecionamento sobrevivem ao restart do processo", async () => {
    await start();
    const { cookie, csrfToken } = await login();
    const created = await fetch(`${BASE}/api/plates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrfToken },
      body: JSON.stringify(samplePlate),
    });
    expect(created.status).toBe(201);
    const plate = (await created.json()) as { id: string; code: string; permanentUrl: string };

    const r1 = await fetch(`${BASE}/r/${plate.code}`, { redirect: "manual" });
    expect(r1.status).toBe(302);
    expect(r1.headers.get("location")).toBe(samplePlate.destinationUrl);

    // O painel (build do Vite) é servido pelo mesmo serviço
    const html = await fetch(`${BASE}/plaquinhas/${plate.id}`);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain('<div id="root">');

    await stop();
    await expect(fetch(`${BASE}/health`)).rejects.toThrow();
    await start();

    const r2 = await fetch(`${BASE}/r/${plate.code}`, { redirect: "manual" });
    expect(r2.status).toBe(302);
    expect(r2.headers.get("location")).toBe(samplePlate.destinationUrl);

    // A sessão está no banco, então continua válida depois do restart
    const again = await fetch(`${BASE}/api/plates/${plate.id}`, { headers: { Cookie: cookie } });
    expect(again.status).toBe(200);
    const body = (await again.json()) as { code: string; permanentUrl: string };
    expect(body.code).toBe(plate.code);
    expect(body.permanentUrl).toBe(plate.permanentUrl);

    // Alteração após o restart também vale imediatamente
    const patched = await fetch(`${BASE}/api/plates/${plate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ destinationUrl: "https://wa.me/5511988887777" }),
    });
    expect(patched.status).toBe(200);
    const r3 = await fetch(`${BASE}/r/${plate.code}`, { redirect: "manual" });
    expect(r3.headers.get("location")).toBe("https://wa.me/5511988887777");
    expect(r3.headers.get("strict-transport-security")).toContain("max-age=");
  });
});
