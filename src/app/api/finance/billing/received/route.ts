import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
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
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const requestedPageSize = parseInt(
      url.searchParams.get("pageSize") || "50"
    );
    // Cap defensivo (ver issued/route.ts).
    const pageSize = Math.min(
      Math.max(1, Number.isFinite(requestedPageSize) ? requestedPageSize : 50),
      500
    );
    const supplierId = url.searchParams.get("supplierId") || undefined;
    const periodo = url.searchParams.get("periodo") || undefined;
    const accountId = url.searchParams.get("accountId") || undefined;
    const installationId = url.searchParams.get("installationId") || undefined;
    const sort = url.searchParams.get("sort") || undefined;
    const search = url.searchParams.get("search") || undefined;

    const csv = (k: string) =>
      (url.searchParams.get(k) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const paymentStatuses = csv("paymentStatus");
    const dteTypes = csv("dteType")
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    const receptionStatuses = csv("receptionStatus");
    const amountMinRaw = url.searchParams.get("amountMin");
    const amountMaxRaw = url.searchParams.get("amountMax");
    const amountMin = amountMinRaw != null ? Number(amountMinRaw) : undefined;
    const amountMax = amountMaxRaw != null ? Number(amountMaxRaw) : undefined;

    const result = await listReceivedDtes(ctx.tenantId, {
      page,
      pageSize,
      supplierId,
      accountId,
      installationId,
      sort,
      periodo,
      search,
      paymentStatuses,
      dteTypes,
      receptionStatuses,
      amountMin: Number.isFinite(amountMin) ? amountMin : undefined,
      amountMax: Number.isFinite(amountMax) ? amountMax : undefined,
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
    // Registrar un DTE recibido manualmente NO emite al SII; es un registro
    // local que luego entra al control de pagos. Por eso usa la capability
    // `facturacion_create_draft`, no `facturacion_issue`.
    if (!hasFacturacionCapability(perms, "facturacion_create_draft")) {
      return NextResponse.json(
        {
          success: false,
          error: "No tiene permiso para registrar DTEs recibidos",
        },
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
