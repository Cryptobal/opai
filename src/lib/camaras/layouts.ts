import { prisma } from "@/lib/prisma";
import type { z } from "zod";
import type { layoutPatchSchema, layoutSchema } from "./schemas";

type LayoutInput = z.infer<typeof layoutSchema>;
type LayoutPatch = z.infer<typeof layoutPatchSchema>;

export async function filterActiveCameraIds(tenantId: string, ids: unknown): Promise<string[]> {
  const raw = Array.isArray(ids) ? ids.filter((v): v is string => typeof v === "string") : [];
  if (raw.length === 0) return [];
  const rows = await prisma.opsCamara.findMany({
    where: { tenantId, isActive: true, id: { in: raw } },
    select: { id: true },
  });
  const allowed = new Set(rows.map((r) => r.id));
  return raw.filter((id) => allowed.has(id));
}

export async function listCamaraLayouts(tenantId: string, userId: string) {
  const layouts = await prisma.opsCamaraLayout.findMany({
    where: { tenantId, userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return Promise.all(
    layouts.map(async (layout) => ({
      ...layout,
      cameraIds: await filterActiveCameraIds(tenantId, layout.cameraIds),
    })),
  );
}

export async function createCamaraLayout(tenantId: string, userId: string, input: LayoutInput) {
  const cameraIds = await filterActiveCameraIds(tenantId, input.cameraIds);
  return prisma.opsCamaraLayout.create({
    data: {
      tenantId,
      userId,
      name: input.name,
      gridSize: input.gridSize,
      cameraIds,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateCamaraLayout(
  tenantId: string,
  userId: string,
  id: string,
  input: LayoutPatch,
) {
  const existing = await prisma.opsCamaraLayout.findFirst({
    where: { id, tenantId, userId },
  });
  if (!existing) return null;

  let cameraIds = input.cameraIds;
  if (cameraIds) {
    cameraIds = await filterActiveCameraIds(tenantId, cameraIds);
  }

  return prisma.opsCamaraLayout.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.gridSize !== undefined ? { gridSize: input.gridSize } : {}),
      ...(cameraIds !== undefined ? { cameraIds } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function deleteCamaraLayout(tenantId: string, userId: string, id: string) {
  const existing = await prisma.opsCamaraLayout.findFirst({
    where: { id, tenantId, userId },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.opsCamaraLayout.delete({ where: { id } });
  return true;
}
