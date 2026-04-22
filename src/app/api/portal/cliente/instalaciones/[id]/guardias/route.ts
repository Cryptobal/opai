/**
 * GET /api/portal/cliente/instalaciones/[id]/guardias
 *
 * Devuelve el equipo de guardias ACTIVOS asignados a UNA instalación del cliente
 * junto con el estado cliente-friendly de su documentación.
 *
 * Seguridad / privacidad (PR7):
 *  - `requirePortalClienteAuth(request)` con anti-spoofing.
 *  - `ensureInstallationAccess` + validación `tenantId` en todas las queries.
 *  - Se expone SOLO: nombre, iniciales, fecha de contratación, estado de
 *    OS-10 y documentos visibles en portal.
 *  - NO se expone: RUT, email, teléfono, PIN, faceIdPhotoUrl, sueldo,
 *    direcciones, información médica ni nada marcado como internal.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalClienteAuth,
  ensureInstallationAccess,
  sanitizeGuardName,
} from "@/lib/portal-cliente";
import {
  computeDocEstado,
  computeOs10Estado,
  type DocEstado,
} from "@/lib/portal-cliente-guardia-doc-estado";

interface GuardiaOut {
  id: string;
  nombre: string;
  iniciales: string;
  hiredAt: string | null;
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

    const guardias = await prisma.opsGuardia.findMany({
      where: {
        tenantId: session.tenantId,
        currentInstallationId: installationId,
        status: "active",
      },
      select: {
        id: true,
        hiredAt: true,
        os10: true,
        os10ExpiresAt: true,
        persona: { select: { firstName: true, lastName: true } },
        documents: {
          where: {
            portalVisible: true,
            OR: [{ folderId: null }, { folder: { portalVisible: true } }],
          },
          select: {
            type: true,
            status: true,
            expiresAt: true,
            fileUrl: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ hiredAt: "asc" }, { id: "asc" }],
    });

    const now = new Date();

    const mapped: GuardiaOut[] = guardias.map((g) => {
      const first = g.persona.firstName ?? "";
      const last = g.persona.lastName ?? "";
      const nombre = sanitizeGuardName(first, last) || "Guardia";
      const iniciales =
        (first[0] || "").toUpperCase() + (last[0] || "").toUpperCase() || "G";

      const documentos = g.documents.map((d) => {
        const estado = computeDocEstado({
          status: d.status,
          expiresAt: d.expiresAt,
          now,
        });
        return {
          tipo: d.type,
          estado,
          expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
          fileUrl: d.fileUrl ?? null,
        };
      });

      const docResumen = {
        total: documentos.length,
        vigentes: documentos.filter(
          (d) => d.estado === "vigente" || d.estado === "no_aplica"
        ).length,
        porVencer: documentos.filter((d) => d.estado === "por_vencer").length,
        vencidos: documentos.filter((d) => d.estado === "vencido").length,
        pendientes: documentos.filter((d) => d.estado === "pendiente").length,
      };

      return {
        id: g.id,
        nombre,
        iniciales,
        hiredAt: g.hiredAt ? g.hiredAt.toISOString() : null,
        os10Estado: computeOs10Estado({
          os10: g.os10,
          os10ExpiresAt: g.os10ExpiresAt,
          now,
        }),
        os10ExpiresAt: g.os10ExpiresAt ? g.os10ExpiresAt.toISOString() : null,
        documentos,
        resumen: docResumen,
      };
    });

    // Resumen global del equipo para KPIs rápidos.
    const resumen = {
      totalGuardias: mapped.length,
      os10Vigente: mapped.filter((g) => g.os10Estado === "vigente").length,
      os10PorVencer: mapped.filter((g) => g.os10Estado === "por_vencer").length,
      os10Vencido: mapped.filter(
        (g) => g.os10Estado === "vencido" || g.os10Estado === "pendiente"
      ).length,
    };

    return NextResponse.json({
      success: true,
      data: { guardias: mapped, resumen },
    });
  } catch (error) {
    console.error("[Portal Cliente] guardias instalación error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
