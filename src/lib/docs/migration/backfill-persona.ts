import { prisma } from "@/lib/prisma";
import { extractStorageKeyFromPublicUrl } from "@/lib/storage";
import { ensureTipoForLegacyType } from "@/lib/docs/ensure-tipo";
import {
  BATCH_SIZE,
  LEGACY_PERSONA,
  type MigrationStats,
} from "@/lib/docs/migration/types";
import { formatCursor, type ParsedCursor } from "@/lib/docs/migration/cursor";

export async function backfillPersonaBatch(
  tenantId: string,
  cursor: ParsedCursor,
  stats: MigrationStats
): Promise<{ nextCursor: string; done: boolean }> {
  const rows = await prisma.opsDocumentoPersona.findMany({
    where: {
      tenantId,
      ...(cursor.afterId ? { id: { gt: cursor.afterId } } : {}),
    },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });

  if (rows.length === 0) {
    return { nextCursor: formatCursor("operacional", null), done: false };
  }

  const types = [...new Set(rows.map((r) => r.type))];
  const expiryByType = new Map<string, boolean>();
  for (const t of types) {
    const any = await prisma.opsDocumentoPersona.findFirst({
      where: { tenantId, type: t, expiresAt: { not: null } },
      select: { id: true },
    });
    expiryByType.set(t, Boolean(any));
  }

  for (const row of rows) {
    const existing = await prisma.documento.findFirst({
      where: {
        tenantId,
        legacySource: LEGACY_PERSONA,
        legacyId: row.id,
      },
      select: { id: true },
    });
    if (existing) {
      stats.skipped++;
      continue;
    }

    const { tipoId, created } = await ensureTipoForLegacyType(
      prisma,
      tenantId,
      row.type,
      expiryByType.get(row.type) ?? false
    );
    if (created) stats.typesCreated.push(row.type);

    let storageKey: string | null = null;
    let needsAttention = false;
    if (row.fileUrl) {
      storageKey = extractStorageKeyFromPublicUrl(row.fileUrl);
      if (!storageKey) needsAttention = true;
    } else {
      needsAttention = true;
    }
    if (needsAttention) stats.needsAttention++;

    await prisma.$transaction(async (tx) => {
      await tx.documento.create({
        data: {
          id: row.id,
          tenantId,
          fileName: row.fileName || row.type || "documento",
          mimeType: row.mimeType || "application/octet-stream",
          size: 0,
          storageProvider: "r2",
          storageKey,
          portalVisible: row.portalVisible,
          fileUrl: row.fileUrl,
          tipoId,
          issuedAt: row.issuedAt,
          expiresAt: row.expiresAt,
          status: row.status,
          validatedBy: row.validatedBy,
          validatedAt: row.validatedAt,
          notes: row.notes,
          lastExpiryMilestone: row.lastExpiryMilestone,
          lastExpiryMilestoneAt: row.lastExpiryMilestoneAt,
          renewalInProgressUntil: row.renewalInProgressUntil,
          renewalMarkedBy: row.renewalMarkedBy,
          renewalMarkedAt: row.renewalMarkedAt,
          expiryDismissedAt: row.expiryDismissedAt,
          expiryDismissedBy: row.expiryDismissedBy,
          expiryDismissedReason: row.expiryDismissedReason,
          legacySource: LEGACY_PERSONA,
          legacyId: row.id,
          needsAttention,
          needsClassification: false,
        },
      });
      await tx.documentoEnlace.create({
        data: {
          tenantId,
          fileId: row.id,
          entityType: "guardia",
          entityId: row.guardiaId,
          folderId: row.folderId,
          role: "owner",
        },
      });
    });
    stats.personaMigrated++;
  }

  const lastId = rows[rows.length - 1]!.id;
  const more = rows.length === BATCH_SIZE;
  return {
    nextCursor: more
      ? formatCursor("persona", lastId)
      : formatCursor("operacional", null),
    done: false,
  };
}
