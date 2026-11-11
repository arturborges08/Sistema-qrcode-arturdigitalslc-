import { rateLimit } from "express-rate-limit";

// Contadores em memória: adequado para uma única instância. Com várias réplicas,
// trocar por um store compartilhado (ex.: Redis).
const json = (message: string) => ({ error: { code: "rate_limited", message } });

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: json("Muitas tentativas de login. Aguarde 15 minutos e tente novamente."),
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: json("Muitas requisições. Tente novamente em instantes."),
});

export const redirectLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: "Muitas requisições. Tente novamente em instantes.",
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: json("Muitos cadastros a partir desta conexão. Tente novamente mais tarde."),
});

export const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: json("Muitas tentativas de pagamento. Aguarde alguns minutos."),
});
