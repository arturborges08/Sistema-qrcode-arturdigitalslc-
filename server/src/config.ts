import { z } from "zod";

const optionalNonEmpty = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  APP_BASE_URL: z
    .string()
    .min(1, "APP_BASE_URL é obrigatória")
    .transform((v) => v.trim().replace(/\/+$/, ""))
    .refine((v) => {
      try {
        const u = new URL(v);
        return (u.protocol === "https:" || u.protocol === "http:") && u.pathname === "/" && !u.search && !u.hash;
      } catch {
        return false;
      }
    }, "APP_BASE_URL deve ser uma origem http(s) sem caminho, ex.: https://meudominio.com.br"),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(24 * 30).default(12),
  // Número de proxies reversos à frente do app (Railway = 1).
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  ADMIN_EMAIL: optionalNonEmpty,
  ADMIN_PASSWORD: optionalNonEmpty,
});

export type Config = z.infer<typeof EnvSchema> & { isProduction: boolean };

let cached: Config | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida:\n${msg}`);
  }
  const cfg = { ...parsed.data, isProduction: parsed.data.NODE_ENV === "production" };
  if (cfg.isProduction && !cfg.APP_BASE_URL.startsWith("https://")) {
    throw new Error("Em produção, APP_BASE_URL deve usar https://");
  }
  return cfg;
}

export function config(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

export function permanentUrl(code: string): string {
  return `${config().APP_BASE_URL}/r/${code}`;
}
