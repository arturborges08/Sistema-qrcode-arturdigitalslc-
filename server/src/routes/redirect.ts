import { Router } from "express";
import cookieParser from "cookie-parser";
import { prisma } from "../db.js";
import { CODE_PATTERN } from "../lib/code.js";
import { logger } from "../lib/logger.js";
import { normalizeDestinationUrl } from "../lib/url.js";
import { sendPage } from "../pages.js";
import { redirectLimiter } from "../middleware/rateLimit.js";
import { findSession, sessionCookieName } from "../lib/session.js";

export const redirectRouter = Router();

redirectRouter.get("/r/:code", redirectLimiter, cookieParser(), async (req, res) => {
  // Nenhum cache: uma troca de destino precisa valer na próxima leitura do QR Code.
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex",
    // A resposta de uma plaquinha em branco depende de quem lê (administrador logado ou visitante).
    Vary: "Cookie",
  });

  const code = String(req.params.code);
  if (!CODE_PATTERN.test(code)) return sendPage(res, 404, "notFound");

  try {
    // O destino vem exclusivamente do banco. Query string e o restante da requisição são ignorados.
    const plate = await prisma.plate.findUnique({ where: { code }, select: { id: true, destinationUrl: true, active: true, clientId: true } });
    if (!plate) return sendPage(res, 404, "notFound");
    if (!plate.active) return sendPage(res, 410, "inactive");

    if (plate.destinationUrl === null) {
      // Plaquinha impressa em branco: o administrador logado, ou o cliente dono dela, vai direto para a tela
      // de configuração; qualquer outra pessoa vê um aviso. O destino é um caminho interno fixo, nunca vindo do visitante.
      const session = await findSession(req.cookies?.[sessionCookieName()]);
      if (session?.admin.role === "OWNER") return res.redirect(302, `/plaquinhas/${plate.id}?configurar=1`);
      if (session?.admin.role === "CLIENT" && session.admin.id === plate.clientId) {
        return res.redirect(302, `/minhas/${plate.id}?configurar=1`);
      }
      return sendPage(res, 404, "unconfigured", `/r/${code}`);
    }

    // Revalida o valor guardado como defesa adicional antes de emitir o cabeçalho Location.
    const checked = normalizeDestinationUrl(plate.destinationUrl);
    if (!checked.ok) {
      logger.error("invalid_stored_destination", { code });
      return sendPage(res, 500, "error");
    }
    res.redirect(302, checked.url);
  } catch (e) {
    logger.error("redirect_failed", { code, error: e instanceof Error ? e.message : String(e) });
    sendPage(res, 503, "error");
  }
});
