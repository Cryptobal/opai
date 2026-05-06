/**
 * GET /api/finance/factoring/operations — listado paginado de cesiones.
 *
 * Query params:
 *   periodo=YYYY-MM
 *   factoringCompanyId=uuid
 *   status=SUBMITTED,APPROVED   (CSV)
 *   page=1&pageSize=20
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { listFactoringOperations } from "@/modules/finance/factoring/operations.service";
import type { FinanceFactoringStatus } from "@prisma/client";

const ALL_STATUSES: FinanceFactoringStatus[] = [
  "SIMULATED",
  "SUBMITTED",
  "APPROVED",
  "FUNDED",
  "COLLECTED",
  "CLOSED",
  "CANCELLED",
];

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const periodo = url.searchParams.get("periodo") ?? undefined;
  const factoringCompanyId =
    url.searchParams.get("factoringCompanyId") ?? undefined;
  const statusCsv = url.searchParams.get("status");
  const statusIn = statusCsv
    ? (statusCsv
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is FinanceFactoringStatus =>
          ALL_STATUSES.includes(s as FinanceFactoringStatus),
        ))
    : undefined;
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") ?? "20", 10);

  const result = await listFactoringOperations(ctx.tenantId, {
    periodo,
    factoringCompanyId,
    statusIn,
    page,
    pageSize,
  });
  return NextResponse.json({ success: true, ...result });
}
