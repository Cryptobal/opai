import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import {
  buildOverview,
  type InstallationStatus,
} from "@/lib/protocols/knowledge-aggregator";

export const dynamic = "force-dynamic";

const VALID_STATUS: ReadonlyArray<InstallationStatus | "all"> = [
  "ok",
  "warning",
  "critical",
  "no_protocol",
  "no_evaluated",
  "all",
];

const VALID_ORDER = ["score_asc", "score_desc", "name", "lastExam"] as const;

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "guardias")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver Conocimiento" },
        { status: 403 },
      );
    }

    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const statusRaw = request.nextUrl.searchParams.get("status") ?? undefined;
    const orderRaw = request.nextUrl.searchParams.get("order") ?? undefined;

    const status =
      statusRaw && VALID_STATUS.includes(statusRaw as InstallationStatus | "all")
        ? (statusRaw as InstallationStatus | "all")
        : undefined;
    const order =
      orderRaw && (VALID_ORDER as readonly string[]).includes(orderRaw)
        ? (orderRaw as (typeof VALID_ORDER)[number])
        : undefined;

    const data = await buildOverview(ctx.tenantId, {
      search: search ?? undefined,
      status,
      order,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[knowledge/overview]", err);
    return NextResponse.json(
      { success: false, error: "Error obteniendo el overview" },
      { status: 500 },
    );
  }
}
