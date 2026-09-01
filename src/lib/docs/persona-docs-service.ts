/**
 * Lectura/escritura de documentos de guardia vía interruptor readsUnified().
 */

import { prisma } from "@/lib/prisma";
import { extractStorageKeyFromPublicUrl } from "@/lib/storage";
import { ensureTipoForLegacyType } from "@/lib/docs/ensure-tipo";
import { readsUnified } from "@/lib/docs/migration";
import {
  canonicalGuardiaTypeCode,
  UNCLASSIFIED_GUARDIA_TIPO,
} from "@/lib/docs/legacy-type-map";
import { personaTypesForOperationalCodigo } from "@/lib/operational-guard-doc-slots-shared";
import { GUARDIA_ALERTING_LIFECYCLE_STATUSES } from "@/lib/personas";
import { LEGACY_PERSONA } from "@/lib/docs/migration/types";

const FOLDER_SELECT = { id: true, name: true, portalVisible: true } as const;

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
  folder?: { id: string; name: string; portalVisible?: boolean } | null;
};

export type PersonaDocSummary = {
  id: string;
  guardiaId: string;
  type: string;
  status: string;
  fileName: string | null;
  fileUrl: string | null;
  expiresAt: Date | null;
  issuedAt: Date | null;
  portalVisible: boolean;
  folderPortalVisible: boolean | null;
};

export type ExpiredGuardiaDocAlert = {
  id: string;
  type: string;
  expiresAt: Date | null;
  guardiaId: string;
  guardiaName: string;
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
      folder: { id: string; name: string; portalVisible?: boolean } | null;
    }>;
  }
): PersonaDocRow {
  const link = doc.links[0]!;
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    guardiaId: link.entityId,
    type: doc.tipo?.codigo
      ? canonicalGuardiaTypeCode(doc.tipo.codigo)
      : UNCLASSIFIED_GUARDIA_TIPO,
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

function mapLegacyRow(row: {
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
  folder?: { id: string; name: string; portalVisible?: boolean } | null;
}): PersonaDocRow {
  return {
    ...row,
    type: canonicalGuardiaTypeCode(row.type),
    needsAttention: false,
    folder: row.folder ?? null,
  };
}

function sortPersonaDocs(rows: PersonaDocRow[]): PersonaDocRow[] {
  return [...rows].sort((a, b) => {
    const ae = a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const be = b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (ae !== be) return ae - be;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/**
 * Une docs unificados con filas legacy que nunca se backfillearon
 * (p. ej. postulaciones posteriores al corte de migración).
 * Dedup por legacyId y por fileUrl.
 */
export function mergeLegacyPersonaDocsIntoUnified(
  unified: PersonaDocRow[],
  legacy: PersonaDocRow[],
  backfilledLegacyIds: Set<string>
): PersonaDocRow[] {
  const unifiedUrls = new Set(
    unified.map((d) => d.fileUrl).filter((u): u is string => Boolean(u))
  );
  const extra = legacy.filter((row) => {
    if (backfilledLegacyIds.has(row.id)) return false;
    if (row.fileUrl && unifiedUrls.has(row.fileUrl)) return false;
    return true;
  });
  return sortPersonaDocs([...unified, ...extra]);
}

export async function listPersonaDocs(
  tenantId: string,
  guardiaId: string,
  opts?: { needsAttentionOnly?: boolean }
): Promise<PersonaDocRow[]> {
  if (!(await readsUnified(tenantId))) {
    const rows = await prisma.opsDocumentoPersona.findMany({
      where: { tenantId, guardiaId },
      include: { folder: { select: FOLDER_SELECT } },
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
      folder: { select: FOLDER_SELECT },
      file: { include: { tipo: { select: { codigo: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const unified = links.map((l) =>
    mapUnified({
      ...l.file,
      links: [{ entityId: l.entityId, folderId: l.folderId, folder: l.folder }],
    })
  );

  if (opts?.needsAttentionOnly) {
    return sortPersonaDocs(unified);
  }

  const legacyRows = await prisma.opsDocumentoPersona.findMany({
    where: { tenantId, guardiaId },
    include: { folder: { select: FOLDER_SELECT } },
  });
  const backfilledLegacyIds = new Set(
    links
      .map((l) => l.file.legacyId)
      .filter((id): id is string => Boolean(id))
  );

  return mergeLegacyPersonaDocsIntoUnified(
    unified,
    legacyRows.map(mapLegacyRow),
    backfilledLegacyIds
  );
}

async function loadUnifiedOwnerDoc(
  tenantId: string,
  guardiaId: string,
  fileId: string
): Promise<PersonaDocRow | null> {
  const link = await prisma.documentoEnlace.findFirst({
    where: {
      tenantId,
      fileId,
      entityType: "guardia",
      entityId: guardiaId,
      role: "owner",
    },
    include: {
      folder: { select: FOLDER_SELECT },
      file: { include: { tipo: { select: { codigo: true } } } },
    },
  });
  if (!link) return null;
  return mapUnified({
    ...link.file,
    links: [{ entityId: link.entityId, folderId: link.folderId, folder: link.folder }],
  });
}

async function loadLegacyPersonaDoc(
  tenantId: string,
  guardiaId: string,
  documentId: string
): Promise<PersonaDocRow | null> {
  const row = await prisma.opsDocumentoPersona.findFirst({
    where: { id: documentId, guardiaId, tenantId },
    include: { folder: { select: FOLDER_SELECT } },
  });
  return row ? mapLegacyRow(row) : null;
}

export async function getPersonaDoc(
  tenantId: string,
  guardiaId: string,
  documentId: string
): Promise<PersonaDocRow | null> {
  if (!(await readsUnified(tenantId))) {
    return loadLegacyPersonaDoc(tenantId, guardiaId, documentId);
  }
  const unified = await loadUnifiedOwnerDoc(tenantId, guardiaId, documentId);
  if (unified) return unified;

  const backfilled = await prisma.documento.findFirst({
    where: {
      tenantId,
      legacySource: LEGACY_PERSONA,
      legacyId: documentId,
    },
    select: { id: true },
  });
  if (backfilled) {
    const mapped = await loadUnifiedOwnerDoc(tenantId, guardiaId, backfilled.id);
    if (mapped) return mapped;
  }

  return loadLegacyPersonaDoc(tenantId, guardiaId, documentId);
}

export async function createPersonaDoc(
  tenantId: string,
  data: {
    guardiaId: string;
    type: string;
    fileUrl: string;
    fileName?: string | null;
    mimeType?: string | null;
    size?: number | null;
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
  const size =
    typeof data.size === "number" && Number.isFinite(data.size) && data.size >= 0
      ? Math.min(Math.floor(data.size), 50_000_000)
      : 0;
  const fileName = (data.fileName?.trim() || data.type).slice(0, 300);
  const mimeType = (data.mimeType?.trim() || "application/octet-stream").slice(0, 120);
  await prisma.$transaction(async (tx) => {
    await tx.documento.create({
      data: {
        id,
        tenantId,
        fileName,
        mimeType,
        size,
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

export async function createPersonaDocsFromUploads(
  tenantId: string,
  guardiaId: string,
  docs: Array<{
    type: string;
    fileUrl: string;
    fileName?: string | null;
    mimeType?: string | null;
    size?: number | null;
  }>
): Promise<void> {
  for (const doc of docs) {
    if (!doc.type?.trim() || !doc.fileUrl) continue;
    await createPersonaDoc(tenantId, {
      guardiaId,
      type: doc.type,
      fileUrl: doc.fileUrl,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      size: doc.size,
      status: "pendiente",
    });
  }
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
    const legacyData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      legacyData[k] = v;
    }
    const updated = await prisma.opsDocumentoPersona.update({
      where: { id: documentId },
      data: legacyData,
    });
    return updated as PersonaDocRow;
  }
  const existing = await getPersonaDoc(tenantId, guardiaId, documentId);
  if (!existing) return null;

  const unifiedRow = await loadUnifiedOwnerDoc(tenantId, guardiaId, existing.id);
  if (!unifiedRow) {
    const legacyData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (k === "type" && typeof v === "string") {
        legacyData[k] = canonicalGuardiaTypeCode(v);
      } else {
        legacyData[k] = v;
      }
    }
    if (Object.keys(legacyData).length) {
      await prisma.opsDocumentoPersona.update({
        where: { id: existing.id },
        data: legacyData,
      });
    }
    return getPersonaDoc(tenantId, guardiaId, existing.id);
  }

  const fileData: Record<string, unknown> = {};
  const linkData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (k === "folderId") linkData.folderId = v;
    else if (k === "type") {
      if (typeof v !== "string" || !v.trim()) continue;
      const { tipoId } = await ensureTipoForLegacyType(
        prisma,
        tenantId,
        v,
        Boolean(existing.expiresAt)
      );
      fileData.tipoId = tipoId;
    } else {
      fileData[k] = v;
    }
  }
  if (Object.keys(fileData).length) {
    await prisma.documento.update({ where: { id: existing.id }, data: fileData });
  }
  if (Object.keys(linkData).length) {
    await prisma.documentoEnlace.updateMany({
      where: { tenantId, fileId: existing.id, role: "owner" },
      data: linkData,
    });
  }
  return getPersonaDoc(tenantId, guardiaId, existing.id);
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
  const unifiedRow = await loadUnifiedOwnerDoc(tenantId, guardiaId, existing.id);
  if (unifiedRow) {
    await prisma.documentoEnlace.deleteMany({
      where: { tenantId, fileId: existing.id, role: "owner" },
    });
    return true;
  }
  await prisma.opsDocumentoPersona.delete({ where: { id: existing.id } });
  return true;
}

/**
 * Índice guardiaId → set de códigos de tipo canónicos (una consulta por rama).
 * Documentos sin tipo mapean a `sin_clasificar_guardia`.
 */
export async function getGuardiaDocTypeIndex(
  tenantId: string,
  guardiaIds?: string[]
): Promise<Map<string, Set<string>>> {
  const index = new Map<string, Set<string>>();
  const add = (guardiaId: string, codigo: string) => {
    let set = index.get(guardiaId);
    if (!set) {
      set = new Set();
      index.set(guardiaId, set);
    }
    set.add(codigo);
  };

  if (guardiaIds && guardiaIds.length === 0) return index;

  const idsFilter = guardiaIds ? { in: guardiaIds } : undefined;

  if (!(await readsUnified(tenantId))) {
    const rows = await prisma.opsDocumentoPersona.findMany({
      where: {
        tenantId,
        ...(idsFilter ? { guardiaId: idsFilter } : {}),
      },
      select: { guardiaId: true, type: true },
    });
    for (const row of rows) {
      add(row.guardiaId, canonicalGuardiaTypeCode(row.type));
    }
    return index;
  }

  const links = await prisma.documentoEnlace.findMany({
    where: {
      tenantId,
      entityType: "guardia",
      role: "owner",
      ...(idsFilter ? { entityId: idsFilter } : {}),
    },
    select: {
      entityId: true,
      file: { select: { tipo: { select: { codigo: true } } } },
    },
  });
  for (const link of links) {
    add(link.entityId, link.file.tipo?.codigo ?? UNCLASSIFIED_GUARDIA_TIPO);
  }

  const leftover = await prisma.opsDocumentoPersona.findMany({
    where: {
      tenantId,
      ...(idsFilter ? { guardiaId: idsFilter } : {}),
    },
    select: { guardiaId: true, type: true },
  });
  for (const row of leftover) {
    add(row.guardiaId, canonicalGuardiaTypeCode(row.type));
  }
  return index;
}

export async function listPersonaDocSummaries(
  tenantId: string,
  guardiaIds: string[]
): Promise<PersonaDocSummary[]> {
  if (guardiaIds.length === 0) return [];

  if (!(await readsUnified(tenantId))) {
    const rows = await prisma.opsDocumentoPersona.findMany({
      where: { tenantId, guardiaId: { in: guardiaIds } },
      select: {
        id: true,
        guardiaId: true,
        type: true,
        status: true,
        fileName: true,
        fileUrl: true,
        expiresAt: true,
        issuedAt: true,
        portalVisible: true,
        folder: { select: { portalVisible: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      guardiaId: row.guardiaId,
      type: canonicalGuardiaTypeCode(row.type),
      status: row.status,
      fileName: row.fileName,
      fileUrl: row.fileUrl,
      expiresAt: row.expiresAt,
      issuedAt: row.issuedAt,
      portalVisible: row.portalVisible,
      folderPortalVisible: row.folder?.portalVisible ?? null,
    }));
  }

  const links = await prisma.documentoEnlace.findMany({
    where: {
      tenantId,
      entityType: "guardia",
      role: "owner",
      entityId: { in: guardiaIds },
    },
    select: {
      entityId: true,
      folder: { select: { portalVisible: true } },
      file: {
        select: {
          id: true,
          status: true,
          fileName: true,
          fileUrl: true,
          expiresAt: true,
          issuedAt: true,
          portalVisible: true,
          legacyId: true,
          tipo: { select: { codigo: true } },
        },
      },
    },
  });

  const unified: PersonaDocSummary[] = links.map((l) => ({
    id: l.file.id,
    guardiaId: l.entityId,
    type: l.file.tipo?.codigo ?? UNCLASSIFIED_GUARDIA_TIPO,
    status: l.file.status ?? "pending",
    fileName: l.file.fileName,
    fileUrl: l.file.fileUrl,
    expiresAt: l.file.expiresAt,
    issuedAt: l.file.issuedAt,
    portalVisible: l.file.portalVisible,
    folderPortalVisible: l.folder?.portalVisible ?? null,
  }));

  const leftover = await prisma.opsDocumentoPersona.findMany({
    where: { tenantId, guardiaId: { in: guardiaIds } },
    select: {
      id: true,
      guardiaId: true,
      type: true,
      status: true,
      fileName: true,
      fileUrl: true,
      expiresAt: true,
      issuedAt: true,
      portalVisible: true,
      folder: { select: { portalVisible: true } },
    },
  });
  const backfilledLegacyIds = new Set(
    links.map((l) => l.file.legacyId).filter((id): id is string => Boolean(id))
  );
  const unifiedUrls = new Set(
    unified.map((d) => d.fileUrl).filter((u): u is string => Boolean(u))
  );
  const extra: PersonaDocSummary[] = leftover
    .filter((row) => {
      if (backfilledLegacyIds.has(row.id)) return false;
      if (row.fileUrl && unifiedUrls.has(row.fileUrl)) return false;
      return true;
    })
    .map((row) => ({
      id: row.id,
      guardiaId: row.guardiaId,
      type: canonicalGuardiaTypeCode(row.type),
      status: row.status,
      fileName: row.fileName,
      fileUrl: row.fileUrl,
      expiresAt: row.expiresAt,
      issuedAt: row.issuedAt,
      portalVisible: row.portalVisible,
      folderPortalVisible: row.folder?.portalVisible ?? null,
    }));

  return [...unified, ...extra];
}

/** Claves `guardiaId|type` incluyendo alias (contrato → contrato_guardia). */
export function personaDocLookupKeys(guardiaId: string, type: string): string[] {
  const canonical = canonicalGuardiaTypeCode(type);
  const aliases = personaTypesForOperationalCodigo(canonical);
  return [...new Set([type, canonical, ...aliases])].map((t) => `${guardiaId}|${t}`);
}

export async function countPendingPersonaDocs(tenantId: string): Promise<number> {
  if (!(await readsUnified(tenantId))) {
    return prisma.opsDocumentoPersona.count({
      where: { tenantId, status: "pending" },
    });
  }
  return prisma.documentoEnlace.count({
    where: {
      tenantId,
      entityType: "guardia",
      role: "owner",
      file: { status: { in: ["pending", "pendiente"] } },
    },
  });
}

export async function countPersonaDocsByType(
  tenantId: string
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = (code: string, n: number) => {
    counts[code] = (counts[code] ?? 0) + n;
  };

  if (!(await readsUnified(tenantId))) {
    const rows = await prisma.opsDocumentoPersona.groupBy({
      by: ["type"],
      where: { tenantId },
      _count: { _all: true },
    });
    for (const row of rows) {
      const n = row._count._all;
      bump(row.type, n);
      const canonical = canonicalGuardiaTypeCode(row.type);
      if (canonical !== row.type) bump(canonical, n);
      for (const alias of personaTypesForOperationalCodigo(canonical)) {
        if (alias !== row.type && alias !== canonical) bump(alias, n);
      }
    }
    return counts;
  }

  const links = await prisma.documentoEnlace.findMany({
    where: { tenantId, entityType: "guardia", role: "owner" },
    select: { file: { select: { tipo: { select: { codigo: true } } } } },
  });
  for (const link of links) {
    const codigo = link.file.tipo?.codigo ?? UNCLASSIFIED_GUARDIA_TIPO;
    bump(codigo, 1);
    for (const alias of personaTypesForOperationalCodigo(codigo)) {
      if (alias !== codigo) bump(alias, 1);
    }
  }
  return counts;
}

export async function listExpiredGuardiaDocs(
  tenantId: string,
  opts?: { take?: number }
): Promise<ExpiredGuardiaDocAlert[]> {
  const take = opts?.take ?? 50;

  if (!(await readsUnified(tenantId))) {
    const rows = await prisma.opsDocumentoPersona.findMany({
      where: {
        tenantId,
        status: "vencido",
        guardia: {
          status: "active",
          lifecycleStatus: { in: [...GUARDIA_ALERTING_LIFECYCLE_STATUSES] },
        },
      },
      include: {
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { expiresAt: "asc" },
      take,
    });
    return rows.map((d) => ({
      id: d.id,
      type: d.type,
      expiresAt: d.expiresAt,
      guardiaId: d.guardiaId,
      guardiaName: `${d.guardia.persona.lastName} ${d.guardia.persona.firstName}`,
    }));
  }

  const links = await prisma.documentoEnlace.findMany({
    where: {
      tenantId,
      entityType: "guardia",
      role: "owner",
      file: { status: "vencido" },
    },
    select: {
      entityId: true,
      file: {
        select: {
          id: true,
          expiresAt: true,
          tipo: { select: { codigo: true, nombre: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: take * 3,
  });

  const guardiaIds = [...new Set(links.map((l) => l.entityId))];
  if (guardiaIds.length === 0) return [];

  const guardias = await prisma.opsGuardia.findMany({
    where: {
      tenantId,
      id: { in: guardiaIds },
      status: "active",
      lifecycleStatus: { in: [...GUARDIA_ALERTING_LIFECYCLE_STATUSES] },
    },
    select: {
      id: true,
      persona: { select: { firstName: true, lastName: true } },
    },
  });
  const guardiaById = new Map(guardias.map((g) => [g.id, g]));

  const out: ExpiredGuardiaDocAlert[] = [];
  for (const link of links) {
    const g = guardiaById.get(link.entityId);
    if (!g) continue;
    out.push({
      id: link.file.id,
      type: link.file.tipo?.codigo ?? UNCLASSIFIED_GUARDIA_TIPO,
      expiresAt: link.file.expiresAt,
      guardiaId: link.entityId,
      guardiaName: `${g.persona.lastName} ${g.persona.firstName}`,
    });
    if (out.length >= take) break;
  }
  out.sort((a, b) => {
    const ae = a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const be = b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ae - be;
  });
  return out;
}

export async function countUploadedContratoFirmado(
  tenantId: string,
  guardiaId: string
): Promise<number> {
  const contratoTypes = new Set(["contrato_firmado", "contrato_guardia", "contrato"]);
  if (!(await readsUnified(tenantId))) {
    return prisma.opsDocumentoPersona.count({
      where: {
        tenantId,
        guardiaId,
        type: "contrato_firmado",
        fileUrl: { not: null },
        status: { notIn: ["rechazado", "rejected"] },
      },
    });
  }
  const docs = await listPersonaDocs(tenantId, guardiaId);
  return docs.filter(
    (d) =>
      contratoTypes.has(d.type) &&
      d.fileUrl &&
      !["rechazado", "rejected"].includes(d.status)
  ).length;
}
