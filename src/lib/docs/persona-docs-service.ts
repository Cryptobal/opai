/**
 * Lectura/escritura de documentos de guardia vía interruptor readsUnified().
 */

import { prisma } from "@/lib/prisma";
import { extractStorageKeyFromPublicUrl } from "@/lib/storage";
import { ensureTipoForLegacyType } from "@/lib/docs/ensure-tipo";
import { readsUnified } from "@/lib/docs/migration";

export type PersonaDocRow = {
  id: string;
  tenantId: string;
  guardiaId: string;
  type: string;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  status: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
  validatedBy: string | null;
  validatedAt: Date | null;
  folderId: string | null;
  portalVisible: boolean;
  lastExpiryMilestone: number | null;
  lastExpiryMilestoneAt: Date | null;
  renewalInProgressUntil: Date | null;
  renewalMarkedBy: string | null;
  renewalMarkedAt: Date | null;
  expiryDismissedAt: Date | null;
  expiryDismissedBy: string | null;
  expiryDismissedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  needsAttention?: boolean;
  folder?: { id: string; name: string } | null;
};

function mapUnified(
  doc: {
    id: string;
    tenantId: string;
    fileUrl: string | null;
    fileName: string;
    mimeType: string;
    status: string | null;
    issuedAt: Date | null;
    expiresAt: Date | null;
    notes: string | null;
    validatedBy: string | null;
    validatedAt: Date | null;
    portalVisible: boolean;
    lastExpiryMilestone: number | null;
    lastExpiryMilestoneAt: Date | null;
    renewalInProgressUntil: Date | null;
    renewalMarkedBy: string | null;
    renewalMarkedAt: Date | null;
    expiryDismissedAt: Date | null;
    expiryDismissedBy: string | null;
    expiryDismissedReason: string | null;
    createdAt: Date;
    needsAttention: boolean;
    tipo: { codigo: string } | null;
    links: Array<{
      entityId: string;
      folderId: string | null;
      folder: { id: string; name: string } | null;
    }>;
  }
): PersonaDocRow {
  const link = doc.links[0]!;
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    guardiaId: link.entityId,
    type: doc.tipo?.codigo ?? "sin_clasificar_guardia",
    fileUrl: doc.fileUrl,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    status: doc.status ?? "pending",
    issuedAt: doc.issuedAt,
    expiresAt: doc.expiresAt,
    notes: doc.notes,
    validatedBy: doc.validatedBy,
    validatedAt: doc.validatedAt,
    folderId: link.folderId,
    portalVisible: doc.portalVisible,
    lastExpiryMilestone: doc.lastExpiryMilestone,
    lastExpiryMilestoneAt: doc.lastExpiryMilestoneAt,
    renewalInProgressUntil: doc.renewalInProgressUntil,
    renewalMarkedBy: doc.renewalMarkedBy,
    renewalMarkedAt: doc.renewalMarkedAt,
    expiryDismissedAt: doc.expiryDismissedAt,
    expiryDismissedBy: doc.expiryDismissedBy,
    expiryDismissedReason: doc.expiryDismissedReason,
    createdAt: doc.createdAt,
    updatedAt: doc.createdAt,
    needsAttention: doc.needsAttention,
    folder: link.folder,
  };
}

export async function listPersonaDocs(
  tenantId: string,
  guardiaId: string,
  opts?: { needsAttentionOnly?: boolean }
): Promise<PersonaDocRow[]> {
  if (!(await readsUnified(tenantId))) {
    const rows = await prisma.opsDocumentoPersona.findMany({
      where: { tenantId, guardiaId },
      include: { folder: { select: { id: true, name: true } } },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    });
    return rows as PersonaDocRow[];
  }

  const links = await prisma.documentoEnlace.findMany({
    where: {
      tenantId,
      entityType: "guardia",
      entityId: guardiaId,
      role: "owner",
      file: opts?.needsAttentionOnly ? { needsAttention: true } : undefined,
    },
    include: {
      folder: { select: { id: true, name: true } },
      file: { include: { tipo: { select: { codigo: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return links
    .map((l) =>
      mapUnified({
        ...l.file,
        links: [{ entityId: l.entityId, folderId: l.folderId, folder: l.folder }],
      })
    )
    .sort((a, b) => {
      const ae = a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const be = b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ae - be;
    });
}

export async function getPersonaDoc(
  tenantId: string,
  guardiaId: string,
  documentId: string
): Promise<PersonaDocRow | null> {
  if (!(await readsUnified(tenantId))) {
    const row = await prisma.opsDocumentoPersona.findFirst({
      where: { id: documentId, guardiaId, tenantId },
    });
    return row as PersonaDocRow | null;
  }
  const link = await prisma.documentoEnlace.findFirst({
    where: {
      tenantId,
      fileId: documentId,
      entityType: "guardia",
      entityId: guardiaId,
      role: "owner",
    },
    include: {
      folder: { select: { id: true, name: true } },
      file: { include: { tipo: { select: { codigo: true } } } },
    },
  });
  if (!link) return null;
  return mapUnified({
    ...link.file,
    links: [{ entityId: link.entityId, folderId: link.folderId, folder: link.folder }],
  });
}

export async function createPersonaDoc(
  tenantId: string,
  data: {
    guardiaId: string;
    type: string;
    fileUrl: string;
    fileName?: string | null;
    mimeType?: string | null;
    status: string;
    issuedAt?: Date | null;
    expiresAt?: Date | null;
    notes?: string | null;
    folderId?: string | null;
    portalVisible?: boolean;
  }
): Promise<PersonaDocRow> {
  if (!(await readsUnified(tenantId))) {
    const created = await prisma.opsDocumentoPersona.create({
      data: {
        tenantId,
        guardiaId: data.guardiaId,
        type: data.type,
        fileUrl: data.fileUrl,
        fileName: data.fileName ?? null,
        mimeType: data.mimeType ?? null,
        status: data.status,
        issuedAt: data.issuedAt ?? null,
        expiresAt: data.expiresAt ?? null,
        notes: data.notes ?? null,
        folderId: data.folderId ?? null,
        portalVisible: data.portalVisible ?? false,
      },
    });
    return created as PersonaDocRow;
  }

  const { tipoId } = await ensureTipoForLegacyType(
    prisma,
    tenantId,
    data.type,
    Boolean(data.expiresAt)
  );
  const storageKey = extractStorageKeyFromPublicUrl(data.fileUrl);
  const id = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.documento.create({
      data: {
        id,
        tenantId,
        fileName: data.fileName || data.type,
        mimeType: data.mimeType || "application/octet-stream",
        size: 0,
        storageProvider: "r2",
        storageKey,
        fileUrl: data.fileUrl,
        portalVisible: data.portalVisible ?? false,
        tipoId,
        issuedAt: data.issuedAt ?? null,
        expiresAt: data.expiresAt ?? null,
        status: data.status,
        notes: data.notes ?? null,
        needsAttention: !storageKey,
      },
    });
    await tx.documentoEnlace.create({
      data: {
        tenantId,
        fileId: id,
        entityType: "guardia",
        entityId: data.guardiaId,
        folderId: data.folderId ?? null,
        role: "owner",
      },
    });
  });
  return (await getPersonaDoc(tenantId, data.guardiaId, id))!;
}

export async function updatePersonaDoc(
  tenantId: string,
  guardiaId: string,
  documentId: string,
  data: Record<string, unknown>
): Promise<PersonaDocRow | null> {
  if (!(await readsUnified(tenantId))) {
    const existing = await prisma.opsDocumentoPersona.findFirst({
      where: { id: documentId, guardiaId, tenantId },
    });
    if (!existing) return null;
    const updated = await prisma.opsDocumentoPersona.update({
      where: { id: documentId },
      data,
    });
    return updated as PersonaDocRow;
  }
  const existing = await getPersonaDoc(tenantId, guardiaId, documentId);
  if (!existing) return null;

  const fileData: Record<string, unknown> = {};
  const linkData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === "folderId") linkData.folderId = v;
    else if (k === "type") {
      const { tipoId } = await ensureTipoForLegacyType(
        prisma,
        tenantId,
        String(v),
        Boolean(existing.expiresAt)
      );
      fileData.tipoId = tipoId;
    } else {
      fileData[k] = v;
    }
  }
  if (Object.keys(fileData).length) {
    await prisma.documento.update({ where: { id: documentId }, data: fileData });
  }
  if (Object.keys(linkData).length) {
    await prisma.documentoEnlace.updateMany({
      where: { tenantId, fileId: documentId, role: "owner" },
      data: linkData,
    });
  }
  return getPersonaDoc(tenantId, guardiaId, documentId);
}

export async function deletePersonaDoc(
  tenantId: string,
  guardiaId: string,
  documentId: string
): Promise<boolean> {
  if (!(await readsUnified(tenantId))) {
    const existing = await prisma.opsDocumentoPersona.findFirst({
      where: { id: documentId, guardiaId, tenantId },
    });
    if (!existing) return false;
    await prisma.opsDocumentoPersona.delete({ where: { id: documentId } });
    return true;
  }
  const existing = await getPersonaDoc(tenantId, guardiaId, documentId);
  if (!existing) return false;
  // Conservación: solo quitar enlace owner; el Documento permanece.
  await prisma.documentoEnlace.deleteMany({
    where: { tenantId, fileId: documentId, role: "owner" },
  });
  return true;
}
