import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { getDummyHash, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "../lib/password.js";
import { createSession, destroySession, sessionCookieName, sessionCookieOptions } from "../lib/session.js";
import { requireAuth } from "../middleware/auth.js";
import { loginLimiter, signupLimiter } from "../middleware/rateLimit.js";
import { emailSchema } from "../admin.js";
import { billingDto, planInfo } from "../lib/billing.js";
import { Prisma } from "@prisma/client";

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
    res.json(sessionDto({ ...admin, csrfToken }));
  } catch (e) {
    next(e);
  }
});

function sessionDto(u: {
  email: string;
  role: "OWNER" | "CLIENT";
  name: string | null;
  csrfToken: string;
  selfSignup: boolean;
  paidUntil: Date | null;
}) {
  return { email: u.email, role: u.role, name: u.name, csrfToken: u.csrfToken, selfSignup: u.selfSignup, billing: billingDto(u) };
}

authRouter.get("/session", requireAuth, (req, res) => {
  res.json(sessionDto(req.auth!));
});

export const CLIENT_MIN_PASSWORD = 8;

const SignupSchema = z
  .object({
    name: z.string({ error: "Informe seu nome" }).trim().min(1, "Informe seu nome").max(120, "O nome deve ter no máximo 120 caracteres"),
    email: z.string({ error: "Informe seu e-mail" }).trim().toLowerCase().pipe(emailSchema),
    password: z
      .string({ error: "Crie uma senha" })
      .min(CLIENT_MIN_PASSWORD, `A senha deve ter pelo menos ${CLIENT_MIN_PASSWORD} caracteres`)
      .max(1024),
  })
  .strict();

// Cadastro público: cria uma conta de assinante, que precisa pagar o plano mensal para usar o sistema.
authRouter.post("/signup", signupLimiter, async (req, res, next) => {
  try {
    if (!req.is("application/json")) throw new AppError(415, "Envie os dados como JSON", "unsupported_media_type");
    if (!planInfo().signupEnabled) throw new AppError(403, "O cadastro está fechado no momento.", "signup_disabled");
    const data = SignupSchema.parse(req.body ?? {});
    const user = await prisma.adminUser
      .create({
        data: { role: "CLIENT", selfSignup: true, name: data.name, email: data.email, passwordHash: await hashPassword(data.password) },
      })
      .catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new AppError(409, "Já existe uma conta com esse e-mail. Use \"Entrar\".", "email_taken");
        }
        throw e;
      });
    await destroySession(req.cookies?.[sessionCookieName()]);
    const { token, csrfToken } = await createSession(user.id);
    res.cookie(sessionCookieName(), token, sessionCookieOptions());
    logger.info("signup_ok", { ip: req.ip });
    res.status(201).json(sessionDto({ ...user, csrfToken }));
  } catch (e) {
    next(e);
  }
});

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
