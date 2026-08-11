/**
 * Dossier de cumplimiento por instalación: docs vigentes de la dotación actual.
 * Permisos: módulo Personas (no Operaciones).
 */

import { prisma } from "@/lib/prisma";
import { readsUnified } from "@/lib/docs/migration";
import { listPersonaDocs } from "@/lib/docs/persona-docs-service";
import { buildDocLabelMap } from "@/lib/personas";
import { getPostulacionDocumentTypes } from "@/lib/postulacion-documentos";

export type DossierGuardia = {
  guardiaId: string;
  nombre: string;
  fotoUrl: string | null;
  documentos: Array<{
    id: string;
    type: string;
    status: string;
    fileUrl: string | null;
    issuedAt: string | null;
    expiresAt: string | null;
    needsAttention?: boolean;
  }>;
};

export async function buildInstallationDossier(
  tenantId: string,
  installationId: string
): Promise<{ byGuardia: DossierGuardia[]; docLabels: Record<string, string> }> {
  const postulacionDocs = await getPostulacionDocumentTypes(tenantId);
  const docLabels = buildDocLabelMap(postulacionDocs);

  const asignaciones = await prisma.opsAsignacionGuardia.findMany({
    where: { tenantId, installationId, isActive: true },
    select: {
      guardiaId: true,
      guardia: {
        select: {
          id: true,
          faceIdPhotoUrl: true,
          persona: { select: { firstName: true, lastName: true } },
        },
      },
    },
    distinct: ["guardiaId"],
  });

  const unified = await readsUnified(tenantId);
  const byGuardia: DossierGuardia[] = [];

  for (const a of asignaciones) {
    const nombre =
      [a.guardia.persona.lastName, a.guardia.persona.firstName]
        .filter(Boolean)
        .join(" ") || "Sin nombre";

    if (unified) {
      // Preferir references a la instalación; fallback a owner del guardia
      const refs = await prisma.documentoEnlace.findMany({
        where: {
          tenantId,
          role: "reference",
          entityType: "instalacion",
          entityId: installationId,
          file: {
            links: {
              some: {
                role: "owner",
                entityType: "guardia",
                entityId: a.guardiaId,
              },
            },
          },
        },
        include: {
          file: { include: { tipo: { select: { codigo: true } } } },
        },
      });
      const docs =
        refs.length > 0
          ? refs.map((r) => ({
              id: r.file.id,
              type: r.file.tipo?.codigo ?? "documento",
              status: r.file.status ?? "pending",
              fileUrl: r.file.fileUrl,
              issuedAt: r.file.issuedAt?.toISOString().slice(0, 10) ?? null,
              expiresAt: r.file.expiresAt?.toISOString().slice(0, 10) ?? null,
              needsAttention: r.file.needsAttention,
            }))
          : (await listPersonaDocs(tenantId, a.guardiaId)).map((d) => ({
              id: d.id,
              type: d.type,
              status: d.status,
              fileUrl: d.fileUrl,
              issuedAt: d.issuedAt?.toISOString().slice(0, 10) ?? null,
              expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null,
              needsAttention: d.needsAttention,
            }));
      byGuardia.push({
        guardiaId: a.guardiaId,
        nombre,
        fotoUrl: a.guardia.faceIdPhotoUrl ?? null,
        documentos: docs,
      });
      continue;
    }

    const docs = await listPersonaDocs(tenantId, a.guardiaId);
    byGuardia.push({
      guardiaId: a.guardiaId,
      nombre,
      fotoUrl: a.guardia.faceIdPhotoUrl ?? null,
      documentos: docs.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        fileUrl: d.fileUrl,
        issuedAt: d.issuedAt?.toISOString().slice(0, 10) ?? null,
        expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null,
        needsAttention: d.needsAttention,
      })),
    });
  }

  return { byGuardia, docLabels };
}
