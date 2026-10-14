import { execSync } from "node:child_process";

// Aplica as migrations reais (as mesmas de produção) no banco de testes.
// Os testes limpam as tabelas entre si (ver helpers.resetData).
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/qrdin_test";
  if (!/test/.test(url)) throw new Error("Por segurança, o banco de testes precisa ter 'test' no nome");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}
