import { prisma } from "./db.js";
import { hashPassword, MIN_PASSWORD_LENGTH } from "./lib/password.js";
import { logger } from "./lib/logger.js";
import { z } from "zod";

export const emailSchema = z.email("E-mail inválido").max(254);

export async function upsertAdmin(emailRaw: string, password: string) {
  const email = emailSchema.parse(emailRaw.trim().toLowerCase());
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  const passwordHash = await hashPassword(password);
  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: { email, passwordHash },
    update: { passwordHash },
  });
  // Troca de senha encerra todas as sessões abertas.
  await prisma.session.deleteMany({ where: { adminId: admin.id } });
  return admin;
}

/**
 * Cria o administrador a partir de ADMIN_EMAIL/ADMIN_PASSWORD somente se ainda não existir nenhum.
 * Depois que o administrador existe, essas variáveis são ignoradas e podem ser removidas.
 */
export async function bootstrapAdmin(email?: string, password?: string) {
  const count = await prisma.adminUser.count();
  if (count > 0) {
    if (password) logger.warn("admin_password_env_ignored", { hint: "Administrador já existe; remova ADMIN_PASSWORD das variáveis." });
    return;
  }
  if (!email || !password) {
    logger.warn("no_admin", { hint: "Nenhum administrador. Defina ADMIN_EMAIL e ADMIN_PASSWORD ou rode npm run admin:set-password." });
    return;
  }
  await upsertAdmin(email, password);
  logger.info("admin_created_from_env");
}
