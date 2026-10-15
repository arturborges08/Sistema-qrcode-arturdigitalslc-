import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { getDummyHash, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "../lib/password.js";
import { createSession, destroySession, sessionCookieName, sessionCookieOptions } from "../lib/session.js";
import { requireAuth } from "../middleware/auth.js";
import { loginLimiter } from "../middleware/rateLimit.js";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1, "Informe a senha").max(1024),
});

export const authRouter = Router();

authRouter.post("/login", loginLimiter, async (req, res, next) => {
  try {
    // express.json só popula o corpo para Content-Type application/json; formulários de outros sites não passam daqui.
    if (!req.is("application/json")) throw new AppError(415, "Envie os dados como JSON", "unsupported_media_type");
    const { email, password } = LoginSchema.parse(req.body);
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    const ok = await verifyPassword(password, admin?.passwordHash ?? (await getDummyHash()));
    if (!admin || !ok) {
      logger.warn("login_failed", { ip: req.ip });
      throw new AppError(401, "E-mail ou senha inválidos", "invalid_credentials");
    }
    if (!admin.active) {
      logger.warn("login_inactive", { ip: req.ip });
      throw new AppError(403, "Seu acesso está desativado. Fale com quem vendeu as plaquinhas.", "account_inactive");
    }
    await destroySession(req.cookies?.[sessionCookieName()]);
    const { token, csrfToken } = await createSession(admin.id);
    res.cookie(sessionCookieName(), token, sessionCookieOptions());
    logger.info("login_ok", { ip: req.ip });
    res.json({ email: admin.email, role: admin.role, name: admin.name, csrfToken });
  } catch (e) {
    next(e);
  }
});

authRouter.get("/session", requireAuth, (req, res) => {
  const { email, role, name, csrfToken } = req.auth!;
  res.json({ email, role, name, csrfToken });
});

export const CLIENT_MIN_PASSWORD = 8;

const PasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual").max(1024),
  newPassword: z.string().max(1024),
});

// Troca da própria senha. Mantém a sessão atual e encerra as outras.
authRouter.post("/password", loginLimiter, requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = PasswordSchema.parse(req.body ?? {});
    const min = req.auth!.role === "CLIENT" ? CLIENT_MIN_PASSWORD : MIN_PASSWORD_LENGTH;
    if (newPassword.length < min) {
      throw new AppError(400, `A nova senha deve ter pelo menos ${min} caracteres`, "validation_error");
    }
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: req.auth!.adminId } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError(400, "A senha atual está incorreta", "invalid_password");
    }
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } }),
      prisma.session.deleteMany({ where: { adminId: user.id, id: { not: req.auth!.sessionId } } }),
    ]);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await destroySession(req.cookies?.[sessionCookieName()]);
    const { maxAge: _m, ...opts } = sessionCookieOptions();
    res.clearCookie(sessionCookieName(), opts);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
