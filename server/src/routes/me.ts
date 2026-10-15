import { Router } from "express";
import type { Plate, Prisma } from "@prisma/client";
import { z } from "zod";
import { permanentUrl } from "../config.js";
import { prisma } from "../db.js";
import { notFound } from "../lib/errors.js";
import { destinationUrlSchema } from "../lib/url.js";
import { requireAuth, requireClient } from "../middleware/auth.js";
import { historyItems } from "./plates.js";

/**
 * Área do cliente revendedor: só as plaquinhas atribuídas a ele, e só o link e o nome do negócio podem mudar.
 * Plaquinha de outra pessoa responde 404, igual a uma inexistente, para não revelar que ela existe.
 */
export const meRouter = Router();
meRouter.use(requireAuth, requireClient);

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
    res.json({ total, configured, items: items.map(toDto) });
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
