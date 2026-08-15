import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit, requireCpqView } from "@/lib/api-auth-cpq";
import {
  ensureFixedSectionsSeeded,
  getFixedSectionByKey,
  listFixedSections,
  saveFixedSectionAsNew,
  upsertFixedSection,
} from "@/lib/cpq/fixed-sections";
import { requireTenantModule } from "@/lib/require-module";

const keySchema = z.string().trim().min(1).max(80);
const titleSchema = z.string().trim().min(1, "El título es obligatorio").max(200);
const contentSchema = z.string().max(200_000);
const sortOrderSchema = z.number().int().min(0).max(100_000);

const upsertSchema = z.object({
  key: keySchema,
  title: titleSchema,
  content: contentSchema,
  sortOrder: sortOrderSchema.optional(),
  isActive: z.boolean().optional(),
});

const patchSchema = z
  .object({
    key: keySchema,
    title: titleSchema.optional(),
    content: contentSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.sortOrder !== undefined ||
      value.isActive !== undefined,
    "No hay cambios para guardar",
  );

const createSchema = z.object({
  key: keySchema.optional(),
  title: titleSchema,
  content: contentSchema.default(""),
});

function validationError(error: z.ZodError) {
  return NextResponse.json(
    {
      success: false,
      error: error.issues[0]?.message ?? "Datos inválidos",
    },
    { status: 400 },
  );
}

export async function GET() {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    await ensureFixedSectionsSeeded(ctx.tenantId);
    const sections = await listFixedSections(ctx.tenantId);
    return NextResponse.json({ success: true, data: sections });
  } catch (error) {
    console.error("Error fetching CPQ fixed sections:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar las secciones fijas" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const section = await saveFixedSectionAsNew(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: section }, { status: 201 });
  } catch (error) {
    console.error("Error creating CPQ fixed section:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear la sección fija" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const parsed = upsertSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const section = await upsertFixedSection(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: section });
  } catch (error) {
    console.error("Error upserting CPQ fixed section:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo guardar la sección fija" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const current = await getFixedSectionByKey(ctx.tenantId, parsed.data.key);
    if (!current) {
      return NextResponse.json(
        { success: false, error: "Sección fija no encontrada" },
        { status: 404 },
      );
    }

    const section = await upsertFixedSection(ctx.tenantId, {
      key: current.key,
      title: parsed.data.title ?? current.title,
      content: parsed.data.content ?? current.content,
      sortOrder: parsed.data.sortOrder ?? current.sortOrder,
      isActive: parsed.data.isActive ?? current.isActive,
    });
    return NextResponse.json({ success: true, data: section });
  } catch (error) {
    console.error("Error updating CPQ fixed section:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la sección fija" },
      { status: 500 },
    );
  }
}
