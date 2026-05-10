import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isReservedSlug } from "@/lib/signup/reserved-slugs";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const SLUG_REGEX = /^[a-z0-9-]+$/;

function buildSuggestions(base: string): string[] {
  const clean = base.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
  if (!clean) return [];
  return [`${clean}-app`, `${clean}-cl`, `${clean}1`].slice(0, 3);
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`signup-check-slug:${ip}`, { limit: 60, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas consultas. Intenta más tarde." }, { status: 429 });
  }

  const slug = request.nextUrl.searchParams.get("slug")?.trim().toLowerCase() ?? "";

  if (!slug || slug.length < 3 || slug.length > 40 || !SLUG_REGEX.test(slug)) {
    return NextResponse.json({
      available: false,
      reason: "invalid",
      message: "Solo minúsculas, números y guiones (3-40 caracteres).",
    });
  }

  if (isReservedSlug(slug)) {
    return NextResponse.json({
      available: false,
      reason: "reserved",
      message: "Ese identificador está reservado.",
      suggestions: buildSuggestions(slug),
    });
  }

  const existing = await prisma.tenant.findFirst({
    where: { slug },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({
      available: false,
      reason: "taken",
      message: "Ese identificador ya está en uso.",
      suggestions: buildSuggestions(slug),
    });
  }

  return NextResponse.json({ available: true });
}
