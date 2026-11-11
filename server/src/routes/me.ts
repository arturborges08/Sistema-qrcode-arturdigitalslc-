import { Router } from "express";
import { Prisma, type Plate } from "@prisma/client";
import { z } from "zod";
import { config, permanentUrl } from "../config.js";
import { prisma } from "../db.js";
import { generateCode } from "../lib/code.js";
import { AppError, notFound } from "../lib/errors.js";
import { PNG_SIZES, qrPng, qrSvg } from "../lib/qr.js";
import { destinationUrlSchema } from "../lib/url.js";
import { requireActivePlan, requireAuth, requireClient } from "../middleware/auth.js";
import { fileBase, historyItems } from "./plates.js";

/**
 * Área do cliente revendedor: só as plaquinhas atribuídas a ele, e só o link e o nome do negócio podem mudar.
 * Plaquinha de outra pessoa responde 404, igual a uma inexistente, para não revelar que ela existe.
 */
export const meRouter = Router();
meRouter.use(requireAuth, requireClient, requireActivePlan);

const UpdateSchema = z
  .object({
    destinationUrl: destinationUrlSchema.optional(),
    businessName: z
      .string()
      .trim()
      .max(120, "O nome deve ter no máximo 120 caracteres")
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .strict();

const ListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["all", "active", "unconfigured"]).default("all"),
});
const IdParam = z.object({ id: z.uuid("Identificador inválido") });
const CodeParam = z.object({ code: z.string().regex(/^[A-Za-z0-9]{4,32}$/, "Código inválido") });

// Sem observações internas e sem dados de outros clientes.
function toDto(p: Plate) {
  return {
    id: p.id,
    code: p.code,
    permanentUrl: permanentUrl(p.code),
    businessName: p.businessName,
    internalName: p.internalName,
    destinationUrl: p.destinationUrl,
    configured: p.destinationUrl !== null,
    active: p.active,
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function ownPlateOr404(clientId: string, where: Prisma.PlateWhereInput) {
  const plate = await prisma.plate.findFirst({ where: { ...where, clientId } });
  if (!plate) throw notFound("Esta plaquinha não está na sua conta");
  return plate;
}

meRouter.get("/plates", async (req, res, next) => {
  try {
    const { q, status } = ListQuery.parse(req.query);
    const where: Prisma.PlateWhereInput = { clientId: req.auth!.adminId };
    if (status === "active") where.destinationUrl = { not: null };
    if (status === "unconfigured") where.destinationUrl = null;
    if (q) {
      where.OR = [
        { businessName: { contains: q, mode: "insensitive" } },
        { internalName: { contains: q, mode: "insensitive" } },
        { code: { equals: q } },
      ];
    }
    const [total, configured, items] = await Promise.all([
      prisma.plate.count({ where: { clientId: req.auth!.adminId } }),
      prisma.plate.count({ where: { clientId: req.auth!.adminId, destinationUrl: { not: null } } }),
      prisma.plate.findMany({ where, orderBy: [{ updatedAt: "desc" }], take: 500 }),
    ]);
    // Assinantes (cadastro público) criam as próprias plaquinhas; clientes do administrador recebem as dele.
    const canCreate = req.auth!.selfSignup;
    res.json({ total, configured, canCreate, maxPlates: canCreate ? config().PLAN_MAX_PLATES : null, items: items.map(toDto) });
  } catch (e) {
    next(e);
  }
});

meRouter.get("/plates/by-code/:code", async (req, res, next) => {
  try {
    const { code } = CodeParam.parse(req.params);
    res.json(toDto(await ownPlateOr404(req.auth!.adminId, { code })));
  } catch (e) {
    next(e);
  }
});

meRouter.get("/plates/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    res.json(toDto(await ownPlateOr404(req.auth!.adminId, { id })));
  } catch (e) {
    next(e);
  }
});

meRouter.patch("/plates/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const data = UpdateSchema.parse(req.body ?? {});
    const clientId = req.auth!.adminId;
    const updated = await prisma.$transaction(async (tx) => {
      // Trava a linha e confere o dono na mesma consulta.
      const rows = await tx.$queryRaw<{ destination_url: string | null }[]>`
        SELECT destination_url FROM plates WHERE id = ${id}::uuid AND client_id = ${clientId}::uuid FOR UPDATE`;
      if (rows.length === 0) throw notFound("Esta plaquinha não está na sua conta");
      const previousUrl = rows[0].destination_url;
      const patch: Prisma.PlateUpdateInput = {};
      if (data.destinationUrl !== undefined) patch.destinationUrl = data.destinationUrl;
      if ("businessName" in (req.body ?? {})) patch.businessName = data.businessName;
      const plate = await tx.plate.update({ where: { id }, data: patch });
      if (data.destinationUrl !== undefined && data.destinationUrl !== previousUrl) {
        await tx.destinationChange.create({
          data: { plateId: id, previousUrl, newUrl: data.destinationUrl, changedById: clientId },
        });
      }
      return plate;
    });
    res.json(toDto(updated));
  } catch (e) {
    next(e);
  }
});

meRouter.get("/plates/:id/history", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    await ownPlateOr404(req.auth!.adminId, { id });
    // O cliente não precisa ver o e-mail do administrador.
    const items = (await historyItems(id)).map((h) =>
      h.changedBy?.role === "OWNER" ? { ...h, changedBy: { name: "Administrador", email: null, role: "OWNER" as const } } : h,
    );
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

const CreateSchema = z
  .object({
    businessName: z.string({ error: "Informe o nome do negócio" }).trim().min(1, "Informe o nome do negócio").max(120, "O nome deve ter no máximo 120 caracteres"),
    destinationUrl: destinationUrlSchema,
  })
  .strict();

// Só assinantes: cria uma plaquinha nova na própria conta, até o limite do plano.
meRouter.post("/plates", async (req, res, next) => {
  try {
    if (!req.auth!.selfSignup) throw new AppError(403, "Peça novas plaquinhas ao seu fornecedor.", "forbidden");
    const data = CreateSchema.parse(req.body ?? {});
    const clientId = req.auth!.adminId;
    const max = config().PLAN_MAX_PLATES;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const plate = await prisma.$transaction(async (tx) => {
          // Trava a conta para que duas criações simultâneas não passem do limite.
          await tx.$queryRaw`SELECT id FROM admin_users WHERE id = ${clientId}::uuid FOR UPDATE`;
          const count = await tx.plate.count({ where: { clientId } });
          if (count >= max) throw new AppError(400, `Seu plano permite até ${max} plaquinhas.`, "plan_limit");
          const created = await tx.plate.create({
            data: { code: generateCode(), businessName: data.businessName, internalName: data.businessName, destinationUrl: data.destinationUrl, clientId },
          });
          await tx.destinationChange.create({
            data: { plateId: created.id, previousUrl: null, newUrl: data.destinationUrl, changedById: clientId },
          });
          return created;
        });
        res.status(201).json(toDto(plate));
        return;
      } catch (e) {
        const isCodeCollision =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && JSON.stringify(e.meta?.target ?? "").includes("code");
        if (!isCodeCollision) throw e;
      }
    }
    throw new Error("Não foi possível gerar um identificador único");
  } catch (e) {
    next(e);
  }
});

const QrQuery = z.object({
  size: z.enum(["screen", "print"]).default("screen"),
  download: z.enum(["0", "1"]).default("0"),
});

meRouter.get("/plates/:id/qr.svg", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const { download } = QrQuery.parse(req.query);
    const plate = await ownPlateOr404(req.auth!.adminId, { id });
    res.type("image/svg+xml").set("Cache-Control", "private, no-store");
    if (download === "1") res.attachment(`${fileBase(plate)}.svg`);
    res.send(await qrSvg(permanentUrl(plate.code)));
  } catch (e) {
    next(e);
  }
});

meRouter.get("/plates/:id/qr.png", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const { size, download } = QrQuery.parse(req.query);
    const plate = await ownPlateOr404(req.auth!.adminId, { id });
    res.type("image/png").set("Cache-Control", "private, no-store");
    if (download === "1") res.attachment(`${fileBase(plate)}-${PNG_SIZES[size]}px.png`);
    res.send(await qrPng(permanentUrl(plate.code), PNG_SIZES[size]));
  } catch (e) {
    next(e);
  }
});
