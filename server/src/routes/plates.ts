import { Router } from "express";
import { Prisma, type Plate } from "@prisma/client";
import { z } from "zod";
import { permanentUrl } from "../config.js";
import { prisma } from "../db.js";
import { generateCode } from "../lib/code.js";
import { notFound } from "../lib/errors.js";
import { PNG_SIZES, qrPng, qrSvg } from "../lib/qr.js";
import { destinationUrlSchema } from "../lib/url.js";
import { requireAuth } from "../middleware/auth.js";

export const platesRouter = Router();
platesRouter.use(requireAuth);

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} é obrigatório` })
    .trim()
    .min(1, `${label} é obrigatório`)
    .max(max, `${label} deve ter no máximo ${max} caracteres`);

const notes = z
  .string()
  .trim()
  .max(2000, "As observações devem ter no máximo 2000 caracteres")
  .nullish()
  .transform((v) => (v ? v : null));

const CreateSchema = z.object({
  businessName: text("Nome da empresa", 120),
  internalName: text("Nome interno", 120),
  destinationUrl: destinationUrlSchema,
  active: z.boolean().default(true),
  notes,
});

// .strict() faz qualquer campo desconhecido (inclusive "code") ser rejeitado.
const UpdateSchema = z
  .object({
    businessName: text("Nome da empresa", 120).optional(),
    internalName: text("Nome interno", 120).optional(),
    destinationUrl: destinationUrlSchema.optional(),
    active: z.boolean().optional(),
    notes: notes.optional(),
  })
  .strict();

const IdParam = z.object({ id: z.uuid("Identificador inválido") });

const ListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["all", "active", "inactive", "unconfigured"]).default("all"),
  batch: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const MAX_BATCH = 200;

const BatchSchema = z.object({
  quantity: z.coerce
    .number({ error: "Informe a quantidade" })
    .int("A quantidade deve ser um número inteiro")
    .min(1, "A quantidade mínima é 1")
    .max(MAX_BATCH, `A quantidade máxima por lote é ${MAX_BATCH}`),
  batchName: z.string().trim().max(80, "O nome do lote deve ter no máximo 80 caracteres").optional(),
});

const CodeParam = z.object({ code: z.string().regex(/^[A-Za-z0-9]{4,32}$/, "Código inválido") });

export function toDto(p: Plate) {
  return {
    id: p.id,
    code: p.code,
    permanentUrl: permanentUrl(p.code),
    businessName: p.businessName,
    internalName: p.internalName,
    destinationUrl: p.destinationUrl,
    configured: p.destinationUrl !== null,
    batchName: p.batchName,
    active: p.active,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function getPlateOr404(id: string) {
  const plate = await prisma.plate.findUnique({ where: { id } });
  if (!plate) throw notFound("Plaquinha não encontrada");
  return plate;
}

platesRouter.get("/stats", async (_req, res, next) => {
  try {
    // Ativo = redirecionando de fato; em branco = ativa mas sem link; inativo = desativada. Os três somam o total.
    const [total, active, inactive, recent] = await Promise.all([
      prisma.plate.count(),
      prisma.plate.count({ where: { active: true, destinationUrl: { not: null } } }),
      prisma.plate.count({ where: { active: false } }),
      prisma.plate.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    ]);
    res.json({ total, active, inactive, unconfigured: total - active - inactive, recent: recent.map(toDto) });
  } catch (e) {
    next(e);
  }
});

platesRouter.get("/", async (req, res, next) => {
  try {
    const { q, status, batch, page, pageSize } = ListQuery.parse(req.query);
    const where: Prisma.PlateWhereInput = {};
    if (status === "active") Object.assign(where, { active: true, destinationUrl: { not: null } });
    if (status === "inactive") where.active = false;
    if (status === "unconfigured") Object.assign(where, { active: true, destinationUrl: null });
    if (batch) where.batchName = batch;
    if (q) {
      where.OR = [
        { businessName: { contains: q, mode: "insensitive" } },
        { internalName: { contains: q, mode: "insensitive" } },
        { code: { equals: q } },
      ];
    }
    const [total, items] = await Promise.all([
      prisma.plate.count({ where }),
      prisma.plate.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ total, page, pageSize, items: items.map(toDto) });
  } catch (e) {
    next(e);
  }
});

platesRouter.post("/", async (req, res, next) => {
  try {
    const data = CreateSchema.parse(req.body ?? {});
    // Colisão de código é improvável (~10^14 combinações), mas é tratada com novas tentativas.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const plate = await prisma.$transaction(async (tx) => {
          const created = await tx.plate.create({ data: { ...data, code: generateCode() } });
          await tx.destinationChange.create({
            data: { plateId: created.id, previousUrl: null, newUrl: data.destinationUrl },
          });
          return created;
        });
        res.status(201).json(toDto(plate));
        return;
      } catch (e) {
        const isCodeCollision =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002" &&
          JSON.stringify(e.meta?.target ?? "").includes("code");
        if (!isCodeCollision) throw e;
      }
    }
    throw new Error("Não foi possível gerar um identificador único");
  } catch (e) {
    next(e);
  }
});

platesRouter.post("/batch", async (req, res, next) => {
  try {
    const { quantity, batchName: rawName } = BatchSchema.parse(req.body ?? {});
    const stamp = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());
    const batchName = rawName || `Lote ${stamp}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const items = await prisma.$transaction(async (tx) => {
          const used = await tx.plate.count({ where: { batchName } });
          const data = Array.from({ length: quantity }, (_, i) => ({
            code: generateCode(),
            internalName: `${batchName} · ${String(used + i + 1).padStart(3, "0")}`,
            batchName,
          }));
          await tx.plate.createMany({ data });
          return tx.plate.findMany({ where: { code: { in: data.map((d) => d.code) } }, orderBy: { internalName: "asc" } });
        });
        res.status(201).json({ batchName, items: items.map(toDto) });
        return;
      } catch (e) {
        const collision = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
        if (!collision) throw e;
      }
    }
    throw new Error("Não foi possível gerar identificadores únicos");
  } catch (e) {
    next(e);
  }
});

platesRouter.get("/batches", async (_req, res, next) => {
  try {
    const rows = await prisma.plate.groupBy({
      by: ["batchName"],
      where: { batchName: { not: null } },
      _count: { _all: true },
      _min: { createdAt: true },
    });
    const pending = await prisma.plate.groupBy({
      by: ["batchName"],
      where: { batchName: { not: null }, destinationUrl: null },
      _count: { _all: true },
    });
    const pendingMap = new Map(pending.map((p) => [p.batchName, p._count._all]));
    res.json({
      items: rows
        .map((r) => ({
          batchName: r.batchName!,
          total: r._count._all,
          unconfigured: pendingMap.get(r.batchName) ?? 0,
          createdAt: r._min.createdAt!.toISOString(),
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    });
  } catch (e) {
    next(e);
  }
});

// QR Codes de um lote inteiro de uma vez (para a folha de impressão), como data URIs SVG.
platesRouter.get("/batch-qr", async (req, res, next) => {
  try {
    const { batch } = z.object({ batch: z.string().trim().min(1).max(80) }).parse(req.query);
    const plates = await prisma.plate.findMany({ where: { batchName: batch }, orderBy: { internalName: "asc" }, take: 1000 });
    const items = await Promise.all(
      plates.map(async (p) => ({
        id: p.id,
        code: p.code,
        internalName: p.internalName,
        permanentUrl: permanentUrl(p.code),
        svgDataUri: `data:image/svg+xml;base64,${Buffer.from(await qrSvg(permanentUrl(p.code))).toString("base64")}`,
      })),
    );
    res.json({ batchName: batch, items });
  } catch (e) {
    next(e);
  }
});

platesRouter.get("/by-code/:code", async (req, res, next) => {
  try {
    const { code } = CodeParam.parse(req.params);
    const plate = await prisma.plate.findUnique({ where: { code } });
    if (!plate) throw notFound("Nenhuma plaquinha com esse código");
    res.json(toDto(plate));
  } catch (e) {
    next(e);
  }
});

platesRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    res.json(toDto(await getPlateOr404(id)));
  } catch (e) {
    next(e);
  }
});

platesRouter.patch("/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const data = UpdateSchema.parse(req.body ?? {});
    const updated = await prisma.$transaction(async (tx) => {
      // FOR UPDATE evita perder um registro de histórico em edições simultâneas.
      const rows = await tx.$queryRaw<{ destination_url: string | null }[]>`
        SELECT destination_url FROM plates WHERE id = ${id}::uuid FOR UPDATE`;
      if (rows.length === 0) throw notFound("Plaquinha não encontrada");
      const previousUrl = rows[0].destination_url;
      const plate = await tx.plate.update({ where: { id }, data });
      if (data.destinationUrl !== undefined && data.destinationUrl !== previousUrl) {
        await tx.destinationChange.create({ data: { plateId: id, previousUrl, newUrl: data.destinationUrl } });
      }
      return plate;
    });
    res.json(toDto(updated));
  } catch (e) {
    next(e);
  }
});

platesRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    await getPlateOr404(id);
    await prisma.plate.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

platesRouter.get("/:id/history", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    await getPlateOr404(id);
    const items = await prisma.destinationChange.findMany({ where: { plateId: id }, orderBy: { changedAt: "desc" } });
    res.json({
      items: items.map((c) => ({
        id: c.id,
        previousUrl: c.previousUrl,
        newUrl: c.newUrl,
        changedAt: c.changedAt.toISOString(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

function fileBase(p: Plate) {
  const slug = (p.businessName ?? p.batchName ?? "plaquinha")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `qr-${slug || "plaquinha"}-${p.code}`;
}

const QrQuery = z.object({
  size: z.enum(["screen", "print"]).default("screen"),
  download: z.enum(["0", "1"]).default("0"),
});

platesRouter.get("/:id/qr.svg", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const { download } = QrQuery.parse(req.query);
    const plate = await getPlateOr404(id);
    const svg = await qrSvg(permanentUrl(plate.code));
    res.type("image/svg+xml").set("Cache-Control", "private, no-store");
    if (download === "1") res.attachment(`${fileBase(plate)}.svg`);
    res.send(svg);
  } catch (e) {
    next(e);
  }
});

platesRouter.get("/:id/qr.png", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const { size, download } = QrQuery.parse(req.query);
    const plate = await getPlateOr404(id);
    const png = await qrPng(permanentUrl(plate.code), PNG_SIZES[size]);
    res.type("image/png").set("Cache-Control", "private, no-store");
    if (download === "1") res.attachment(`${fileBase(plate)}-${PNG_SIZES[size]}px.png`);
    res.send(png);
  } catch (e) {
    next(e);
  }
});
