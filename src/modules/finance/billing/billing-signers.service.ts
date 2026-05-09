/**
 * Billing Signers Service
 *
 * CRUD de TenantBillingSigner (firmantes parametrizables que aparecen al
 * pie del Estado de Pago / Proforma). Cada tenant puede tener entre 1 y 3
 * firmantes ACTIVOS. La imagen de la firma se guarda en R2.
 */

import { prisma } from "@/lib/prisma";
import { uploadFile, deleteFile } from "@/lib/storage";
import type {
  BillingSignerInput,
  BillingSignerUpdateInput,
} from "@/lib/validations/billing-doc";

const MAX_ACTIVE_SIGNERS = 3;
const MAX_SIGNATURE_BYTES = 1 * 1024 * 1024; // 1 MB

export interface BillingSignerDto {
  id: string;
  name: string;
  role: string;
  signatureStorageKey: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: {
  id: string;
  name: string;
  role: string;
  signatureStorageKey: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): BillingSignerDto {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    signatureStorageKey: row.signatureStorageKey,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Solo activos, ordenados por displayOrder. Para el renderer del PDF. */
export async function listSigners(tenantId: string): Promise<BillingSignerDto[]> {
  const rows = await prisma.tenantBillingSigner.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDto);
}

/** Incluye inactivos. Para la pantalla de configuración. */
export async function listSignersAdmin(tenantId: string): Promise<BillingSignerDto[]> {
  const rows = await prisma.tenantBillingSigner.findMany({
    where: { tenantId },
    orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDto);
}

export async function createSigner(
  tenantId: string,
  input: BillingSignerInput,
): Promise<BillingSignerDto> {
  const willBeActive = input.isActive ?? true;
  if (willBeActive) {
    const activeCount = await prisma.tenantBillingSigner.count({
      where: { tenantId, isActive: true },
    });
    if (activeCount >= MAX_ACTIVE_SIGNERS) {
      throw new Error(
        `Máximo ${MAX_ACTIVE_SIGNERS} firmantes activos por tenant. Desactiva uno antes de agregar otro.`,
      );
    }
  }

  const created = await prisma.tenantBillingSigner.create({
    data: {
      tenantId,
      name: input.name,
      role: input.role,
      signatureStorageKey: input.signatureStorageKey ?? null,
      displayOrder: input.displayOrder ?? 0,
      isActive: willBeActive,
    },
  });
  return toDto(created);
}

export async function updateSigner(
  tenantId: string,
  signerId: string,
  input: BillingSignerUpdateInput,
): Promise<BillingSignerDto> {
  const existing = await prisma.tenantBillingSigner.findFirst({
    where: { id: signerId, tenantId },
  });
  if (!existing) throw new Error("Firmante no encontrado");

  // Si se está activando un firmante inactivo, validar el tope.
  if (input.isActive === true && !existing.isActive) {
    const activeCount = await prisma.tenantBillingSigner.count({
      where: { tenantId, isActive: true },
    });
    if (activeCount >= MAX_ACTIVE_SIGNERS) {
      throw new Error(
        `Máximo ${MAX_ACTIVE_SIGNERS} firmantes activos por tenant. Desactiva uno antes de activar otro.`,
      );
    }
  }

  const updated = await prisma.tenantBillingSigner.update({
    where: { id: signerId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.signatureStorageKey !== undefined
        ? { signatureStorageKey: input.signatureStorageKey }
        : {}),
      ...(input.displayOrder !== undefined
        ? { displayOrder: input.displayOrder }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return toDto(updated);
}

/** Soft-delete: marca isActive=false y conserva la fila para auditoría. */
export async function deleteSigner(
  tenantId: string,
  signerId: string,
): Promise<void> {
  const existing = await prisma.tenantBillingSigner.findFirst({
    where: { id: signerId, tenantId },
  });
  if (!existing) throw new Error("Firmante no encontrado");

  await prisma.tenantBillingSigner.update({
    where: { id: signerId },
    data: { isActive: false },
  });
}

/**
 * Sube la imagen de firma a R2 y persiste el storageKey en el firmante.
 * Si el firmante ya tenía una firma anterior, la borra de R2.
 */
export async function uploadSignerSignatureImage(
  tenantId: string,
  signerId: string,
  file: Buffer,
  mimeType: string,
  fileName: string,
): Promise<BillingSignerDto> {
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") {
    throw new Error("La firma debe ser PNG o JPG");
  }
  if (file.byteLength > MAX_SIGNATURE_BYTES) {
    throw new Error(
      `La imagen excede el máximo de ${Math.round(MAX_SIGNATURE_BYTES / 1024)} KB`,
    );
  }

  const existing = await prisma.tenantBillingSigner.findFirst({
    where: { id: signerId, tenantId },
  });
  if (!existing) throw new Error("Firmante no encontrado");

  const upload = await uploadFile(
    file,
    fileName,
    mimeType,
    "billing-signers",
    tenantId,
  );

  // Borrar imagen anterior best-effort (no abortar si falla).
  if (existing.signatureStorageKey) {
    try {
      await deleteFile(existing.signatureStorageKey);
    } catch (err) {
      console.warn(
        "[billing-signers] No se pudo borrar firma anterior",
        existing.signatureStorageKey,
        err,
      );
    }
  }

  const updated = await prisma.tenantBillingSigner.update({
    where: { id: signerId },
    data: { signatureStorageKey: upload.storageKey },
  });
  return toDto(updated);
}
