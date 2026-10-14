const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => date.format(new Date(iso));

/** Validação no navegador apenas para feedback rápido; a validação definitiva é feita no servidor. */
export function checkUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return "Informe a URL de destino";
  if (/\s/.test(v)) return "A URL não pode conter espaços";
  if (!/^https?:\/\//i.test(v)) return "A URL deve começar com http:// ou https://";
  try {
    const u = new URL(v);
    if (!u.hostname) return "A URL precisa ter um domínio";
    if (u.username || u.password) return "A URL não pode conter usuário ou senha";
  } catch {
    return "URL inválida";
  }
  return null;
}

export function shortUrl(url: string, max = 60) {
  const s = url.replace(/^https?:\/\//, "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
