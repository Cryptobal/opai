import { prisma } from "@/lib/prisma";
import { ResolveSignersError, type ResolvedSigner } from "./signer-types";

export async function resolveSupervisorSigner(
  tenantId: string,
  installationId: string | null,
  signingOrder: number,
): Promise<ResolvedSigner> {
  if (!installationId) {
    throw new ResolveSignersError("sin supervisor: guardia sin instalación");
  }
  const assignment = await prisma.opsAsignacionSupervisor.findFirst({
    where: { tenantId, installationId, isActive: true },
    include: { supervisor: { select: { name: true, email: true } } },
    orderBy: { startDate: "desc" },
  });
  if (!assignment?.supervisor.email) {
    throw new ResolveSignersError("sin supervisor: instalación sin supervisor");
  }
  return {
    role: "supervisor_instalacion",
    name: assignment.supervisor.name,
    email: assignment.supervisor.email.toLowerCase(),
    rut: null,
    signingOrder,
    autoStamp: false,
  };
}

export async function resolveCompanySigner(
  tenantId: string,
  role: "rep_legal" | "prevencionista",
  signer: { signerRefId: string | null; autoStamp: boolean },
  signingOrder: number,
): Promise<ResolvedSigner> {
  const row = signer.signerRefId
    ? await prisma.docTenantSigner.findFirst({ where: { id: signer.signerRefId, tenantId, isActive: true } })
    : await prisma.docTenantSigner.findFirst({
        where: { tenantId, role, isActive: true },
        orderBy: { createdAt: "desc" },
      });
  if (!row) throw new ResolveSignersError(`No hay ${role} activo configurado`);
  const canStamp = Boolean(signer.autoStamp && row.signatureStorageKey);
  return {
    role,
    name: row.name,
    email: row.email.toLowerCase(),
    rut: row.rut,
    signingOrder,
    autoStamp: canStamp,
    warning: signer.autoStamp && !row.signatureStorageKey
      ? "Sin firma registrada: firmará por email"
      : undefined,
  };
}

export async function resolveUsuarioSigner(
  tenantId: string,
  signer: { signerRefId: string | null; name: string | null; email: string | null },
  signingOrder: number,
): Promise<ResolvedSigner> {
  if (signer.signerRefId) {
    const admin = await prisma.admin.findFirst({
      where: { id: signer.signerRefId, tenantId },
      select: { name: true, email: true },
    });
    if (!admin?.email) throw new ResolveSignersError("Usuario OPAI no encontrado");
    return {
      role: "usuario",
      name: admin.name,
      email: admin.email.toLowerCase(),
      rut: null,
      signingOrder,
      autoStamp: false,
    };
  }
  const email = signer.email?.trim().toLowerCase() ?? "";
  if (!email) throw new ResolveSignersError("El usuario OPAI no tiene email");
  return {
    role: "usuario",
    name: signer.name || email,
    email,
    rut: null,
    signingOrder,
    autoStamp: false,
  };
}
