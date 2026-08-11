/**
 * Mantiene enlaces reference de documentos de guardia hacia su instalación actual.
 * El owner no se toca. Borrar reference nunca toca el binario.
 */

import { prisma } from "@/lib/prisma";
import { readsUnified } from "@/lib/docs/migration";

export async function syncGuardiaInstallationRefs(
  tenantId: string,
  guardiaId: string,
  installationId: string | null
): Promise<void> {
  if (!(await readsUnified(tenantId))) return;

  // Quitar references previas a instalaciones
  await prisma.documentoEnlace.deleteMany({
    where: {
      tenantId,
      role: "reference",
      entityType: "instalacion",
      file: {
        links: {
          some: {
            tenantId,
            role: "owner",
            entityType: "guardia",
            entityId: guardiaId,
          },
        },
      },
    },
  });

  if (!installationId) return;

  const owners = await prisma.documentoEnlace.findMany({
    where: {
      tenantId,
      role: "owner",
      entityType: "guardia",
      entityId: guardiaId,
    },
    select: { fileId: true },
  });

  for (const o of owners) {
    const exists = await prisma.documentoEnlace.findFirst({
      where: {
        tenantId,
        fileId: o.fileId,
        entityType: "instalacion",
        entityId: installationId,
      },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.documentoEnlace.create({
      data: {
        tenantId,
        fileId: o.fileId,
        entityType: "instalacion",
        entityId: installationId,
        role: "reference",
      },
    });
  }
}
