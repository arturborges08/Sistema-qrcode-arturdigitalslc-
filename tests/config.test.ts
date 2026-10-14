import { describe, expect, it } from "vitest";
import { loadConfig } from "../server/src/config.js";
import { CODE_ALPHABET, generateCode } from "../server/src/lib/code.js";

const base = { DATABASE_URL: "postgresql://x", APP_BASE_URL: "https://meudominio.com.br" };

describe("Configuração", () => {
  it("exige APP_BASE_URL e remove barra final", () => {
    expect(() => loadConfig({ DATABASE_URL: "x" })).toThrow(/APP_BASE_URL é obrigatória/);
    expect(loadConfig({ ...base, APP_BASE_URL: "https://meudominio.com.br/" }).APP_BASE_URL).toBe("https://meudominio.com.br");
  });
  it("recusa APP_BASE_URL com caminho ou esquema inválido", () => {
    expect(() => loadConfig({ ...base, APP_BASE_URL: "https://a.com/painel" })).toThrow();
    expect(() => loadConfig({ ...base, APP_BASE_URL: "ftp://a.com" })).toThrow();
  });
  it("exige https em produção", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", APP_BASE_URL: "http://a.com" })).toThrow(/https/);
    expect(loadConfig({ ...base, NODE_ENV: "production" }).isProduction).toBe(true);
  });
  it("respeita a porta do ambiente", () => {
    expect(loadConfig({ ...base, PORT: "8123" }).PORT).toBe(8123);
  });
});

describe("Identificadores", () => {
  it("usam só o alfabeto sem caracteres ambíguos e não se repetem em 10 mil amostras", () => {
    const set = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const c = generateCode();
      expect(c).toHaveLength(8);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
      set.add(c);
    }
    expect(set.size).toBe(10_000);
    expect(CODE_ALPHABET).not.toMatch(/[01OIl]/);
  });
});
