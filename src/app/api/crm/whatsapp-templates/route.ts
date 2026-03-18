/**
 * API Route: /api/crm/whatsapp-templates
 * GET  - Obtener todas las plantillas de WhatsApp del tenant
 * POST - Crear o actualizar plantillas (upsert por slug)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { WA_TEMPLATE_DEFAULTS } from "@/lib/wa-template-defaults";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const templates = await prisma.crmWhatsAppTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { slug: "asc" },
    });

    // Merge with defaults (show all slugs, even if not yet saved)
    const slugs = Object.keys(WA_TEMPLATE_DEFAULTS);
    const merged = slugs.map((slug) => {
      const saved = templates.find((t) => t.slug === slug);
      const def = WA_TEMPLATE_DEFAULTS[slug];
      return {
        slug,
        name: def.name,
        body: saved?.body ?? def.body,
        isActive: saved?.isActive ?? true,
        tokens: def.tokens,
        saved: !!saved,
      };
    });

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    console.error("Error fetching WhatsApp templates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    if (!body?.slug || !body?.body?.trim()) {
      return NextResponse.json(
        { success: false, error: "Slug y body son requeridos" },
        { status: 400 }
      );
    }

    const def = WA_TEMPLATE_DEFAULTS[body.slug as string];
    if (!def) {
      return NextResponse.json(
        { success: false, error: "Slug inválido" },
        { status: 400 }
      );
    }

    const template = await prisma.crmWhatsAppTemplate.upsert({
      where: {
        tenantId_slug: {
          tenantId: ctx.tenantId,
          slug: body.slug,
        },
      },
      update: {
        body: body.body.trim(),
        isActive: body.isActive ?? true,
      },
      create: {
        tenantId: ctx.tenantId,
        slug: body.slug,
        name: def.name,
        body: body.body.trim(),
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error("Error saving WhatsApp template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save template" },
      { status: 500 }
    );
  }
}
