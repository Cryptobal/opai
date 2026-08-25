import { prisma } from "@/lib/prisma";
import { templateAppliesToGuardia } from "./scope";

export type EligibleGuardia = {
  id: string;
  name: string;
  email: string | null;
  installationId: string | null;
  installationName: string | null;
  skipReason: string | null;
};

export async function listEligibleGuardias(input: {
  tenantId: string;
  templateId: string;
  audience: "all_active" | "installations" | "manual";
  installationIds?: string[];
  guardiaIds?: string[];
}): Promise<EligibleGuardia[]> {
  const template = await prisma.docTemplate.findFirst({
    where: { id: input.templateId, tenantId: input.tenantId, module: "laboral", isActive: true },
    include: { installations: true },
  });
  if (!template) throw new Error("Plantilla no encontrada o inactiva");

  if (input.audience === "installations") {
    const ids = input.installationIds ?? [];
    if (ids.length === 0) throw new Error("Selecciona al menos una instalación");
    const found = await prisma.crmInstallation.findMany({
      where: { tenantId: input.tenantId, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new Error("Hay instalaciones que no pertenecen a esta empresa");
    }
  }
  if (input.audience === "manual") {
    const ids = input.guardiaIds ?? [];
    if (ids.length === 0) throw new Error("Selecciona al menos un guardia");
    const found = await prisma.opsGuardia.findMany({
      where: { tenantId: input.tenantId, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new Error("Hay guardias que no pertenecen a esta empresa");
    }
  }

  const where: {
    tenantId: string;
    status: "active";
    lifecycleStatus: "contratado";
    id?: { in: string[] };
    currentInstallationId?: { in: string[] };
  } = { tenantId: input.tenantId, status: "active", lifecycleStatus: "contratado" };
  if (input.audience === "installations") where.currentInstallationId = { in: input.installationIds ?? [] };
  if (input.audience === "manual") where.id = { in: input.guardiaIds ?? [] };

  const rows = await prisma.opsGuardia.findMany({
    where,
    include: {
      persona: { select: { firstName: true, lastName: true, email: true } },
      currentInstallation: { select: { id: true, name: true, isActive: true } },
    },
    take: 2000,
  });

  const scopeIds = template.installations.map((i) => i.installationId);
  return rows.map((g) => {
    const inScope = templateAppliesToGuardia({
      scopeType: template.scopeType,
      isActive: template.isActive,
      installationIds: scopeIds,
      currentInstallationId: g.currentInstallationId,
      installationIsActive: Boolean(g.currentInstallation?.isActive),
    });
    const email = g.persona.email?.trim() || null;
    let skipReason: string | null = null;
    if (!inScope) skipReason = "Fuera de alcance de la plantilla";
    else if (!email) skipReason = "sin contacto";
    return {
      id: g.id,
      name: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
      email,
      installationId: g.currentInstallationId,
      installationName: g.currentInstallation?.name ?? null,
      skipReason,
    };
  });
}
