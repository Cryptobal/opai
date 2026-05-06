import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { issueDteSchema } from "@/lib/validations/finance";
import { issueDte } from "@/modules/finance/billing/dte-issuer.service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "20");

    const dtes = await prisma.financeDte.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: { lines: true },
    });

    const total = await prisma.financeDte.count({
      where: { tenantId: ctx.tenantId },
    });

    return NextResponse.json({
      success: true,
      data: {
        dtes,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("[Finance/Billing] Error listing DTEs:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar DTEs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_issue")) {
      return NextResponse.json(
        {
          success: false,
          error: "No tiene permiso para emitir facturas",
        },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, issueDteSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const result = await issueDte(ctx.tenantId, ctx.userId, body);

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing] Error issuing DTE:", error);
    // Propagar el mensaje del servicio (no enmascarar) para que el cliente
    // pueda mostrar la causa real (ej: "Falta CAF tipo 33", "SimpleAPI HTTP 401",
    // "Certificado expirado", etc).
    const message =
      error instanceof Error ? error.message : "Error al emitir DTE";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
