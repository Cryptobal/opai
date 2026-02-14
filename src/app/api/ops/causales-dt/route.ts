import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { CAUSALES_DT } from "@/lib/guard-events";

/**
 * GET /api/ops/causales-dt — List causales DT (Chilean labor law termination causes)
 *
 * TODO (Local phase): Replace with Prisma query on OpsCausalDt table
 * For now returns static seed data from guard-events.ts
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    // Return seed data as stub (these will come from DB later)
    const items = CAUSALES_DT.map((c, i) => ({
      id: `stub-${i}`,
      ...c,
      defaultTemplateId: null,
    }));

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing causales DT:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener las causales DT" },
      { status: 500 },
    );
  }
}
