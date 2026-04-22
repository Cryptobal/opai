/**
 * GET /api/portal/cliente/instalaciones/[id]/docs-fisicos
 *
 * Checklist de documentación física de UNA instalación (PR4).
 *
 * Para cada tipo de documento operacional `capa in ("global","instalacion")`
 * activo, devuelve:
 *   - la última `DocVerificacionFisica` (presente/ausente + fecha + foto + nota).
 *   - si aún no fue verificado, `verificacion: null` → UI marca "sin verificar".
 *
 * Decisiones de producto (cliente):
 *   - NO se exponen `hallazgos` ni `tickets` ligados a la verificación —
 *     esos son flujos operativos internos.
 *   - El supervisor se expone solo con su nombre (no email/id) para
 *     humanizar la información sin leakear PII innecesaria.
 *   - La instalación debe pertenecer al tenant+cuenta del contacto
 *     autenticado (defensa en profundidad).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth, ensureInstallationAccess } from "@/lib/portal-cliente";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: installationId } = await params;
    const ok = await ensureInstallationAccess(session, installationId);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    // 1. Tipos de documento relevantes para esta instalación (global + instalacion).
    const tipos = await prisma.tipoDocOperacional.findMany({
      where: {
        tenantId: session.tenantId,
        isActive: true,
        capa: { in: ["global", "instalacion"] },
      },
      orderBy: [{ capa: "asc" }, { order: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        codigo: true,
        nombre: true,
        descripcion: true,
        capa: true,
        obligatorio: true,
        normativa: true,
      },
    });

    if (tipos.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          items: [],
          resumen: { total: 0, presentes: 0, ausentes: 0, sinVerificar: 0 },
        },
      });
    }

    const tipoIds = tipos.map((t) => t.id);

    // 2. Última verificación física por (tipoDocId, installationId).
    //    `distinct` + `orderBy createdAt desc` = la más reciente por tipo.
    const verificaciones = await prisma.docVerificacionFisica.findMany({
      where: {
        tenantId: session.tenantId,
        installationId,
        tipoDocId: { in: tipoIds },
        capa: { in: ["global", "instalacion"] },
      },
      orderBy: { createdAt: "desc" },
      distinct: ["tipoDocId"],
      select: {
        id: true,
        tipoDocId: true,
        presente: true,
        photoUrl: true,
        notes: true,
        createdAt: true,
        supervisor: { select: { name: true } },
      },
    });

    const verifByTipo = new Map(verificaciones.map((v) => [v.tipoDocId!, v]));

    let presentes = 0;
    let ausentes = 0;
    let sinVerificar = 0;

    const items = tipos.map((t) => {
      const v = verifByTipo.get(t.id);
      if (!v) {
        sinVerificar++;
        return {
          tipo: {
            id: t.id,
            codigo: t.codigo,
            nombre: t.nombre,
            descripcion: t.descripcion,
            capa: t.capa,
            obligatorio: t.obligatorio,
            normativa: t.normativa,
          },
          verificacion: null,
          estado: "sin_verificar" as const,
        };
      }
      if (v.presente) {
        presentes++;
      } else {
        ausentes++;
      }
      return {
        tipo: {
          id: t.id,
          codigo: t.codigo,
          nombre: t.nombre,
          descripcion: t.descripcion,
          capa: t.capa,
          obligatorio: t.obligatorio,
          normativa: t.normativa,
        },
        verificacion: {
          id: v.id,
          presente: v.presente,
          photoUrl: v.photoUrl,
          notes: v.notes,
          createdAt: v.createdAt.toISOString(),
          supervisorName: v.supervisor?.name ?? null,
        },
        estado: (v.presente ? "presente" : "ausente") as "presente" | "ausente",
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        items,
        resumen: {
          total: tipos.length,
          presentes,
          ausentes,
          sinVerificar,
        },
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] docs-fisicos error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
