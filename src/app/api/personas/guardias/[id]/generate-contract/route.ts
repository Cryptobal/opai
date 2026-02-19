import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsCapability } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { resolveDocument, buildGuardiaEntityData, buildEmpresaEntityData, enrichGuardiaWithSalary } from "@/lib/docs/token-resolver";

type Params = { id: string };

/**
 * POST /api/personas/guardias/[id]/generate-contract
 * Body: { type: "contrato_laboral" | "anexo_contrato", templateId?: string }
 *
 * Generates a contract document from a template with guard data auto-resolved.
 * If no templateId provided, uses the default template for the category.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "guardias_manage");
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    const docType = body.type ?? "contrato_laboral";

    // Load guard with all relations needed for token resolution
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        persona: true,
        currentInstallation: { select: { name: true, address: true, commune: true, city: true } },
        bankAccounts: { where: { isDefault: true }, take: 1 },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }

    // Find template
    let template;
    if (body.templateId) {
      template = await prisma.docTemplate.findFirst({
        where: { id: body.templateId, tenantId: ctx.tenantId, isActive: true },
      });
    } else {
      template = await prisma.docTemplate.findFirst({
        where: {
          tenantId: ctx.tenantId,
          module: "payroll",
          category: docType,
          isActive: true,
          isDefault: true,
        },
      });
      // Fallback: any active template of this category
      if (!template) {
        template = await prisma.docTemplate.findFirst({
          where: {
            tenantId: ctx.tenantId,
            module: "payroll",
            category: docType,
            isActive: true,
          },
        });
      }
    }

    if (!template) {
      return NextResponse.json(
        {
          success: false,
          error: `No se encontró un template de ${docType === "contrato_laboral" ? "contrato de trabajo" : "anexo de contrato"}. Crea uno en Documentos > Templates.`,
        },
        { status: 404 }
      );
    }

    // Load empresa settings (nuevo formato empresa:tenantId:empresa.xxx o antiguo empresa.xxx)
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

    const activeAssignment = await prisma.opsAsignacionGuardia.findFirst({
      where: { guardiaId: guardia.id, isActive: true },
      include: { puesto: { include: { cargo: { select: { name: true } } } } },
      orderBy: { startDate: "desc" },
    });

    let guardiaData = buildGuardiaEntityData(guardia as any);
    guardiaData.cargo = activeAssignment?.puesto?.cargo?.name ?? "Guardia de Seguridad";
    guardiaData = await enrichGuardiaWithSalary(guardiaData, guardia.id);

    const { resolvedContent, tokenValues } = resolveDocument(template.content, {
      empresa: empresaData,
      guardia: guardiaData,
    });

    // Create document
    const document = await prisma.document.create({
      data: {
        tenantId: ctx.tenantId,
        templateId: template.id,
        title: `${template.name} — ${guardia.persona.firstName} ${guardia.persona.lastName}`,
        content: resolvedContent,
        tokenValues,
        module: "payroll",
        category: docType,
        status: "draft",
        createdBy: ctx.userId,
      },
    });

    // Link document to guard
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
        uniqueId: document.uniqueId,
      },
    });
  } catch (error) {
    console.error("[PERSONAS] Error generating contract:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo generar el contrato" },
      { status: 500 }
    );
  }
}
