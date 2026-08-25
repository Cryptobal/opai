import { prisma } from "@/lib/prisma";
import { uploadFile, deleteFile, getPresignedInlineUrl } from "@/lib/storage";
import type { TenantSignerRole } from "./constants";

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

export type TenantSignerDto = {
  id: string;
  role: string;
  name: string;
  email: string;
  rut: string | null;
  isActive: boolean;
  hasSignature: boolean;
  signatureUrl: string | null;
};

async function toDto(row: {
  id: string;
  role: string;
  name: string;
  email: string;
  rut: string | null;
  isActive: boolean;
  signatureStorageKey: string | null;
}): Promise<TenantSignerDto> {
  let signatureUrl: string | null = null;
  if (row.signatureStorageKey) {
    try {
      signatureUrl = await getPresignedInlineUrl({
        storageKey: row.signatureStorageKey,
        fileName: "firma.png",
        expiresInSeconds: 3600,
      });
    } catch {
      signatureUrl = null;
    }
  }
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    email: row.email,
    rut: row.rut,
    isActive: row.isActive,
    hasSignature: Boolean(row.signatureStorageKey),
    signatureUrl,
  };
}

export async function listTenantSigners(tenantId: string): Promise<TenantSignerDto[]> {
  const rows = await prisma.docTenantSigner.findMany({
    where: { tenantId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return Promise.all(rows.map(toDto));
}

export async function createTenantSigner(
  tenantId: string,
  data: { role: TenantSignerRole; name: string; email: string; rut?: string | null },
): Promise<TenantSignerDto> {
  const created = await prisma.docTenantSigner.create({
    data: {
      tenantId,
      role: data.role,
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      rut: data.rut?.trim() || null,
    },
  });
  return toDto(created);
}

export async function updateTenantSigner(
  tenantId: string,
  id: string,
  data: Partial<{ name: string; email: string; rut: string | null; isActive: boolean; role: TenantSignerRole }>,
): Promise<TenantSignerDto> {
  const existing = await prisma.docTenantSigner.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error("Firmante no encontrado");
  const updated = await prisma.docTenantSigner.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.email !== undefined ? { email: data.email.toLowerCase().trim() } : {}),
      ...(data.rut !== undefined ? { rut: data.rut?.trim() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
    },
  });
  return toDto(updated);
}

export async function uploadTenantSignerSignature(
  tenantId: string,
  id: string,
  file: Buffer,
  mimeType: string,
  fileName: string,
): Promise<TenantSignerDto> {
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") {
    throw new Error("La firma debe ser PNG o JPG");
  }
  if (file.byteLength > MAX_SIGNATURE_BYTES) {
    throw new Error("La imagen excede el máximo de 2 MB");
  }
  const existing = await prisma.docTenantSigner.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error("Firmante no encontrado");
  const upload = await uploadFile(file, fileName, mimeType, "docs-signers", tenantId);
  if (existing.signatureStorageKey) {
    try {
      await deleteFile(existing.signatureStorageKey);
    } catch (err) {
      console.warn("[docs-laborales] No se pudo borrar firma anterior", err);
    }
  }
  const updated = await prisma.docTenantSigner.update({
    where: { id },
    data: { signatureStorageKey: upload.storageKey },
  });
  return toDto(updated);
}
