import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions } from "express";
import { config } from "../config.js";
import { prisma } from "../db.js";

export function sessionCookieName(): string {
  // O prefixo __Host- obriga o navegador a exigir Secure, Path=/ e nenhum Domain.
  return config().isProduction ? "__Host-qr_session" : "qr_session";
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config().isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: config().SESSION_TTL_HOURS * 3600 * 1000,
  };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(adminId: string) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config().SESSION_TTL_HOURS * 3600 * 1000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), csrfToken, adminId, expiresAt } });
  // Limpeza oportunista de sessões expiradas.
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { token, csrfToken };
}

export async function findSession(token: string | undefined) {
  if (!token || token.length > 128) return null;
  const s = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: { select: { id: true, email: true, role: true, name: true, active: true } } },
  });
  if (!s) return null;
  if (s.expiresAt.getTime() <= Date.now() || !s.admin.active) {
    await prisma.session.delete({ where: { id: s.id } }).catch(() => undefined);
    return null;
  }
  return s;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
