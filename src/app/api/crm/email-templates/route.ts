/**
 * API Route: /api/crm/email-templates
 * GET  - Listar templates
 * POST - Crear template
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const templates = await prisma.crmEmailTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error("Error fetching CRM email templates:", error);
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

    if (!body?.name?.trim() || !body?.subject?.trim() || !body?.body?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre, asunto y cuerpo son requeridos" },
        { status: 400 }
      );
    }

    const template = await prisma.crmEmailTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name.trim(),
        subject: body.subject.trim(),
        body: body.body.trim(),
        scope: body?.scope?.trim() || "global",
        stageId: body?.stageId || null,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM email template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create template" },
      { status: 500 }
    );
  }
}
