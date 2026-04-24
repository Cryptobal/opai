/**
 * Helper compartido para mapear guardias activos al shape público del portal
 * del cliente. Usado tanto por el endpoint por instalación como por el endpoint
 * global de equipo.
 *
 * Reglas de privacidad (extender con cuidado):
 *  - NO exponer RUT, email, teléfono, sueldo, dirección ni PIN.
 *  - SÍ exponer nombre sanitizado, iniciales, OS-10, documentos portalVisible.
 */

import { prisma } from "@/lib/prisma";
import { sanitizeGuardName } from "@/lib/portal-cliente";
import {
  computeDocEstado,
  computeOs10Estado,
  type DocEstado,
} from "@/lib/portal-cliente-guardia-doc-estado";

export interface GuardiaSummary {
  id: string;
  nombre: string;
  iniciales: string;
  hiredAt: string | null;
  installationId: string | null;
  os10Estado: DocEstado;
  os10ExpiresAt: string | null;
  documentos: Array<{
    tipo: string;
    estado: DocEstado;
    expiresAt: string | null;
    fileUrl: string | null;
  }>;
  resumen: {
    total: number;
    vigentes: number;
    porVencer: number;
    vencidos: number;
    pendientes: number;
  };
}

export interface GuardiasResumenGlobal {
  totalGuardias: number;
  os10Vigente: number;
  os10PorVencer: number;
  os10Vencido: number;
  docsPendientes: number;
  docsVencidos: number;
}

export async function loadGuardiasForInstallations(params: {
  tenantId: string;
  installationIds: string[];
}): Promise<GuardiaSummary[]> {
  const { tenantId, installationIds } = params;
  if (!installationIds.length) return [];

  const guardias = await prisma.opsGuardia.findMany({
    where: {
      tenantId,
      currentInstallationId: { in: installationIds },
      status: "active",
    },
    select: {
      id: true,
      hiredAt: true,
      os10: true,
      os10ExpiresAt: true,
      currentInstallationId: true,
      persona: { select: { firstName: true, lastName: true } },
      documents: {
        where: {
          portalVisible: true,
          OR: [{ folderId: null }, { folder: { portalVisible: true } }],
        },
        select: { type: true, status: true, expiresAt: true, fileUrl: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ hiredAt: "asc" }, { id: "asc" }],
  });

  const now = new Date();
  return guardias.map((g) => mapGuardiaToSummary(g, now));
}

function mapGuardiaToSummary(
  g: {
    id: string;
    hiredAt: Date | null;
    os10: boolean | null;
    os10ExpiresAt: Date | null;
    currentInstallationId: string | null;
    persona: { firstName: string | null; lastName: string | null };
    documents: Array<{
      type: string;
      status: string;
      expiresAt: Date | null;
      fileUrl: string | null;
    }>;
  },
  now: Date,
): GuardiaSummary {
  const first = g.persona.firstName ?? "";
  const last = g.persona.lastName ?? "";
  const nombre = sanitizeGuardName(first, last) || "Guardia";
  const iniciales =
    (first[0] || "").toUpperCase() + (last[0] || "").toUpperCase() || "G";

  const documentos = g.documents.map((d) => ({
    tipo: d.type,
    estado: computeDocEstado({ status: d.status, expiresAt: d.expiresAt, now }),
    expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
    fileUrl: d.fileUrl ?? null,
  }));

  return {
    id: g.id,
    nombre,
    iniciales,
    hiredAt: g.hiredAt ? g.hiredAt.toISOString() : null,
    installationId: g.currentInstallationId,
    os10Estado: computeOs10Estado({
      os10: g.os10,
      os10ExpiresAt: g.os10ExpiresAt,
      now,
    }),
    os10ExpiresAt: g.os10ExpiresAt ? g.os10ExpiresAt.toISOString() : null,
    documentos,
    resumen: {
      total: documentos.length,
      vigentes: documentos.filter(
        (d) => d.estado === "vigente" || d.estado === "no_aplica",
      ).length,
      porVencer: documentos.filter((d) => d.estado === "por_vencer").length,
      vencidos: documentos.filter((d) => d.estado === "vencido").length,
      pendientes: documentos.filter((d) => d.estado === "pendiente").length,
    },
  };
}

export function buildResumenGlobal(
  guardias: GuardiaSummary[],
): GuardiasResumenGlobal {
  return {
    totalGuardias: guardias.length,
    os10Vigente: guardias.filter((g) => g.os10Estado === "vigente").length,
    os10PorVencer: guardias.filter((g) => g.os10Estado === "por_vencer").length,
    os10Vencido: guardias.filter(
      (g) => g.os10Estado === "vencido" || g.os10Estado === "pendiente",
    ).length,
    docsPendientes: guardias.reduce((acc, g) => acc + g.resumen.pendientes, 0),
    docsVencidos: guardias.reduce((acc, g) => acc + g.resumen.vencidos, 0),
  };
}
