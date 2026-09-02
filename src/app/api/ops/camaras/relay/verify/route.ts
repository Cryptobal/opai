import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, parseRelayVerifyRequest } from "@/lib/camaras/parse-verify";
import { tokenAllowsStream, verifyRelayToken } from "@/lib/camaras/relay-token";

export async function GET(request: NextRequest) {
  const ip = clientIp(request);
  const limit = checkRateLimit(`camaras-relay-verify:${ip}`, { limit: 180, windowSeconds: 60 });
  if (!limit.allowed) {
    return new NextResponse(null, { status: 429 });
  }

  const { token, src } = parseRelayVerifyRequest(request);
  if (!token || !src) {
    return new NextResponse(null, { status: 401 });
  }

  const claims = await verifyRelayToken(token);
  if (!claims || !tokenAllowsStream(claims, src)) {
    return new NextResponse(null, { status: 401 });
  }

  return new NextResponse(null, { status: 200 });
}
