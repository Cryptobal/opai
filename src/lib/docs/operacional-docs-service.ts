/**
 * Lectura/escritura de documentos operacionales (global/instalación)
 * vía interruptor readsUnified().
 */

import { prisma } from "@/lib/prisma";
import { readsUnified } from "@/lib/docs/migration";

export type OperacionalCreateInput = {
  tipoId: string;
  capa: "global" | "instalacion";
  installationId?: string | null;
  fileName: string;
  fileUrl: string;
  storageKey: string;
  fileSize?: number | null;
  mimeType: string;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  status: string;
  notes?: string | null;
  portalClienteVisible?: boolean;
  createdBy?: string | null;
};

function ownerEntity(
  tenantId: string,
  capa: string,
  installationId: string | null | undefined
) {
  if (capa === "instalacion" && installationId) {
    return { entityType: "instalacion", entityId: installationId };
  }
  return { entityType: "tenant", entityId: tenantId };
}

export type OperacionalDocRow = {
  id: string;
  tenantId: string;
  tipoId: string;
  capa: string;
  installationId: string | null;
  fileName: string;
  fileUrl: string;
  storageKey: string;
  fileSize: number | null;
  mimeType: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  status: string;
  notes: string | null;
  portalClienteVisible: boolean;
  validatedBy: string | null;
  validatedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  needsAttention?: boolean;
  tipo?: {
    id: string;
    codigo: string;
    nombre: string;
    normativa: string | null;
    obligatorio: boolean;
    tieneVencimiento: boolean;
    diasAlerta: number;
    order: number;
  } | null;
};

export async function listOperacionalDocs(
  tenantId: string,
  where: {
    capa?: string;
    installationId?: string | null;
    tipoId?: string;
  },
  includeTipo = true
): Promise<OperacionalDocRow[]> {
  if (!(await readsUnified(tenantId))) {
    const rows = await prisma.docOperacional.findMany({
      where: {
        tenantId,
        ...(where.capa ? { capa: where.capa } : {}),
        ...(where.installationId !== undefined
          ? { installationId: where.installationId }
          : {}),
        ...(where.tipoId ? { tipoId: where.tipoId } : {}),
      },
      include: includeTipo
        ? {
            tipo: {
              select: {
                id: true,
                codigo: true,
                nombre: true,
                normativa: true,
                obligatorio: true,
                tieneVencimiento: true,
                diasAlerta: true,
                order: true,
              },
            },
          }
        : undefined,
      orderBy: { createdAt: "desc" },
    });
    return rows as unknown as OperacionalDocRow[];
  }

  const entity =
    where.capa === "instalacion" && where.installationId
      ? { entityType: "instalacion", entityId: where.installationId }
      : where.capa === "global"
        ? { entityType: "tenant", entityId: tenantId }
        : null;

  const links = await prisma.documentoEnlace.findMany({
    where: {
      tenantId,
      role: "owner",
      ...(entity ?? {}),
      file: {
        ...(where.tipoId ? { tipoId: where.tipoId } : {}),
        OR: [
          { legacySource: "doc_operacional" },
          { legacySource: null, tipoId: { not: null } },
        ],
      },
    },
    include: {
      file: {
        include: includeTipo
          ? {
              tipo: {
                select: {
                  id: true,
                  codigo: true,
                  nombre: true,
                  normativa: true,
                  obligatorio: true,
                  tieneVencimiento: true,
                  diasAlerta: true,
                  order: true,
                },
              },
            }
          : undefined,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return links.map((l) => ({
    id: l.file.id,
    tenantId,
    tipoId: l.file.tipoId!,
    capa: l.entityType === "instalacion" ? "instalacion" : "global",
    installationId: l.entityType === "instalacion" ? l.entityId : null,
    fileName: l.file.fileName,
    fileUrl: l.file.fileUrl ?? "",
    storageKey: l.file.storageKey ?? "",
    fileSize: l.file.size,
    mimeType: l.file.mimeType,
    issuedAt: l.file.issuedAt,
    expiresAt: l.file.expiresAt,
    status: l.file.status ?? "vigente",
    notes: l.file.notes,
    portalClienteVisible: l.file.portalVisible,
    validatedBy: l.file.validatedBy,
    validatedAt: l.file.validatedAt,
    createdBy: l.file.createdBy,
    createdAt: l.file.createdAt,
    updatedAt: l.file.createdAt,
    tipo: (l.file as { tipo?: OperacionalDocRow["tipo"] }).tipo ?? null,
    needsAttention: l.file.needsAttention,
  }));
}

export async function createOperacionalDoc(
  tenantId: string,
  data: OperacionalCreateInput
) {
  if (!(await readsUnified(tenantId))) {
    return prisma.docOperacional.create({
      data: {
        tenantId,
        tipoId: data.tipoId,
        capa: data.capa,
        installationId: data.installationId ?? null,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        storageKey: data.storageKey,
        fileSize: data.fileSize ?? null,
        mimeType: data.mimeType,
        issuedAt: data.issuedAt ?? null,
        expiresAt: data.expiresAt ?? null,
        status: data.status,
        notes: data.notes ?? null,
        portalClienteVisible: data.portalClienteVisible ?? true,
        createdBy: data.createdBy ?? null,
      },
      include: {
        tipo: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            normativa: true,
            obligatorio: true,
            tieneVencimiento: true,
            diasAlerta: true,
            order: true,
          },
        },
      },
    });
  }

  const owner = ownerEntity(tenantId, data.capa, data.installationId);
  const id = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.documento.create({
      data: {
        id,
        tenantId,
        fileName: data.fileName,
        mimeType: data.mimeType,
        size: data.fileSize ?? 0,
        storageProvider: "r2",
        storageKey: data.storageKey,
        fileUrl: data.fileUrl,
        portalVisible: data.portalClienteVisible ?? true,
        createdBy: data.createdBy ?? null,
        tipoId: data.tipoId,
        issuedAt: data.issuedAt ?? null,
        expiresAt: data.expiresAt ?? null,
        status: data.status,
        notes: data.notes ?? null,
      },
    });
    await tx.documentoEnlace.create({
      data: {
        tenantId,
        fileId: id,
        entityType: owner.entityType,
        entityId: owner.entityId,
        role: "owner",
      },
    });
  });
  const rows = await listOperacionalDocs(tenantId, {
    capa: data.capa,
    installationId: data.installationId ?? null,
    tipoId: data.tipoId,
  });
  return rows.find((r) => r.id === id)!;
}

export async function updateOperacionalDoc(
  tenantId: string,
  docId: string,
  data: Record<string, unknown>
) {
  if (!(await readsUnified(tenantId))) {
    return prisma.docOperacional.update({ where: { id: docId }, data });
  }
  const mapped: Record<string, unknown> = { ...data };
  if ("portalClienteVisible" in mapped) {
    mapped.portalVisible = mapped.portalClienteVisible;
    delete mapped.portalClienteVisible;
  }
  delete mapped.capa;
  delete mapped.installationId;
  delete mapped.fileSize;
  if ("fileSize" in data) mapped.size = data.fileSize;
  return prisma.documento.update({ where: { id: docId }, data: mapped });
}

export async function deleteOperacionalDoc(tenantId: string, docId: string) {
  if (!(await readsUnified(tenantId))) {
    await prisma.docOperacional.delete({ where: { id: docId } });
    return;
  }
  await prisma.documentoEnlace.deleteMany({
    where: { tenantId, fileId: docId, role: "owner" },
  });
}

export async function findOperacionalDoc(tenantId: string, docId: string) {
  if (!(await readsUnified(tenantId))) {
    return prisma.docOperacional.findFirst({ where: { id: docId, tenantId } });
  }
  const link = await prisma.documentoEnlace.findFirst({
    where: { tenantId, fileId: docId, role: "owner" },
    include: { file: true },
  });
  if (!link) return null;
  return {
    ...link.file,
    capa: (link.entityType === "instalacion" ? "instalacion" : "global") as
      | "global"
      | "instalacion",
    installationId: link.entityType === "instalacion" ? link.entityId : null,
    portalClienteVisible: link.file.portalVisible,
    fileSize: link.file.size,
  };
}
