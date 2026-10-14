/**
 * Cria o administrador ou redefine sua senha.
 *
 * Uso:  npm run admin:set-password -- admin@seudominio.com.br
 * A senha é pedida no terminal (sem eco). Para uso não interativo, defina ADMIN_PASSWORD.
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { upsertAdmin } from "../admin.js";
import { prisma } from "../db.js";

function askHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = process.argv[2] ?? process.env.ADMIN_EMAIL;
  if (!email) throw new Error("Informe o e-mail: npm run admin:set-password -- voce@dominio.com.br");
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) throw new Error("Sem terminal interativo: defina ADMIN_PASSWORD");
    password = await askHidden("Nova senha (mín. 12 caracteres): ");
    const confirm = await askHidden("Confirme a senha: ");
    if (password !== confirm) throw new Error("As senhas não conferem");
  }
  const admin = await upsertAdmin(email, password);
  console.log(`Administrador ${admin.email} salvo. Sessões anteriores foram encerradas.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
