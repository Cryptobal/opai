import { prisma } from "@/lib/prisma";

export const INCIDENTES_COLUMNS = [
  { key: "startedAt", label: "Inicio" },
  { key: "endedAt", label: "Término" },
  { key: "severity", label: "Alcance" },
  { key: "description", label: "Descripción" },
  { key: "tenantName", label: "Empleador afectado" },
];

export async function listDtIncidentesTecnicos() {
  const rows = await prisma.dtIncidenteTecnico.findMany({
    orderBy: { startedAt: "desc" },
    include: { tenant: { select: { legalName: true, name: true } } },
    take: 1000,
  });
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? "",
    severity: r.severity,
    description: r.description,
    tenantId: r.tenantId,
    tenantName: r.tenant ? r.tenant.legalName || r.tenant.name : "Plataforma",
    createdBy: r.createdBy,
  }));
}
