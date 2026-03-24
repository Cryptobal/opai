import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    // Docs operacionales with problems
    const docsProblemas = await prisma.docOperacional.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["por_vencer", "vencido"] },
      },
      include: {
        tipo: { select: { nombre: true, capa: true, codigo: true } },
        installation: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "desc" }, { expiresAt: "asc" }],
    });

    // Persona docs vencidos
    const personaDocsVencidos = await prisma.opsDocumentoPersona.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "vencido",
      },
      include: {
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
      },
      orderBy: { expiresAt: "asc" },
      take: 50,
    });

    // Count obligatory tipos without documents (global layer)
    const tiposGlobalObligatorios = await prisma.tipoDocOperacional.findMany({
      where: { tenantId: ctx.tenantId, capa: "global", obligatorio: true, isActive: true },
      select: { id: true, nombre: true },
    });
    const docsGlobales = await prisma.docOperacional.findMany({
      where: { tenantId: ctx.tenantId, capa: "global" },
      select: { tipoId: true },
    });
    const tiposConDoc = new Set(docsGlobales.map((d) => d.tipoId));
    const tiposFaltantes = tiposGlobalObligatorios.filter((t) => !tiposConDoc.has(t.id));

    const alertas = [
      ...docsProblemas.map((d) => ({
        tipo: "doc_operacional" as const,
        nivel: d.status === "vencido" ? "vencido" : "por_vencer",
        documento: d.tipo.nombre,
        capa: d.tipo.capa,
        instalacion: d.installation?.name ?? null,
        expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null,
        id: d.id,
      })),
      ...personaDocsVencidos.map((d) => ({
        tipo: "doc_persona" as const,
        nivel: "vencido",
        documento: d.type,
        capa: "guardia",
        guardia: `${d.guardia.persona.lastName} ${d.guardia.persona.firstName}`,
        guardiaId: d.guardiaId,
        expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null,
        id: d.id,
      })),
      ...tiposFaltantes.map((t) => ({
        tipo: "faltante" as const,
        nivel: "sin_documento",
        documento: t.nombre,
        capa: "global",
        id: t.id,
      })),
    ];

    return NextResponse.json({
      success: true,
      data: {
        alertas,
        resumen: {
          vencidos: docsProblemas.filter((d) => d.status === "vencido").length + personaDocsVencidos.length,
          porVencer: docsProblemas.filter((d) => d.status === "por_vencer").length,
          faltantes: tiposFaltantes.length,
        },
      },
    });
  } catch (error) {
    console.error("[ALERTAS-DOCS] Error:", error);
    return NextResponse.json({ success: false, error: "Error al obtener alertas" }, { status: 500 });
  }
}
