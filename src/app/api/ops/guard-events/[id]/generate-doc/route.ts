import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { resolveDocument, buildGuardiaEntityData, buildLaborEventEntityData, buildEmpresaEntityData } from "@/lib/docs/token-resolver";

/**
 * POST /api/ops/guard-events/[id]/generate-doc — Generate document from template
 * Body: { templateId: string }
 *
 * Flow:
 * 1. Load event + guard data
 * 2. Load template
 * 3. Resolve tokens (guardia.*, labor_event.*, system.*)
 * 4. Create Document + DocAssociation
 * 5. Return generated document metadata
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    if (!body.templateId) {
      return NextResponse.json(
        { success: false, error: "templateId es requerido" },
        { status: 400 },
      );
    }

    // 1. Load guard event
    const event = await prisma.opsGuardEvent.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!event) {
      return NextResponse.json(
        { success: false, error: "Evento no encontrado" },
        { status: 404 },
      );
    }

    // 2. Load guard + persona + installation + bank + active assignment with cargo
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: event.guardiaId, tenantId: ctx.tenantId },
      include: {
        persona: true,
        currentInstallation: { select: { name: true } },
        bankAccounts: { where: { isDefault: true }, take: 1 },
        asignaciones: {
          where: { isActive: true },
          include: {
            puesto: {
              include: { cargo: { select: { name: true } } },
            },
          },
          take: 1,
          orderBy: { startDate: "desc" },
        },
      },
    });
    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    // 3. Load template
    const template = await prisma.docTemplate.findFirst({
      where: { id: body.templateId, tenantId: ctx.tenantId, isActive: true },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template no encontrado" },
        { status: 404 },
      );
    }

    // 4. Load empresa settings (nuevo formato empresa:tenantId:empresa.xxx o antiguo empresa.xxx)
    let rawEmpresa = await prisma.setting.findMany({
      where: { tenantId: ctx.tenantId, key: { startsWith: `empresa:${ctx.tenantId}:` } },
    });
    if (rawEmpresa.length === 0) {
      rawEmpresa = await prisma.setting.findMany({
        where: { tenantId: ctx.tenantId, key: { startsWith: "empresa." } },
      });
    }
    const empresaSettings = rawEmpresa.map((s) => ({
      key: s.key.includes(":") ? s.key.replace(`empresa:${ctx.tenantId}:`, "") : s.key,
      value: s.value,
    }));
    const empresaData = buildEmpresaEntityData(empresaSettings);

    // 5. Build guard data with cargo from assignment
    const activeAssignment = (guardia as any).asignaciones?.[0];
    const cargoName = activeAssignment?.puesto?.cargo?.name ?? "Guardia de Seguridad";

    const guardiaData = buildGuardiaEntityData(guardia as any);
    guardiaData.cargo = cargoName;

    const laborEventData = buildLaborEventEntityData(event as any);

    const { resolvedContent, tokenValues } = resolveDocument(template.content, {
      empresa: empresaData,
      guardia: guardiaData,
      labor_event: laborEventData,
    });

    // 5. Create Document
    const document = await prisma.document.create({
      data: {
        tenantId: ctx.tenantId,
        templateId: template.id,
        title: `${template.name} — ${guardia.persona.firstName} ${guardia.persona.lastName}`,
        content: resolvedContent,
        tokenValues,
        module: template.module,
        category: template.category,
        status: "draft",
        createdBy: ctx.userId,
      },
    });

    // 6. Create associations: link to guard and event
    await prisma.docAssociation.create({
      data: {
        documentId: document.id,
        entityType: "ops_guardia",
        entityId: guardia.id,
        role: "primary",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        documentId: document.id,
        title: document.title,
        module: document.module,
        category: document.category,
        status: document.status,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    console.error("[OPS] Error generating document for guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo generar el documento" },
      { status: 500 },
    );
  }
}
