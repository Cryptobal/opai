import { prisma } from "@/lib/prisma";
import type { TemplateSignerRole } from "./constants";
import {
  resolveCompanySigner,
  resolveSupervisorSigner,
  resolveUsuarioSigner,
} from "./resolve-signer-roles";
import { ResolveSignersError, type ResolvedSigner } from "./signer-types";

export { ResolveSignersError, type ResolvedSigner } from "./signer-types";

export async function resolveLaboralSigners(input: {
  tenantId: string;
  templateId: string;
  guardiaId: string;
}): Promise<{ signingMode: string; recipients: ResolvedSigner[] }> {
  const template = await prisma.docTemplate.findFirst({
    where: { id: input.templateId, tenantId: input.tenantId, module: "laboral" },
    include: { signers: { orderBy: { signingOrder: "asc" } } },
  });
  if (!template) throw new ResolveSignersError("Plantilla no encontrada");

  const guardia = await prisma.opsGuardia.findFirst({
    where: { id: input.guardiaId, tenantId: input.tenantId },
    include: { persona: true },
  });
  if (!guardia) throw new ResolveSignersError("Guardia no encontrado");

  const recipients: ResolvedSigner[] = [];
  for (const signer of template.signers) {
    recipients.push(await resolveOne(input.tenantId, signer, guardia));
  }
  if (recipients[0]?.role !== "trabajador") {
    throw new ResolveSignersError("El primer firmante debe ser el trabajador");
  }
  return { signingMode: template.signingMode, recipients };
}

async function resolveOne(
  tenantId: string,
  signer: {
    role: string;
    signerRefId: string | null;
    name: string | null;
    email: string | null;
    signingOrder: number;
    autoStamp: boolean;
  },
  guardia: {
    currentInstallationId: string | null;
    persona: { firstName: string; lastName: string; email: string | null; rut: string | null };
  },
): Promise<ResolvedSigner> {
  const role = signer.role as TemplateSignerRole;
  const order = signer.signingOrder;
  if (role === "trabajador") {
    const email = guardia.persona.email?.trim().toLowerCase() ?? "";
    if (!email) throw new ResolveSignersError("El trabajador no tiene email de contacto");
    return {
      role,
      signingOrder: order,
      autoStamp: false,
      name: `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim(),
      email,
      rut: guardia.persona.rut,
    };
  }
  if (role === "supervisor_instalacion") {
    return resolveSupervisorSigner(tenantId, guardia.currentInstallationId, order);
  }
  if (role === "rep_legal" || role === "prevencionista") {
    return resolveCompanySigner(tenantId, role, signer, order);
  }
  if (role === "usuario") {
    return resolveUsuarioSigner(tenantId, signer, order);
  }
  const email = signer.email?.trim().toLowerCase() ?? "";
  if (!email) throw new ResolveSignersError("El firmante externo no tiene email");
  return {
    role: "email_externo",
    signingOrder: order,
    autoStamp: false,
    name: signer.name || email,
    email,
    rut: null,
  };
}
