/**
 * GET /api/ops/marcacion/respaldos
 * Lista respaldos mensuales y opcionalmente verifica el SHA-256 del manifiesto.
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { getFileBuffer } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await ensureOpsAccess(ctx);
  if (forbidden) return forbidden;

  const verify = request.nextUrl.searchParams.get("verify") === "1";
  const id = request.nextUrl.searchParams.get("id");

  const rows = await prisma.opsMarcacionRespaldo.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(id ? { id } : {}),
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    take: 36,
  });

  const data = [];
  for (const row of rows) {
    let verified: boolean | null = null;
    let verifyError: string | null = null;
    if (verify) {
      try {
        const buf = await getFileBuffer(row.manifestKey);
        const actual = createHash("sha256").update(buf).digest("hex");
        verified = actual === row.manifestSha256;
      } catch (err) {
        verified = false;
        verifyError = err instanceof Error ? err.message : "Error leyendo manifiesto";
      }
    }
    data.push({
      id: row.id,
      periodYear: row.periodYear,
      periodMonth: row.periodMonth,
      recordCount: row.recordCount,
      byteSize: row.byteSize,
      fileSha256: row.fileSha256,
      manifestSha256: row.manifestSha256,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      createdAt: row.createdAt,
      verified,
      verifyError,
    });
  }

  return NextResponse.json({ success: true, data });
}
