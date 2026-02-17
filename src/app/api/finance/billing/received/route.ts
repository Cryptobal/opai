import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { registerReceivedDteSchema } from "@/lib/validations/finance";
import {
  listReceivedDtes,
  registerReceivedDte,
} from "@/modules/finance/billing/dte-received.service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "50");
    const supplierId = url.searchParams.get("supplierId") || undefined;

    const result = await listReceivedDtes(ctx.tenantId, {
      page,
      pageSize,
      supplierId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Billing/Received] Error listing received DTEs:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar DTEs recibidos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, registerReceivedDteSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const result = await registerReceivedDte(ctx.tenantId, ctx.userId, body);

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing/Received] Error registering received DTE:", error);
    return NextResponse.json(
      { success: false, error: "Error al registrar DTE recibido" },
      { status: 500 }
    );
  }
}
