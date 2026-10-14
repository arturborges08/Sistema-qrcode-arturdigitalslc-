// Teste de ponta a ponta no navegador (Chromium) contra o build real e o PostgreSQL de desenvolvimento.
// Uso: npm run build && npm run test:e2e
// Requer DATABASE_URL apontando para um banco com as migrations aplicadas.
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import jsQR from "jsqr";

const APP_PORT = 3100;
const DEST_PORT = 4501;
const BASE = `http://localhost:${APP_PORT}`;
const ADMIN = { email: "e2e@teste.local", password: "senha-e2e-bem-forte-1" };
const SHOTS = "e2e/screenshots";
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// Servidor que simula os destinos (Google, WhatsApp)
const dest = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<h1>DESTINO ${req.url}</h1>`);
});
await new Promise((r) => dest.listen(DEST_PORT, r));

// Cria/atualiza o admin de teste com o script oficial
await new Promise((resolve, reject) => {
  const p = spawn("node", ["dist/server/scripts/set-admin.js", ADMIN.email], {
    env: { ...process.env, ADMIN_PASSWORD: ADMIN.password },
    stdio: "inherit",
  });
  p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("set-admin falhou"))));
});

const app = spawn("node", ["dist/server/index.js"], {
  env: { ...process.env, NODE_ENV: "development", PORT: String(APP_PORT), APP_BASE_URL: BASE, ADMIN_EMAIL: "", ADMIN_PASSWORD: "" },
  stdio: ["ignore", "ignore", "inherit"],
});
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(`${BASE}/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const consoleErrors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-BR", acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  // Acesso sem login redireciona para o login
  await page.goto(`${BASE}/plaquinhas`);
  await page.waitForURL("**/login");
  check("rota do painel sem login leva ao /login", page.url().endsWith("/login"));
  await page.screenshot({ path: `${SHOTS}/01-login.png` });

  // Senha errada
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", "senha-errada-123");
  await page.click("button[type=submit]");
  await page.getByText("E-mail ou senha inválidos").waitFor();
  check("senha errada mostra erro", true);

  // Login correto
  await page.fill("#password", ADMIN.password);
  await page.click("button[type=submit]");
  await page.getByRole("heading", { name: "Plaquinhas" }).waitFor();
  check("login correto volta para a página pedida", page.url().endsWith("/plaquinhas"));

  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: "Visão geral" }).waitFor();
  const totalBefore = Number(await page.locator("text=Total cadastrado >> xpath=following-sibling::p").innerText());
  await page.screenshot({ path: `${SHOTS}/02-dashboard.png`, fullPage: true });

  // Cadastro
  await page.getByRole("link", { name: "Nova plaquinha" }).first().click();
  await page.fill("#businessName", "Café do Teste E2E");
  await page.fill("#internalName", "Mesa 1");
  await page.fill("#destinationUrl", "javascript:alert(1)");
  await page.getByRole("button", { name: "Cadastrar plaquinha" }).click();
  await page.getByText("A URL deve começar com http:// ou https://").waitFor();
  check("formulário recusa javascript:", true);
  await page.fill("#destinationUrl", `http://127.0.0.1:${DEST_PORT}/google-avaliacao`);
  await page.fill("#notes", "nota interna");
  await page.getByRole("button", { name: "Cadastrar plaquinha" }).click();
  await page.waitForURL(/\/plaquinhas\/[0-9a-f-]{36}$/);
  const plateId = page.url().split("/").pop();
  const permanent = (await page.getByTestId("permanent-url").innerText()).trim();
  check("cadastro cria endereço permanente", /^http:\/\/localhost:3100\/r\/[A-Za-z0-9]{8}$/.test(permanent), permanent);

  // QR exibido e decodificável
  const img = page.locator(`img[alt^="QR Code do endereço"]:visible`);
  await img.waitFor();
  await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await img.elementHandle());
  check("pré-visualização do QR carregou", true);
  await page.screenshot({ path: `${SHOTS}/03-detalhe.png`, fullPage: true });

  const pngBytes = await page.evaluate(async (id) => {
    const r = await fetch(`/api/plates/${id}/qr.png?size=print`);
    return Array.from(new Uint8Array(await r.arrayBuffer()));
  }, plateId);
  const png = PNG.sync.read(Buffer.from(pngBytes));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
  check("QR PNG de impressão decodifica para o endereço permanente", decoded === permanent, `${decoded} / ${png.width}px`);

  // Download do SVG
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /SVG vetorial/ }).locator("visible=true").click()]);
  const svgPath = `${SHOTS}/download.svg`;
  await download.saveAs(svgPath);
  const svg = fs.readFileSync(svgPath, "utf8");
  check("download SVG funciona", svg.startsWith("<svg") && download.suggestedFilename().endsWith(".svg"), download.suggestedFilename());

  // Visitante lê o QR → destino 1
  const visitor = await browser.newContext();
  const vpage = await visitor.newPage();
  await vpage.goto(permanent);
  check("visitante sem login é redirecionado ao destino", (await vpage.locator("h1").innerText()) === "DESTINO /google-avaliacao", vpage.url());

  // Troca de destino
  await page.fill("#newDestination", "data:text/html,oi");
  await page.getByRole("button", { name: "Salvar destino" }).click();
  await page.getByText("A URL deve começar com http:// ou https://").waitFor();
  check("troca de destino recusa data:", true);
  await page.fill("#newDestination", `http://127.0.0.1:${DEST_PORT}/whatsapp`);
  await page.getByRole("button", { name: "Salvar destino" }).click();
  await page.getByText("O endereço permanente continua idêntico").waitFor();
  const permanentAfter = (await page.getByTestId("permanent-url").innerText()).trim();
  check("endereço permanente idêntico após troca", permanentAfter === permanent);
  check("destino exibido atualizado", (await page.getByTestId("destination-url").innerText()).includes("/whatsapp"));
  await page.getByTestId("history").locator("li").nth(1).waitFor();
  check("histórico mostra 2 registros", (await page.getByTestId("history").locator("li").count()) === 2);
  await page.screenshot({ path: `${SHOTS}/04-destino-alterado.png`, fullPage: true });

  await vpage.goto(permanent);
  check("mesmo QR agora abre o novo destino", (await vpage.locator("h1").innerText()) === "DESTINO /whatsapp");

  // Desativar
  await page.getByRole("switch").click();
  await page.getByText("Plaquinha desativada").waitFor();
  const inactiveRes = await vpage.goto(permanent);
  check("plaquinha inativa mostra aviso", inactiveRes.status() === 410 && (await vpage.content()).includes("temporariamente indisponível"));
  await vpage.screenshot({ path: `${SHOTS}/05-inativa-visitante.png` });
  await page.getByRole("switch").click();
  await page.getByText("Plaquinha ativada").waitFor();
  await vpage.goto(permanent);
  check("reativada volta a redirecionar", (await vpage.locator("h1").innerText()) === "DESTINO /whatsapp");

  const nf = await vpage.goto(`${BASE}/r/NaoExiste9`);
  check("código inexistente mostra página amigável", nf.status() === 404 && (await vpage.content()).includes("Link não encontrado"));
  await vpage.screenshot({ path: `${SHOTS}/06-nao-encontrado.png` });

  // Página de impressão
  await page.getByRole("link", { name: "Imprimir só o QR Code" }).locator("visible=true").click();
  await page.waitForURL(/imprimir$/);
  await page.locator(`img[alt^="QR Code http"]`).waitFor();
  await page.screenshot({ path: `${SHOTS}/07-impressao.png` });
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: `${SHOTS}/08-impressao-midia-print.png` });
  await page.emulateMedia({ media: "screen" });
  check("página de impressão abre", true);

  // Dashboard reflete o banco
  await page.goto(`${BASE}/`);
  await page.getByText("Café do Teste E2E").first().waitFor();
  const totalAfter = Number(await page.locator("text=Total cadastrado >> xpath=following-sibling::p").innerText());
  check("dashboard contou o novo registro", totalAfter === totalBefore + 1, `${totalBefore} → ${totalAfter}`);

  // Exclusão com confirmação
  await page.goto(`${BASE}/plaquinhas/${plateId}`);
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: `${SHOTS}/09-confirmar-exclusao.png` });
  await page.getByRole("button", { name: "Cancelar" }).click();
  check("cancelar não exclui", (await (await fetch(`${BASE}/r/${permanent.split("/").pop()}`, { redirect: "manual" })).status) === 302);
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();
  await page.waitForURL(/\/plaquinhas$/);
  check("exclusão confirmada remove", (await (await fetch(`${BASE}/r/${permanent.split("/").pop()}`, { redirect: "manual" })).status) === 404);

  // Celular
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mobile.addCookies(await ctx.cookies());
  const m = await mobile.newPage();
  m.on("console", (msg) => msg.type() === "error" && consoleErrors.push(msg.text()));
  await m.goto(`${BASE}/`);
  await m.getByRole("heading", { name: "Visão geral" }).waitFor();
  await m.screenshot({ path: `${SHOTS}/10-mobile-dashboard.png`, fullPage: true });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check("dashboard sem rolagem horizontal no celular", !overflow);
  await m.goto(`${BASE}/plaquinhas/nova`);
  await m.fill("#businessName", "Loja Mobile");
  await m.fill("#internalName", "Vitrine");
  await m.fill("#destinationUrl", `http://127.0.0.1:${DEST_PORT}/insta`);
  await m.getByRole("button", { name: "Cadastrar plaquinha" }).click();
  await m.waitForURL(/\/plaquinhas\/[0-9a-f-]{36}$/);
  await m.locator(`img[alt^="QR Code do endereço"]:visible`).waitFor();
  await m.screenshot({ path: `${SHOTS}/11-mobile-detalhe.png`, fullPage: true });
  const overflow2 = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check("detalhe sem rolagem horizontal no celular", !overflow2);
  await m.goto(`${BASE}/plaquinhas`);
  await m.getByText("Loja Mobile").first().waitFor();
  await m.screenshot({ path: `${SHOTS}/12-mobile-lista.png`, fullPage: true });

  // Logout
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL("**/login");
  await page.goto(`${BASE}/`);
  await page.waitForURL("**/login");
  check("logout encerra a sessão", true);

  check("nenhum erro no console do navegador (inclui violações de CSP)", consoleErrors.filter((e) => !e.includes("401") && !e.includes("Unauthorized")).length === 0, consoleErrors.join(" | "));
} catch (e) {
  check("execução sem exceções", false, e.message);
} finally {
  await browser.close();
  app.kill("SIGTERM");
  dest.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
