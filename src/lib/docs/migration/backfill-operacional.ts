import { prisma } from "@/lib/prisma";
import {
  BATCH_SIZE,
  LEGACY_OPERACIONAL,
  type MigrationStats,
} from "@/lib/docs/migration/types";
import { formatCursor, type ParsedCursor } from "@/lib/docs/migration/cursor";

function resolveOwnerEntity(row: {
  capa: string;
  installationId: string | null;
  tenantId: string;
}): { entityType: string; entityId: string; needsAttention: boolean } {
  if (row.capa === "instalacion") {
    if (!row.installationId) {
      return { entityType: "tenant", entityId: row.tenantId, needsAttention: true };
    }
    return {
      entityType: "instalacion",
      entityId: row.installationId,
      needsAttention: false,
    };
  }
  // capa global (u otra): gana capa → tenant; si trae installationId → attention
  return {
    entityType: "tenant",
    entityId: row.tenantId,
    needsAttention: Boolean(row.installationId),
  };
}

export async function backfillOperacionalBatch(
  tenantId: string,
  cursor: ParsedCursor,
  stats: MigrationStats
): Promise<{ nextCursor: string; done: boolean }> {
  const rows = await prisma.docOperacional.findMany({
    where: {
      tenantId,
      ...(cursor.afterId ? { id: { gt: cursor.afterId } } : {}),
    },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });

  if (rows.length === 0) {
    return { nextCursor: formatCursor("done", null), done: true };
  }

  for (const row of rows) {
    const existing = await prisma.documento.findFirst({
      where: {
        tenantId,
        legacySource: LEGACY_OPERACIONAL,
        legacyId: row.id,
      },
      select: { id: true },
    });
    if (existing) {
      stats.skipped++;
      continue;
    }

    const owner = resolveOwnerEntity(row);
    const needsAttention = owner.needsAttention || !row.storageKey;
    if (needsAttention) stats.needsAttention++;

    await prisma.$transaction(async (tx) => {
      await tx.documento.create({
        data: {
          id: row.id,
          tenantId,
          fileName: row.fileName,
          mimeType: row.mimeType,
          size: row.fileSize ?? 0,
          storageProvider: "r2",
          storageKey: row.storageKey || null,
          portalVisible: row.portalClienteVisible,
          fileUrl: row.fileUrl,
          createdBy: row.createdBy,
          tipoId: row.tipoId,
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
          legacySource: LEGACY_OPERACIONAL,
          legacyId: row.id,
          needsAttention,
          needsClassification: false,
        },
      });
      await tx.documentoEnlace.create({
        data: {
          tenantId,
          fileId: row.id,
          entityType: owner.entityType,
          entityId: owner.entityId,
          role: "owner",
        },
      });
    });
    stats.operacionalMigrated++;
  }

  const lastId = rows[rows.length - 1]!.id;
  const more = rows.length === BATCH_SIZE;
  return {
    nextCursor: more
      ? formatCursor("operacional", lastId)
      : formatCursor("done", null),
    done: !more,
  };
}
