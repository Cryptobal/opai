/**
 * Collectors de vencimiento sobre Documento unificado.
 * Excluye needsClassification. Usa milestones/diasAlerta del catálogo.
 */

import { prisma } from "@/lib/prisma";
import {
  buildLadder,
  calcDaysRemaining,
  sanitizeMilestoneList,
  type ExpiryDocItem,
} from "@/lib/documents/expiry-engine";
import { getGuardiaDocumentosConfig } from "@/lib/guardia-documentos-config";
import { GUARDIA_ALERTING_LIFECYCLE_STATUSES } from "@/lib/personas";

const MAX = 500;

export async function collectUnifiedOperacional(
  tenantId: string,
  today: Date
): Promise<ExpiryDocItem[]> {
  const links = await prisma.documentoEnlace.findMany({
    where: {
      tenantId,
      role: "owner",
      entityType: { in: ["tenant", "instalacion"] },
      file: {
        expiresAt: { not: null },
        expiryDismissedAt: null,
        needsClassification: false,
        tipo: { tieneVencimiento: true, isActive: true },
      },
    },
    include: {
      file: {
        include: {
          tipo: {
            select: {
              id: true,
              nombre: true,
              diasAlerta: true,
              criticoLegal: true,
              milestones: true,
              capa: true,
            },
          },
        },
      },
    },
    take: MAX,
  });

  const instIds = [
    ...new Set(
      links.filter((l) => l.entityType === "instalacion").map((l) => l.entityId)
    ),
  ];
  const insts = instIds.length
    ? await prisma.crmInstallation.findMany({
        where: { id: { in: instIds }, tenantId },
        select: { id: true, name: true },
      })
    : [];
  const instName = new Map(insts.map((i) => [i.id, i.name]));

  const items: ExpiryDocItem[] = [];
  for (const l of links) {
    const doc = l.file;
    if (!doc.expiresAt || !doc.tipo || doc.tipo.capa === "guardia") continue;
    const expiresAt = new Date(doc.expiresAt);
    const diasAlerta = doc.tipo.diasAlerta ?? 30;
    items.push({
      kind: "operacional",
      id: doc.id,
      tenantId,
      label: doc.tipo.nombre,
      contextLabel:
        l.entityType === "instalacion"
          ? instName.get(l.entityId) ?? "Instalación"
          : "Global",
      installationId: l.entityType === "instalacion" ? l.entityId : null,
      guardiaId: null,
      tipoId: doc.tipoId,
      docTypeCode: null,
      expiresAt,
      daysRemaining: calcDaysRemaining(expiresAt, today),
      diasAlerta,
      criticoLegal: doc.tipo.criticoLegal,
      ladder: buildLadder({
        milestones: sanitizeMilestoneList(doc.tipo.milestones),
        diasAlerta,
      }),
      lastExpiryMilestone: doc.lastExpiryMilestone,
      renewalInProgressUntil: doc.renewalInProgressUntil,
      renewalMarkedBy: doc.renewalMarkedBy,
      dismissedAt: doc.expiryDismissedAt,
      status: doc.status ?? "vigente",
      link:
        l.entityType === "instalacion"
          ? `/opai/documentos-operativos`
          : `/opai/configuracion/documentos-operacionales`,
      fileUrl: doc.fileUrl,
    });
  }
  return items;
}

export async function collectUnifiedGuardia(
  tenantId: string,
  today: Date
): Promise<ExpiryDocItem[]> {
  const cfg = await getGuardiaDocumentosConfig(tenantId);
  const byType = new Map(cfg.filter((c) => c.hasExpiration).map((c) => [c.code, c]));
  if (byType.size === 0) return [];

  const links = await prisma.documentoEnlace.findMany({
    where: {
      tenantId,
      role: "owner",
      entityType: "guardia",
      file: {
        expiresAt: { not: null },
        expiryDismissedAt: null,
        needsClassification: false,
      },
    },
    include: {
      file: { include: { tipo: { select: { codigo: true, milestones: true } } } },
    },
    take: MAX,
  });

  const fileIds = links.map((l) => l.file.id);
  const legacyRows = fileIds.length
    ? await prisma.opsDocumentoPersona.findMany({
        where: { tenantId, id: { in: fileIds } },
        select: { id: true, type: true },
      })
    : [];
  const legacyType = new Map(legacyRows.map((r) => [r.id, r.type]));

  const guardiaIds = [...new Set(links.map((l) => l.entityId))];
  const guardias = guardiaIds.length
    ? await prisma.opsGuardia.findMany({
        where: {
          id: { in: guardiaIds },
          tenantId,
          status: "active",
          lifecycleStatus: { in: [...GUARDIA_ALERTING_LIFECYCLE_STATUSES] },
        },
        include: { persona: { select: { firstName: true, lastName: true } } },
      })
    : [];
  const guardiaById = new Map(guardias.map((g) => [g.id, g]));

  const items: ExpiryDocItem[] = [];
  for (const l of links) {
    const doc = l.file;
    if (!doc.expiresAt) continue;
    const typeCode = legacyType.get(doc.id) ?? doc.tipo?.codigo;
    if (!typeCode || !byType.has(typeCode)) continue;
    const g = guardiaById.get(l.entityId);
    if (!g) continue;

    const typeCfg = byType.get(typeCode)!;
    const expiresAt = new Date(doc.expiresAt);
    const diasAlerta = typeCfg.alertDaysBefore;
    items.push({
      kind: "guardia",
      id: doc.id,
      tenantId,
      label: typeCode,
      contextLabel: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
      installationId: null,
      guardiaId: g.id,
      tipoId: doc.tipoId,
      docTypeCode: typeCode,
      expiresAt,
      daysRemaining: calcDaysRemaining(expiresAt, today),
      diasAlerta,
      criticoLegal: Boolean(typeCfg.criticoLegal),
      ladder: buildLadder({
        milestones:
          typeCfg.milestones ?? sanitizeMilestoneList(doc.tipo?.milestones) ?? null,
        diasAlerta,
      }),
      lastExpiryMilestone: doc.lastExpiryMilestone,
      renewalInProgressUntil: doc.renewalInProgressUntil,
      renewalMarkedBy: doc.renewalMarkedBy,
      dismissedAt: doc.expiryDismissedAt,
      status: doc.status ?? "pending",
      link: `/personas/guardias/${g.id}?tab=operaciones&doc=${doc.id}`,
      fileUrl: doc.fileUrl,
    });
  }
  return items;
}
