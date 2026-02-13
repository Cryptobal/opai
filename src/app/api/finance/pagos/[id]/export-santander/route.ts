import type { NextRequest } from "next/server";
import { GET } from "@/app/api/finance/payments/[id]/export-santander/route";

type Params = { id: string };

export { GET };

// Compatibilidad con clientes antiguos que usan POST.
export async function POST(
  request: NextRequest,
  context: { params: Promise<Params> },
) {
  return GET(request, context);
}
