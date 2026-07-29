/**
 * API Route: /api/crm/signatures
 * GET  - Listar firmas del tenant (opcionalmente filtrar por userId)
 * POST - Crear firma estructurada (htmlContent derivado en servidor)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { parseSignatureData } from "@/modules/crm/email/signature-data";
import { renderSignatureHtml } from "@/modules/crm/email/signature-render";

export async function GET(request: NextRequest) {
  try {
    const mod = await requireCorreosAccess("view");
    if (!mod.authorized) return mod.response;
    const { ctx } = mod;

    const { searchParams } = new URL(request.url);
    const onlyMine = searchParams.get("mine") === "true";

    const signatures = await prisma.crmEmailSignature.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        ...(onlyMine ? { userId: ctx.userId } : {}),
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: signatures });
  } catch (error) {
    console.error("Error fetching signatures:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch signatures" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const mod = await requireCorreosAccess("edit");
    if (!mod.authorized) return mod.response;
    const { ctx } = mod;

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      isDefault?: unknown;
      scope?: unknown;
      data?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { success: false, error: "El nombre es obligatorio" },
        { status: 400 },
      );
    }

    const scope = body.scope === "tenant" ? "tenant" : "user";
    const perms = await resolveApiPerms(ctx);
    if (scope === "tenant" && !canEdit(perms, "config")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para editar firmas de la empresa" },
        { status: 403 },
      );
    }

    const data = parseSignatureData(body.data, process.env.R2_PUBLIC_URL);
    if (!data.fullName) {
      return NextResponse.json(
        { success: false, error: "El nombre completo es obligatorio" },
        { status: 400 },
      );
    }

    const htmlContent = renderSignatureHtml(data);
    const userId = scope === "user" ? ctx.userId : null;
    const isDefault = Boolean(body.isDefault);

    if (isDefault) {
      await prisma.crmEmailSignature.updateMany({
        where: {
          tenantId: ctx.tenantId,
          userId,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const signature = await prisma.crmEmailSignature.create({
      data: {
        tenantId: ctx.tenantId,
        userId,
        name,
        content: data,
        htmlContent,
        isDefault,
      },
    });

    await logAudit({
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "CREATE",
      entity: "CrmEmailSignature",
      entityId: signature.id,
      tenantId: ctx.tenantId,
      details: { scope, signatureId: signature.id, isDefault },
      request,
    });

    return NextResponse.json({ success: true, data: signature }, { status: 201 });
  } catch (error) {
    console.error("Error creating signature:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create signature" },
      { status: 500 },
    );
  }
}
