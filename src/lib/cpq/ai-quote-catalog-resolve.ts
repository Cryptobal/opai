/**
 * Resolve catálogos CPQ (puesto/cargo/rol) para tools del asistente IA — misma filosofía que el modal CPQ.
 */
import { prisma } from "@/lib/prisma";

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export async function resolvePuestoTrabajoId(
  tenantId: string,
  name?: string | null,
): Promise<string | null> {
  if (!name?.trim()) return null;
  const rows = await prisma.cpqPuestoTrabajo.findMany({
    where: {
      active: true,
      OR: [{ tenantId }, { tenantId: null }],
      name: { contains: name.trim(), mode: "insensitive" },
    },
    orderBy: { name: "asc" },
    take: 12,
    select: { id: true, name: true, tenantId: true },
  });
  const target = norm(name.trim());
  const exact = rows.find((r) => norm(r.name) === target);
  if (exact) return exact.id;
  if (rows.length === 1) return rows[0].id;
  return null;
}

export async function resolveCargoId(tenantId: string, name?: string | null): Promise<string | null> {
  if (!name?.trim()) return null;
  const rows = await prisma.cpqCargo.findMany({
    where: {
      active: true,
      OR: [{ tenantId }, { tenantId: null }],
      name: { contains: name.trim(), mode: "insensitive" },
    },
    take: 12,
    select: { id: true, name: true },
  });
  const target = norm(name.trim());
  const exact = rows.find((r) => norm(r.name) === target);
  if (exact) return exact.id;
  if (rows.length === 1) return rows[0].id;
  return null;
}

export async function resolveRolId(tenantId: string, name?: string | null): Promise<string | null> {
  if (!name?.trim()) return null;
  const rows = await prisma.cpqRol.findMany({
    where: {
      active: true,
      OR: [{ tenantId }, { tenantId: null }],
      name: { contains: name.trim(), mode: "insensitive" },
    },
    take: 15,
    select: { id: true, name: true },
  });
  const target = norm(name.trim());
  const exact = rows.find((r) => norm(r.name) === target);
  if (exact) return exact.id;
  if (rows.length === 1) return rows[0].id;
  return null;
}

export async function resolveRolPreferPattern(
  tenantId: string,
  rolShiftPattern?: string | null,
): Promise<{ id: string; name: string } | null> {
  const pat = rolShiftPattern?.trim();
  let rows = await prisma.cpqRol.findMany({
    where: { active: true, OR: [{ tenantId }, { tenantId: null }] },
    orderBy: { name: "asc" },
    take: 120,
    select: { id: true, name: true, tenantId: true },
  });

  rows = [...rows].sort((a, b) => Number(b.tenantId === tenantId) - Number(a.tenantId === tenantId));

  if (pat) {
    const pnorm = norm(pat);
    const byPat = rows.find((r) => norm(r.name).includes(pnorm) || pnorm.includes(norm(r.name)));
    if (byPat) return byPat;

    const n4 = /\b4x4\b|4\s*[x]\s*4/i.test(pat);
    const n5 = /\b5x2\b|5\s*[x]\s*2/i.test(pat);
    if (n4) {
      const v = rows.find((r) => norm(r.name).includes("4x4"));
      if (v) return v;
    }
    if (n5) {
      const v = rows.find((r) => norm(r.name).includes("5x2"));
      if (v) return v;
    }
  }

  const firstTenant = rows.find((r) => r.tenantId === tenantId);
  const pick = firstTenant ?? rows[0];
  return pick ? { id: pick.id, name: pick.name } : null;
}

export async function pickDefaultCpqCatalogIds(tenantId: string): Promise<{
  puestoTrabajoId: string;
  cargoId: string;
  rolId: string;
}> {
  const [pRows, cRows, rRows] = await Promise.all([
    prisma.cpqPuestoTrabajo.findMany({
      where: { active: true, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 80,
    }),
    prisma.cpqCargo.findMany({
      where: { active: true, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 80,
    }),
    prisma.cpqRol.findMany({
      where: { active: true, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 80,
    }),
  ]);

  const defaultPuesto =
    pRows.find((p) => {
      const label = norm(p.name || "");
      return label.includes("control") && label.includes("acceso");
    }) ??
    pRows.find((p) => norm(p.name || "").includes("acceso")) ??
    pRows[0];

  const defaultCargo =
    cRows.find((c) => norm(c.name) === "guardia") ??
    cRows.find((c) => norm(c.name || "").includes("guardia")) ??
    cRows[0];

  const defaultRol = rRows.find((r) => r.name) ?? null;

  if (!defaultPuesto || !defaultCargo || !defaultRol) {
    throw new Error("CPQ_catalog_empty");
  }

  return {
    puestoTrabajoId: defaultPuesto.id,
    cargoId: defaultCargo.id,
    rolId: defaultRol.id,
  };
}
