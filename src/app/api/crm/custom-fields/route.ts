/**
 * API Route: /api/crm/custom-fields
 * GET  - Listar campos personalizados
 * POST - Crear campo personalizado
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";

function parseFieldOptions(
  type: string,
  options: unknown,
  urlLabel?: string
): Prisma.JsonValue | null {
  if (type === "select" || type === "select_multiple") {
    if (Array.isArray(options)) return options;
    if (typeof options === "string") {
      return options
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return null;
  }
  if (type === "url" && urlLabel?.trim()) {
    return { urlLabel: urlLabel.trim() };
  }
  return null;
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const fields = await prisma.crmCustomField.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: fields });
  } catch (error) {
    console.error("Error fetching CRM custom fields:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch custom fields" },
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

    if (!body?.name?.trim() || !body?.entityType?.trim() || !body?.type?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre, entidad y tipo son requeridos" },
        { status: 400 }
      );
    }

    const options = parseFieldOptions(body.type, body.options, body.urlLabel);
    const field = await prisma.crmCustomField.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name.trim(),
        entityType: body.entityType.trim(),
        type: body.type.trim(),
        ...(options !== null && { options }),
      },
    });

    return NextResponse.json({ success: true, data: field }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM custom field:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create custom field" },
      { status: 500 }
    );
  }
}
