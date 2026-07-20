import { prisma } from "@/lib/prisma";
import { uploadR2ToDrive } from "./drive.service";

export const SUPPORTED_DOC_TYPES = ["cotizacion", "factura", "licitacion"] as const;
export type SupportedDocType = (typeof SUPPORTED_DOC_TYPES)[number];

export const DEFAULT_MIRROR_CONFIG: Record<string, boolean> = {
  cotizacion: true,
  factura: true,
  estado_pago: false,
  liquidacion: false,
  informe_supervision: false,
  licitacion: true,
};

function asConfig(raw: unknown): Record<string, boolean> {
  const base = { ...DEFAULT_MIRROR_CONFIG };
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "boolean") base[k] = v;
    }
  }
  return base;
}

export async function enqueueDriveExport(params: {
  tenantId: string;
  docType: string;
  sourceType: string;
  sourceId: string;
  r2Key?: string | null;
  fileName: string;
  targetPath: string;
}): Promise<string | null> {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId: params.tenantId, status: "ACTIVE" },
  });
  if (!ws) return null;

  const config = asConfig(ws.mirrorConfig);
  if (config[params.docType] === false) return null;
  if (!params.r2Key) {
    console.warn("[drive-outbox] enqueue sin r2Key, se omite", params.docType);
    return null;
  }

  const row = await prisma.driveExportOutbox.create({
    data: {
      tenantId: params.tenantId,
      docType: params.docType,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      r2Key: params.r2Key,
      fileName: params.fileName,
      targetPath: params.targetPath,
      status: "PENDING",
    },
  });
  return row.id;
}

export async function flushDriveOutbox(limit = 20): Promise<{ sent: number; failed: number }> {
  const due = await prisma.driveExportOutbox.findMany({
    where: { status: { in: ["PENDING", "ERROR"] }, attempts: { lt: 5 } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const item of due) {
    const backoffMs = item.attempts * 2 * 60_000;
    if (item.attempts > 0 && Date.now() - item.createdAt.getTime() < backoffMs) {
      continue;
    }

    try {
      if (!item.r2Key) throw new Error("Sin r2Key");
      const segments = item.targetPath.split("/").map((s) => s.trim()).filter(Boolean);
      const driveFileId = await uploadR2ToDrive({
        tenantId: item.tenantId,
        r2Key: item.r2Key,
        fileName: item.fileName,
        targetSegments: segments,
      });
      if (!driveFileId) throw new Error("uploadR2ToDrive devolvió null");

      await prisma.driveExportOutbox.update({
        where: { id: item.id },
        data: { status: "SENT", driveFileId, sentAt: new Date(), lastError: null },
      });
      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.driveExportOutbox.update({
        where: { id: item.id },
        data: {
          status: "ERROR",
          attempts: { increment: 1 },
          lastError: msg.slice(0, 500),
        },
      });
      failed++;
    }
  }

  return { sent, failed };
}
