/**
 * Servicio único de creación de rendiciones de gasto (Fase 5). Lo usan la ruta
 * web (`POST /api/finance/rendiciones`) y Slack, para no duplicar la lógica:
 * genera el `code` REN-YYYY-XXXX, crea la rendición en estado DRAFT + fila de
 * historial CREATED, en una transacción. Autorización la hace quien llama.
 */

import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";

export interface CreateRendicionInput {
  tenantId: string;
  submitterId: string;
  submitterName?: string | null;
  type: "PURCHASE" | "MILEAGE";
  amount: number; // CLP entero
  date: string; // YYYY-MM-DD
  description?: string | null;
  documentType?: string | null;
  itemId?: string | null;
  costCenterId?: string | null;
  beneficiaryGuardiaId?: string | null;
  beneficiaryAdminId?: string | null;
}

export async function createRendicion(input: CreateRendicionInput) {
  const year = new Date().getFullYear();
  const prefix = `REN-${year}-`;
  const last = await prisma.financeRendicion.findFirst({
    where: { tenantId: input.tenantId, code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  let seq = 1;
  if (last) {
    const n = parseInt(last.code.replace(prefix, ""), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  const code = `${prefix}${String(seq).padStart(4, "0")}`;

  return prisma.$transaction(async (tx) => {
    const created = await tx.financeRendicion.create({
      data: {
        tenantId: input.tenantId,
        code,
        submitterId: input.submitterId,
        type: input.type,
        status: "DRAFT",
        amount: input.amount,
        date: new Date(`${input.date}T00:00:00.000Z`),
        description: input.description ?? null,
        documentType: input.documentType ?? null,
        itemId: input.itemId ?? null,
        costCenterId: input.costCenterId ?? null,
        beneficiaryGuardiaId: input.beneficiaryGuardiaId ?? null,
        beneficiaryAdminId: input.beneficiaryAdminId ?? null,
      },
      include: {
        item: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true } },
        beneficiaryGuardia: {
          select: { id: true, persona: { select: { firstName: true, lastName: true, rut: true } } },
        },
      },
    });
    await tx.financeRendicionHistory.create({
      data: {
        rendicionId: created.id,
        action: "CREATED",
        fromStatus: null,
        toStatus: "DRAFT",
        userId: input.submitterId,
        userName: input.submitterName ?? null,
      },
    });
    return created;
  });
}

/** Adjunta una boleta (buffer) a una rendición: sube a R2 + fila FinanceAttachment. */
export async function attachRendicionReceipt(params: {
  tenantId: string;
  rendicionId: string;
  uploadedById: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  const uploaded = await uploadFile(params.buffer, params.fileName, params.mimeType, "finance", params.tenantId);
  await prisma.financeAttachment.create({
    data: {
      tenantId: params.tenantId,
      rendicionId: params.rendicionId,
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      storageKey: uploaded.storageKey,
      publicUrl: uploaded.publicUrl,
      attachmentType: "RECEIPT",
      uploadedById: params.uploadedById,
    },
  });
}
