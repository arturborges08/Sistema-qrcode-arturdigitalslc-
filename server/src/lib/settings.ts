import { config } from "../config.js";
import { prisma } from "../db.js";

/** InfiniteTag sem o "$": letras, números, ponto, hífen e sublinhado. */
export const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const KEY = "infinitepay_handle";

// Uma instância só: guardamos em memória e atualizamos ao salvar.
let cached: { value: string | null } | undefined;

/** A InfiniteTag salva no painel tem prioridade; sem ela, vale a variável INFINITEPAY_HANDLE do Railway. */
export async function getInfinitePayHandle(): Promise<{ handle: string | null; source: "painel" | "variavel" | null }> {
  if (!cached) {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
    cached = { value: row?.value ?? null };
  }
  if (cached.value) return { handle: cached.value, source: "painel" };
  const env = config().INFINITEPAY_HANDLE ?? null;
  return { handle: env, source: env ? "variavel" : null };
}

export async function setInfinitePayHandle(handle: string | null) {
  if (handle) await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: handle }, update: { value: handle } });
  else await prisma.appSetting.deleteMany({ where: { key: KEY } });
  cached = { value: handle };
}

/** Para os testes, que limpam o banco entre si. */
export function clearSettingsCache() {
  cached = undefined;
}
