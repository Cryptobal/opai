import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type Params = { id: string };

const updateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().min(10).max(4000).optional(),
  aiPromptHint: z.string().max(2000).optional().nullable(),
  isEnabled: z.boolean().optional(),
  iconName: z.string().max(80).optional().nullable(),
  numberingOverride: z.string().max(20).optional().nullable(),
});

/**
 * PUT /api/vra/section-templates/[id]
 * Edita título, descripción, prompt-hint, isEnabled, ícono o numbering override.
 * outputType, dataInputs, key, isSystem y isMandatory NO son editables (rigidez del catálogo).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const parsed = await parseBody(request, updateSchema);
    if (parsed.error) return parsed.error;
    const data = parsed.data;

    const existing = await prisma.vraSectionTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Sección no encontrada" },
        { status: 404 },
      );
    }

    if (data.isEnabled === false && existing.isMandatory) {
      return NextResponse.json(
        { success: false, error: "No se puede desactivar una sección obligatoria" },
        { status: 400 },
      );
    }

    const updated = await prisma.vraSectionTemplate.update({
      where: { id },
      data: {
        title: data.title ?? undefined,
        description: data.description ?? undefined,
        aiPromptHint: data.aiPromptHint === undefined ? undefined : data.aiPromptHint,
        isEnabled: data.isEnabled ?? undefined,
        iconName: data.iconName === undefined ? undefined : data.iconName,
        numberingOverride:
          data.numberingOverride === undefined ? undefined : data.numberingOverride,
      },
    });

    return NextResponse.json({ success: true, template: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] update error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/vra/section-templates/[id]
 * Solo borra secciones custom del tenant. Las clonadas del system NO se borran (se desactivan).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const existing = await prisma.vraSectionTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Sección no encontrada" },
        { status: 404 },
      );
    }

    if (existing.parentId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Esta sección viene del catálogo base. Puedes desactivarla pero no eliminarla.",
        },
        { status: 400 },
      );
    }

    await prisma.vraSectionTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] delete error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
