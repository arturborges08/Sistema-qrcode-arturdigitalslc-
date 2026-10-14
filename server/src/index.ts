import { bootstrapAdmin } from "./admin.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { logger } from "./lib/logger.js";

async function main() {
  const cfg = config();
  await prisma.$connect();
  await bootstrapAdmin(cfg.ADMIN_EMAIL, cfg.ADMIN_PASSWORD);

  const server = createApp().listen(cfg.PORT, "0.0.0.0", () => {
    logger.info("server_started", { port: cfg.PORT, env: cfg.NODE_ENV, baseUrl: cfg.APP_BASE_URL });
  });

  const shutdown = (signal: string) => {
    logger.info("shutdown", { signal });
    server.close(() => {
      prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  logger.error("startup_failed", { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
