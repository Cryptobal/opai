/**
 * API Route: /api/crm/email-templates
 * GET  - Listar templates
 * POST - Crear template
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function GET() {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const templates = await prisma.crmEmailTemplate.findMany({
      where: { tenantId },
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();

    if (!body?.name?.trim() || !body?.subject?.trim() || !body?.body?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre, asunto y cuerpo son requeridos" },
        { status: 400 }
      );
    }

    const template = await prisma.crmEmailTemplate.create({
      data: {
        tenantId,
        name: body.name.trim(),
        subject: body.subject.trim(),
        body: body.body.trim(),
        scope: body?.scope?.trim() || "global",
        stageId: body?.stageId || null,
        createdBy: session.user.id,
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
