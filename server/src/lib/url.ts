import { z } from "zod";

export const MAX_URL_LENGTH = 2048;

/**
 * Valida e normaliza uma URL de destino. Aceita somente http/https absolutas,
 * sem credenciais embutidas e sem caracteres de controle ou espaços.
 * Retorna a URL normalizada ou uma mensagem de erro.
 */
export function normalizeDestinationUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const raw = input.trim();
  if (raw === "") return { ok: false, error: "Informe a URL de destino" };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, error: `A URL deve ter no máximo ${MAX_URL_LENGTH} caracteres` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\s]/.test(raw)) return { ok: false, error: "A URL não pode conter espaços ou caracteres de controle" };
  if (!/^https?:\/\//i.test(raw)) return { ok: false, error: "A URL deve começar com http:// ou https://" };

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "URL inválida" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "Somente URLs http e https são aceitas" };
  if (!u.hostname) return { ok: false, error: "A URL precisa ter um domínio" };
  if (u.username || u.password) return { ok: false, error: "A URL não pode conter usuário ou senha" };
  const href = u.href;
  if (href.length > MAX_URL_LENGTH) return { ok: false, error: `A URL deve ter no máximo ${MAX_URL_LENGTH} caracteres` };
  return { ok: true, url: href };
}

export const destinationUrlSchema = z.string().transform((val, ctx) => {
  const r = normalizeDestinationUrl(val);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.error });
    return z.NEVER;
  }
  return r.url;
});
