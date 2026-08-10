import { prisma } from "@/lib/prisma";
import { enqueueDriveExport } from "./drive-outbox";
import { resolveCrmFileTarget } from "./drive-crm-target";

const PAGE = 500;

/**
 * Re-encola documentos CRM vigentes hacia Drive (R2 = fuente de verdad).
 *
 * Idempotencia simple: no encola si ya hay PENDING con el mismo
 * sourceType+sourceId. Si solo hay SENT (histórico del Drive anterior),
 * crea un PENDING nuevo — el SENT se conserva como auditoría.
 */
export async function reexportTenantDriveFromR2(
  tenantId: string,
  cursor?: string | null,
): Promise<{ queued: number; remaining: boolean; nextCursor: string | null }> {
  const links = await prisma.crmFileLink.findMany({
    where: {
      tenantId,
      entityType: { in: ["deal", "account", "installation", "contact", "lead"] },
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: PAGE + 1,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      file: {
        select: {
          id: true,
          storageKey: true,
          fileName: true,
          mimeType: true,
        },
      },
    },
  });

  const hasMore = links.length > PAGE;
  const batch = hasMore ? links.slice(0, PAGE) : links;
  let queued = 0;

  for (const link of batch) {
    const file = link.file;
    if (!file?.storageKey) continue;

    const sourceType = `crm_file_${link.entityType}`;
    const pending = await prisma.driveExportOutbox.findFirst({
      where: {
        tenantId,
        sourceType,
        sourceId: file.id,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (pending) continue;

    const target = await resolveCrmFileTarget(
      tenantId,
      link.entityType,
      link.entityId,
    );
    if (!target) continue;

    const id = await enqueueDriveExport({
      tenantId,
      docType: target.docType,
      sourceType,
      sourceId: file.id,
      r2Key: file.storageKey,
      fileName: file.fileName,
      mimeType: file.mimeType,
      targetPath: target.path,
    });
    if (id) queued += 1;
  }

  const nextCursor = hasMore ? batch[batch.length - 1]?.id ?? null : null;
  return { queued, remaining: hasMore, nextCursor };
}
