/**
 * GET /api/portal/cliente/equipo
 *
 * Equipo global del cliente: todos los guardias activos de todas las
 * instalaciones de la cuenta, agrupados por instalación, con resumen global.
 *
 * Privacidad: ver src/lib/portal-cliente-guardias.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import {
  loadGuardiasForInstallations,
  buildResumenGlobal,
  type GuardiaSummary,
} from "@/lib/portal-cliente-guardias";
import { DEMO_PERSONAL } from "@/lib/portal/demo-data";

export const dynamic = "force-dynamic";

interface Grupo {
  installation: { id: string; name: string };
  guardias: GuardiaSummary[];
  resumen: {
    total: number;
    os10Vigente: number;
    os10PorVencer: number;
    os10Vencido: number;
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }

    if (session.isProspect) {
      return buildDemoResponse();
    }

    const installationIds = session.installationIds ?? [];
    if (installationIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          grupos: [],
          resumen: {
            totalGuardias: 0,
            totalInstalaciones: 0,
            os10Vigente: 0,
            os10PorVencer: 0,
            os10Vencido: 0,
            docsPendientes: 0,
            docsVencidos: 0,
          },
        },
      });
    }

    const [installations, guardias] = await Promise.all([
      prisma.crmInstallation.findMany({
        where: {
          id: { in: installationIds },
          tenantId: session.tenantId,
          accountId: session.accountId,
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      loadGuardiasForInstallations({
        tenantId: session.tenantId,
        installationIds,
      }),
    ]);

    const grupos: Grupo[] = installations.map((inst) => {
      const gs = guardias.filter((g) => g.installationId === inst.id);
      return {
        installation: { id: inst.id, name: inst.name },
        guardias: gs,
        resumen: {
          total: gs.length,
          os10Vigente: gs.filter((g) => g.os10Estado === "vigente").length,
          os10PorVencer: gs.filter((g) => g.os10Estado === "por_vencer").length,
          os10Vencido: gs.filter(
            (g) => g.os10Estado === "vencido" || g.os10Estado === "pendiente",
          ).length,
        },
      };
    });

    const resumenGlobal = buildResumenGlobal(guardias);

    return NextResponse.json({
      success: true,
      data: {
        grupos,
        resumen: {
          ...resumenGlobal,
          totalInstalaciones: installations.length,
        },
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] equipo error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}

function buildDemoResponse() {
  const demoGuardias: GuardiaSummary[] = DEMO_PERSONAL.map((p, i) => ({
    id: `demo-${i}`,
    nombre: p.nombre,
    iniciales: p.avatar,
    hiredAt: null,
    installationId: "demo-installation",
    os10Estado: i === 2 ? "por_vencer" : "vigente",
    os10ExpiresAt: null,
    documentos: [],
    resumen: {
      total: p.documentos.length,
      vigentes: p.documentos.filter((d) => d.status === "validated").length,
      porVencer: 0,
      vencidos: 0,
      pendientes: p.documentos.filter((d) => d.status !== "validated").length,
    },
  }));

  return NextResponse.json({
    success: true,
    data: {
      grupos: [
        {
          installation: { id: "demo-installation", name: "Instalación Demo" },
          guardias: demoGuardias,
          resumen: {
            total: demoGuardias.length,
            os10Vigente: demoGuardias.filter((g) => g.os10Estado === "vigente")
              .length,
            os10PorVencer: demoGuardias.filter(
              (g) => g.os10Estado === "por_vencer",
            ).length,
            os10Vencido: 0,
          },
        },
      ],
      resumen: {
        totalGuardias: demoGuardias.length,
        totalInstalaciones: 1,
        os10Vigente: demoGuardias.filter((g) => g.os10Estado === "vigente")
          .length,
        os10PorVencer: demoGuardias.filter(
          (g) => g.os10Estado === "por_vencer",
        ).length,
        os10Vencido: 0,
        docsPendientes: demoGuardias.reduce(
          (acc, g) => acc + g.resumen.pendientes,
          0,
        ),
        docsVencidos: 0,
      },
    },
  });
}
