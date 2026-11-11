import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { AppError, forbidden, unauthorized } from "../lib/errors.js";
import { planActive } from "../lib/billing.js";
import { findSession, sessionCookieName } from "../lib/session.js";

export interface AuthContext {
  sessionId: string;
  adminId: string;
  email: string;
  role: UserRole;
  name: string | null;
  csrfToken: string;
  selfSignup: boolean;
  paidUntil: Date | null;
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Exige sessão válida e, para métodos que alteram dados, o token CSRF no cabeçalho X-CSRF-Token. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[sessionCookieName()] as string | undefined;
    const s = await findSession(token);
    if (!s) throw unauthorized();
    if (!SAFE_METHODS.has(req.method)) {
      const header = req.get("x-csrf-token");
      if (!header || !safeEqual(header, s.csrfToken)) throw forbidden("Token CSRF ausente ou inválido");
    }
    req.auth = {
      sessionId: s.id,
      adminId: s.admin.id,
      email: s.admin.email,
      role: s.admin.role,
      name: s.admin.name,
      csrfToken: s.csrfToken,
      selfSignup: s.admin.selfSignup,
      paidUntil: s.admin.paidUntil,
    };
    next();
  } catch (e) {
    next(e);
  }
}

/** Só o dono do sistema. Usar depois de requireAuth. */
export function requireOwner(req: Request, _res: Response, next: NextFunction) {
  next(req.auth?.role === "OWNER" ? undefined : forbidden("Somente o administrador pode fazer isso"));
}

/** Só clientes revendedores. Usar depois de requireAuth. */
export function requireClient(req: Request, _res: Response, next: NextFunction) {
  next(req.auth?.role === "CLIENT" ? undefined : forbidden("Esta área é dos clientes"));
}

/** Assinante (conta criada pelo cadastro público) precisa estar com o plano mensal em dia. Usar depois de requireAuth. */
export function requireActivePlan(req: Request, _res: Response, next: NextFunction) {
  next(
    req.auth && planActive(req.auth)
      ? undefined
      : new AppError(402, "Seu plano mensal não está ativo. Pague ou renove para continuar usando.", "payment_required"),
  );
}
