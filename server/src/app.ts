import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errors.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { authRouter } from "./routes/auth.js";
import { platesRouter } from "./routes/plates.js";
import { clientsRouter } from "./routes/clients.js";
import { meRouter } from "./routes/me.js";
import { redirectRouter } from "./routes/redirect.js";
import { sendPage } from "./pages.js";

export function createApp(opts: { webDir?: string } = {}) {
  const cfg = config();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", cfg.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: cfg.isProduction ? [] : null,
        },
      },
      strictTransportSecurity: cfg.isProduction ? { maxAge: 31536000, includeSubDomains: false } : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Log de acesso: só método, caminho, status e duração.
  app.use((req, res, next) => {
    if (req.path.startsWith("/assets/")) return next();
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      if (cfg.NODE_ENV === "test") return;
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info("http", { method: req.method, path: req.originalUrl.split("?")[0], status: res.statusCode, ms: Math.round(ms) });
    });
    next();
  });

  app.get("/health", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "ok" });
    } catch {
      res.status(503).json({ status: "error", database: "unreachable" });
    }
  });

  app.use(redirectRouter);

  const api = express.Router();
  api.use(apiLimiter);
  api.use(express.json({ limit: "20kb" }));
  api.use(cookieParser());
  api.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  api.use("/auth", authRouter);
  api.use("/plates", platesRouter);
  api.use("/clients", clientsRouter);
  api.use("/me", meRouter);
  api.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Rota não encontrada" } });
  });
  app.use("/api", api);

  // Frontend (build do Vite). Em desenvolvimento o Vite serve o frontend separadamente.
  const webDir = opts.webDir ?? path.resolve(process.cwd(), "dist/web");
  const indexHtml = path.join(webDir, "index.html");
  if (fs.existsSync(indexHtml)) {
    app.use(
      "/assets",
      express.static(path.join(webDir, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }),
    );
    app.use(express.static(webDir, { index: false, maxAge: "1h" }));
    app.get(/^\/(?!api\/|r\/).*/, (_req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile(indexHtml);
    });
  } else if (cfg.isProduction) {
    logger.warn("frontend_build_missing", { webDir });
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD") return sendPage(res, 404, "notFound");
    next();
  });
  app.use(errorHandler);
  return app;
}
