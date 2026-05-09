import { NextRequest, NextResponse } from "next/server";
import { lookupRutSchema } from "@/lib/signup/validation";
import { lookupRutSimpleApi } from "@/modules/finance/shared/adapters/simpleapi-rut";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // SimpleAPI puede tardar hasta 90s

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`signup-lookup-rut:${ip}`, { limit: 10, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas consultas. Intenta más tarde." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = lookupRutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "RUT inválido" },
      { status: 400 },
    );
  }

  const result = await lookupRutSimpleApi(parsed.data.rut);

  if (!result.success) {
    const status = /timeout/i.test(result.error)
      ? 504
      : result.httpStatus === 400 || /no hay registros/i.test(result.error)
        ? 404
        : 502;
    return NextResponse.json({ success: false, error: result.error }, { status });
  }

  return NextResponse.json({
    success: true,
    rut: result.rut,
    summary: result.summary,
    raw: result.raw,
  });
}
