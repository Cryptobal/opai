import type { NextRequest } from "next/server";

export function parseRelayVerifyRequest(request: NextRequest): {
  token: string | null;
  src: string | null;
} {
  const url = new URL(request.url);
  let token = url.searchParams.get("token")
    || request.headers.get("x-relay-token")
    || bearer(request.headers.get("authorization"));
  let src = url.searchParams.get("src");

  const forwarded = request.headers.get("x-forwarded-uri")
    || request.headers.get("x-original-uri")
    || "";
  if (forwarded) {
    try {
      const q = new URL(forwarded, "https://media.opai.cl").searchParams;
      token = token || q.get("token");
      src = src || q.get("src");
    } catch {
      // ignore malformed forwarded uri
    }
  }

  return { token, src };
}

function bearer(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

export function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}
