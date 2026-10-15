import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { emailSchema } from "../admin.js";
import { AppError, notFound } from "../lib/errors.js";
import { hashPassword } from "../lib/password.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { CLIENT_MIN_PASSWORD } from "./auth.js";

/** Contas de clientes revendedores. Somente o dono do sistema acessa. */
export const clientsRouter = Router();
clientsRouter.use(requireAuth, requireOwner);

const name = z
  .string({ error: "Nome é obrigatório" })
  .trim()
  .min(1, "Nome é obrigatório")
  .max(120, "O nome deve ter no máximo 120 caracteres");
const email = z.string({ error: "E-mail é obrigatório" }).trim().toLowerCase().pipe(emailSchema);
const password = z
  .string({ error: "Senha é obrigatória" })
  .min(CLIENT_MIN_PASSWORD, `A senha deve ter pelo menos ${CLIENT_MIN_PASSWORD} caracteres`)
  .max(1024);

const CreateSchema = z.object({ name, email, password }).strict();
const UpdateSchema = z
  .object({ name: name.optional(), email: email.optional(), password: password.optional(), active: z.boolean().optional() })
  .strict();
const AssignSchema = z
  .object({
    batchName: z.string().trim().min(1).max(80).optional(),
    plateIds: z.array(z.uuid()).min(1).max(1000).optional(),
    // false = só plaquinhas que ainda não são de nenhum cliente; true = tira de outro cliente também.
    reassign: z.boolean().default(false),
  })
  .strict()
  .refine((v) => Boolean(v.batchName) !== Boolean(v.plateIds), { message: "Informe um lote ou uma lista de plaquinhas" });
const IdParam = z.object({ id: z.uuid("Identificador inválido") });

type ClientRow = { id: string; name: string | null; email: string; active: boolean; createdAt: Date };

async function counts(ids: string[]) {
  const [all, configured] = await Promise.all([
    prisma.plate.groupBy({ by: ["clientId"], where: { clientId: { in: ids } }, _count: { _all: true } }),
    prisma.plate.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, destinationUrl: { not: null } }, _count: { _all: true } }),
  ]);
  const a = new Map(all.map((r) => [r.clientId, r._count._all]));
  const c = new Map(configured.map((r) => [r.clientId, r._count._all]));
  return (id: string) => ({ plates: a.get(id) ?? 0, configured: c.get(id) ?? 0 });
}

function toDto(c: ClientRow, n: { plates: number; configured: number }) {
  return { id: c.id, name: c.name, email: c.email, active: c.active, createdAt: c.createdAt.toISOString(), ...n };
}

const select = { id: true, name: true, email: true, active: true, createdAt: true } as const;

async function getClientOr404(id: string) {
  const c = await prisma.adminUser.findFirst({ where: { id, role: "CLIENT" }, select });
  if (!c) throw notFound("Cliente não encontrado");
  return c;
}

function emailTaken(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

clientsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.adminUser.findMany({ where: { role: "CLIENT" }, select, orderBy: { name: "asc" } });
    const n = await counts(rows.map((r) => r.id));
    res.json({ items: rows.map((r) => toDto(r, n(r.id))) });
  } catch (e) {
    next(e);
  }
});

clientsRouter.post("/", async (req, res, next) => {
  try {
    const data = CreateSchema.parse(req.body ?? {});
    const c = await prisma.adminUser
      .create({
        data: { role: "CLIENT", name: data.name, email: data.email, passwordHash: await hashPassword(data.password) },
        select,
      })
      .catch((e) => {
        throw emailTaken(e) ? new AppError(409, "Já existe uma conta com esse e-mail", "email_taken") : e;
      });
    res.status(201).json(toDto(c, { plates: 0, configured: 0 }));
  } catch (e) {
    next(e);
  }
});

clientsRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const c = await getClientOr404(id);
    res.json(toDto(c, (await counts([id]))(id)));
  } catch (e) {
    next(e);
  }
});

clientsRouter.patch("/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const { password: pw, ...rest } = UpdateSchema.parse(req.body ?? {});
    await getClientOr404(id);
    const data: Prisma.AdminUserUpdateInput = { ...rest };
    if (pw) data.passwordHash = await hashPassword(pw);
    const c = await prisma.adminUser.update({ where: { id }, data, select }).catch((e) => {
      throw emailTaken(e) ? new AppError(409, "Já existe uma conta com esse e-mail", "email_taken") : e;
    });
    // Senha nova ou acesso desativado derruba as sessões abertas do cliente.
    if (pw || rest.active === false) await prisma.session.deleteMany({ where: { adminId: id } });
    res.json(toDto(c, (await counts([id]))(id)));
  } catch (e) {
    next(e);
  }
});

clientsRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    await getClientOr404(id);
    // As plaquinhas continuam existindo e funcionando; só deixam de ter dono (onDelete: SetNull).
    await prisma.adminUser.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

clientsRouter.post("/:id/assign", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const { batchName, plateIds, reassign } = AssignSchema.parse(req.body ?? {});
    await getClientOr404(id);
    const where: Prisma.PlateWhereInput = batchName ? { batchName } : { id: { in: plateIds } };
    if (!reassign) where.clientId = null;
    const r = await prisma.plate.updateMany({ where, data: { clientId: id } });
    const skipped = await prisma.plate.count({
      where: { ...(batchName ? { batchName } : { id: { in: plateIds } }), clientId: { not: id } },
    });
    res.json({ assigned: r.count, skipped });
  } catch (e) {
    next(e);
  }
});
