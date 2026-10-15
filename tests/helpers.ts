import request from "supertest";
import { createApp } from "../server/src/app.js";
import { upsertAdmin } from "../server/src/admin.js";
import { prisma } from "../server/src/db.js";

export const ADMIN = { email: "admin@teste.local", password: "senha-de-teste-forte-123" };
export const app = createApp({ webDir: "/nao-existe" });

let ipCounter = 1;
/** IP distinto por agente para que o limitador de login de um teste não afete outro. */
export const nextIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

export async function resetData() {
  await prisma.destinationChange.deleteMany();
  await prisma.plate.deleteMany();
  await prisma.session.deleteMany();
  await prisma.adminUser.deleteMany();
  await upsertAdmin(ADMIN.email, ADMIN.password);
}

/** Faz login e devolve um cliente autenticado que envia cookie e token CSRF. */
export async function loginAgent(creds: { email: string; password: string } = ADMIN) {
  const ip = nextIp();
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").set("X-Forwarded-For", ip).send(creds);
  if (res.status !== 200) throw new Error(`login falhou: ${res.status} ${JSON.stringify(res.body)}`);
  const csrf = res.body.csrfToken as string;
  const withHeaders = (r: request.Test) => r.set("X-Forwarded-For", ip).set("X-CSRF-Token", csrf);
  return {
    agent,
    csrf,
    get: (u: string) => withHeaders(agent.get(u)),
    post: (u: string, body?: object) => withHeaders(agent.post(u)).send(body),
    patch: (u: string, body?: object) => withHeaders(agent.patch(u)).send(body),
    delete: (u: string) => withHeaders(agent.delete(u)),
  };
}

export const samplePlate = {
  businessName: "Padaria Pão Quente",
  internalName: "Balcão principal",
  destinationUrl: "https://g.page/r/exemplo-avaliacao/review",
  notes: "Instalada em 14/10",
};

export { prisma, request };
