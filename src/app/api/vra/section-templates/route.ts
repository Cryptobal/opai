import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureTenantCatalogSeeded } from "@/lib/vra/seed-tenant-catalog";

export const dynamic = "force-dynamic";

const OUTPUT_TYPES = [
  "narrative",
  "metadata_card",
  "risk_distribution",
  "vuln_cards",
  "risk_matrix",
  "heat_map",
  "recommendations",
  "roadmap",
  "photo_gallery",
  "norms_table",
  "glossary",
  "bulleted_list",
  "comparison_table",
  "site_description",
] as const;

/**
 * GET /api/vra/section-templates
 * Lista las secciones del tenant. Si está vacío, hace seed automático.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    let templates = await prisma.vraSectionTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { sortOrder: "asc" },
    });

    if (templates.length === 0) {
      await ensureTenantCatalogSeeded(ctx.tenantId, ctx.userId);
      templates = await prisma.vraSectionTemplate.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { sortOrder: "asc" },
      });
    }

    return NextResponse.json({ success: true, templates });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] list error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

const createSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/, "key debe ser snake_case (a-z 0-9 _)"),
  title: z.string().min(2).max(200),
  description: z.string().min(10).max(4000),
  aiPromptHint: z.string().max(2000).optional().nullable(),
  outputType: z.enum(OUTPUT_TYPES),
  dataInputs: z.array(z.string()).default([]),
  sortOrder: z.number().int().optional(),
  iconName: z.string().max(80).optional().nullable(),
});

/**
 * POST /api/vra/section-templates
 * Crea una sección custom del tenant.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, createSchema);
    if (parsed.error) return parsed.error;
    const data = parsed.data;

    const exists = await prisma.vraSectionTemplate.findFirst({
      where: { tenantId: ctx.tenantId, key: data.key },
    });
    if (exists) {
      return NextResponse.json(
        { success: false, error: "Ya existe una sección con esa clave" },
        { status: 409 },
      );
    }

    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const ANNEX_TYPES = ["photo_gallery", "norms_table", "glossary"];
      if (ANNEX_TYPES.includes(data.outputType)) {
        const lastAnnex = await prisma.vraSectionTemplate.findFirst({
          where: {
            tenantId: ctx.tenantId,
            outputType: { in: ANNEX_TYPES },
          },
          orderBy: { sortOrder: "desc" },
        });
        sortOrder = (lastAnnex?.sortOrder ?? 199) + 10;
      } else {
        const firstAnnex = await prisma.vraSectionTemplate.findFirst({
          where: {
            tenantId: ctx.tenantId,
            outputType: { in: ANNEX_TYPES },
          },
          orderBy: { sortOrder: "asc" },
        });
        const lastMain = await prisma.vraSectionTemplate.findFirst({
          where: {
            tenantId: ctx.tenantId,
            outputType: { notIn: ANNEX_TYPES },
          },
          orderBy: { sortOrder: "desc" },
        });
        sortOrder = (lastMain?.sortOrder ?? 100) + 10;
        if (firstAnnex && sortOrder >= firstAnnex.sortOrder) {
          sortOrder = firstAnnex.sortOrder - 5;
        }
      }
    }

    const created = await prisma.vraSectionTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        key: data.key,
        title: data.title,
        description: data.description,
        aiPromptHint: data.aiPromptHint ?? null,
        outputType: data.outputType,
        dataInputs: data.dataInputs,
        sortOrder,
        isEnabled: true,
        isSystem: false,
        isMandatory: false,
        iconName: data.iconName ?? null,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, template: created });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] create error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
