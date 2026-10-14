import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: err.issues[0]?.message ?? "Dados inválidos",
        fields: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    res.status(404).json({ error: { code: "not_found", message: "Registro não encontrado" } });
    return;
  }
  // Erros do body-parser (JSON malformado, corpo grande demais)
  const e = err as { type?: string; status?: number };
  if (e && typeof e.status === "number" && e.status >= 400 && e.status < 500 && e.type) {
    res.status(e.status).json({ error: { code: "bad_request", message: "Requisição inválida" } });
    return;
  }
  logger.error("unhandled_error", {
    method: req.method,
    path: req.path,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
  });
  res.status(500).json({ error: { code: "internal_error", message: "Erro interno. Tente novamente." } });
}
