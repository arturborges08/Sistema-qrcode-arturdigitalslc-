// Logger mínimo em JSON. Nunca registra corpo de requisição, cookies, cabeçalhos ou senhas.
type Level = "info" | "warn" | "error";

function write(level: Level, msg: string, extra?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, extra?: Record<string, unknown>) => write("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => write("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => write("error", msg, extra),
};
