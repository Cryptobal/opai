/**
 * GET /api/portal/cliente/docs-operacionales
 * Documentos operacionales consolidados para las instalaciones del cliente.
 * Solo muestra documentos con portalClienteVisible = true.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { calcDocStatus, GUARDIA_TIPO_MAP } from "@/lib/docs-operacionales";
import { getPostulacionDocumentTypes } from "@/lib/postulacion-documentos";
import { buildDocLabelMap, getDocLabel } from "@/lib/personas";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { tenantId, accountId } = session;

    // Get active installations for this account
    const installations = await prisma.crmInstallation.findMany({
      where: { tenantId, accountId, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (installations.length === 0) {
      return NextResponse.json({
        success: true,
        data: { instalaciones: [] },
      });
    }

    const installationIds = installations.map((i) => i.id);

    // Build label map from config for consistent naming
    const postulacionDocs = await getPostulacionDocumentTypes(tenantId);
    const docLabelMap = buildDocLabelMap(postulacionDocs);

    // Get tipos for reference
    const tipos = await prisma.tipoDocOperacional.findMany({
      where: { tenantId, isActive: true },
      orderBy: { order: "asc" },
    });
    const tiposGuardia = tipos.filter((t) => t.capa === "guardia");

    // Get global docs (visible in portal)
    const globales = await prisma.docOperacional.findMany({
      where: { tenantId, capa: "global", portalClienteVisible: true },
      include: { tipo: { select: { nombre: true, normativa: true, order: true } } },
      orderBy: { tipo: { order: "asc" } },
    });

    // Get installation docs
    const instDocs = await prisma.docOperacional.findMany({
      where: { tenantId, capa: "instalacion", installationId: { in: installationIds }, portalClienteVisible: true },
      include: { tipo: { select: { nombre: true, normativa: true, order: true } } },
      orderBy: { tipo: { order: "asc" } },
    });

    // Get guard assignments for these installations
    const asignaciones = await prisma.opsAsignacionGuardia.findMany({
      where: { installationId: { in: installationIds }, isActive: true },
      include: {
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true, rut: true } },
            documents: {
              where: { portalVisible: true },
              select: { type: true, status: true, expiresAt: true },
            },
          },
        },
      },
    });

    // Build per-installation view
    const instalaciones = installations.map((inst) => {
      const instDocsForInst = instDocs.filter((d) => d.installationId === inst.id);
      const instAsig = asignaciones.filter((a) => a.installationId === inst.id);

      const guardiasData = instAsig.map((a) => {
        const g = a.guardia;
        const documentos = tiposGuardia.filter((t) => t.obligatorio).map((tipo) => {
          const mappedTypes = GUARDIA_TIPO_MAP[tipo.codigo] ?? [tipo.codigo];
          const found = g.documents.find((d) => mappedTypes.includes(d.type));
          // Usar label del config si existe para el primer personaType mapeado
          const configLabel = getDocLabel(mappedTypes[0] ?? tipo.codigo, docLabelMap);
          return {
            tipo: configLabel !== (mappedTypes[0] ?? tipo.codigo) ? configLabel : tipo.nombre,
            status: found ? calcDocStatus(found.expiresAt, tipo.tieneVencimiento, tipo.diasAlerta) : "sin_documento",
            expiresAt: found?.expiresAt?.toISOString().slice(0, 10) ?? null,
          };
        });

        return {
          nombre: `${g.persona.lastName} ${g.persona.firstName}`.trim(),
          rut: g.persona.rut,
          documentos,
        };
      });

      // Calculate cumplimiento
      const tiposGlobalObl = tipos.filter((t) => t.capa === "global" && t.obligatorio);
      const tiposInstObl = tipos.filter((t) => t.capa === "instalacion" && t.obligatorio);

      const globalVig = tiposGlobalObl.filter((t) => {
        const doc = globales.find((d) => d.tipoId === t.id);
        return doc && (doc.status === "vigente" || doc.status === "no_aplica");
      }).length;

      const instVig = tiposInstObl.filter((t) => {
        const doc = instDocsForInst.find((d) => d.tipoId === t.id);
        return doc && (doc.status === "vigente" || doc.status === "no_aplica");
      }).length;

      const guardiaVig = guardiasData.reduce(
        (sum, g) => sum + g.documentos.filter((d) => d.status === "vigente" || d.status === "no_aplica").length,
        0
      );
      const guardiaTotal = guardiasData.reduce((sum, g) => sum + g.documentos.length, 0);

      const total = tiposGlobalObl.length + tiposInstObl.length + guardiaTotal;
      const vigentes = globalVig + instVig + guardiaVig;

      return {
        id: inst.id,
        nombre: inst.name,
        cumplimiento: {
          porcentaje: total > 0 ? Math.round((vigentes / total) * 100) : 100,
          total,
          vigentes,
        },
        documentos: {
          globales: globales.map((d) => ({
            tipo: d.tipo.nombre,
            status: d.status,
            expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null,
            fileUrl: d.fileUrl,
            fileName: d.fileName,
          })),
          instalacion: instDocsForInst.map((d) => ({
            tipo: d.tipo.nombre,
            status: d.status,
            expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null,
            fileUrl: d.fileUrl,
            fileName: d.fileName,
          })),
          guardias: guardiasData,
        },
      };
    });

    return NextResponse.json({ success: true, data: { instalaciones } });
  } catch (error) {
    console.error("[PORTAL-DOCS-OP] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener documentos operacionales" },
      { status: 500 }
    );
  }
}
