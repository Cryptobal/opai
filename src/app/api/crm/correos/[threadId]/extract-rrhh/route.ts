/** POST /api/crm/correos/[threadId]/extract-rrhh — borrador de postulante (bajo demanda). */
import type { NextRequest } from "next/server";
import { handleThreadExtractor } from "@/lib/crm/extractor-route";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  return handleThreadExtractor("rrhh", ctx.params);
}
