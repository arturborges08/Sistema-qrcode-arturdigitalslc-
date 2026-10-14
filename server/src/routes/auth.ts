import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { getDummyHash, verifyPassword } from "../lib/password.js";
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
    await destroySession(req.cookies?.[sessionCookieName()]);
    const { token, csrfToken } = await createSession(admin.id);
    res.cookie(sessionCookieName(), token, sessionCookieOptions());
    logger.info("login_ok", { ip: req.ip });
    res.json({ email: admin.email, csrfToken });
  } catch (e) {
    next(e);
  }
});

authRouter.get("/session", requireAuth, (req, res) => {
  res.json({ email: req.auth!.email, csrfToken: req.auth!.csrfToken });
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
