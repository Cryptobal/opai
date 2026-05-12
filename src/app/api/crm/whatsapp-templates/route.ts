/**
 * API Route: /api/crm/whatsapp-templates
 * GET  - Lista plantillas WhatsApp del tenant por slug conocido (merge con defaults)
 * POST - Upsert cuerpo en docs.DocTemplate (module whatsapp, usageSlug)
 */

import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { WA_TEMPLATE_DEFAULTS } from "@/lib/wa-template-defaults";
import { plainTextToTiptapJson } from "@/lib/docs/wa-template-seeds";
import { extractTokenKeys, tiptapToPlainText } from "@/lib/docs/token-resolver";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const slugs = Object.keys(WA_TEMPLATE_DEFAULTS);

    const templates = await prisma.docTemplate.findMany({
      where: {
        tenantId: ctx.tenantId,
        module: "whatsapp",
        usageSlug: { in: slugs },
      },
      orderBy: { usageSlug: "asc" },
    });

    const bySlug = new Map(
      templates.filter((t): t is typeof t & { usageSlug: string } => Boolean(t.usageSlug)).map((t) => [
        t.usageSlug,
        t,
      ]),
    );

    const merged = slugs.map((slug) => {
      const saved = bySlug.get(slug);
      const def = WA_TEMPLATE_DEFAULTS[slug]!;
      let body = def.body;
      if (saved?.content != null) {
        const plain = tiptapToPlainText(saved.content).trim();
        if (plain.length > 0) body = plain;
      }
      return {
        slug,
        name: def.name,
        body,
        isActive: saved?.isActive ?? true,
        tokens: def.tokens,
        saved: Boolean(saved),
      };
    });

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    console.error("Error fetching WhatsApp templates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch templates" },
      { status: 500 },
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

    if (!body?.slug || typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json(
        { success: false, error: "Slug y body son requeridos" },
        { status: 400 },
      );
    }

    const def = WA_TEMPLATE_DEFAULTS[body.slug as string];
    if (!def) {
      return NextResponse.json({ success: false, error: "Slug inválido" }, { status: 400 });
    }

    const trimmedBody = body.body.trim();
    const content = plainTextToTiptapJson(trimmedBody) as Prisma.InputJsonValue;
    const tokensUsed = extractTokenKeys(content as never) as unknown as Prisma.InputJsonValue;

    const template = await prisma.docTemplate.upsert({
      where: {
        tenantId_usageSlug: {
          tenantId: ctx.tenantId,
          usageSlug: body.slug,
        },
      },
      update: {
        name: def.name,
        content,
        tokensUsed,
        isActive: body.isActive ?? true,
      },
      create: {
        tenantId: ctx.tenantId,
        module: "whatsapp",
        category: "general",
        usageSlug: body.slug,
        name: def.name,
        content,
        tokensUsed,
        isActive: body.isActive ?? true,
        isDefault: false,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: template.id,
        slug: template.usageSlug,
        name: template.name,
        body: trimmedBody,
        isActive: template.isActive,
      },
    });
  } catch (error) {
    console.error("Error saving WhatsApp template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save template" },
      { status: 500 },
    );
  }
}
