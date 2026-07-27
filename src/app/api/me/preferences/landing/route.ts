import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID = new Set(["erp", "productividad"]);

/**
 * GET /api/me/preferences/landing
 * { success, landingSurface: string | null }
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const pref = await prisma.adminPreference.findUnique({
    where: { adminId: ctx.userId },
    select: { landingSurface: true },
  });

  const raw = pref?.landingSurface ?? null;
  const landingSurface =
    raw && VALID.has(raw) ? raw : null;

  return NextResponse.json({ success: true, landingSurface });
}

/**
 * PUT /api/me/preferences/landing
 * Body: { landingSurface }. Valores inválidos se descartan en silencio
 * (mismo patrón que hub-order).
 */
export async function PUT(req: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  let body: { landingSurface?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw =
    typeof body.landingSurface === "string" ? body.landingSurface : null;
  const landingSurface = raw && VALID.has(raw) ? raw : null;

  // Descarte silencioso de inválidos: no error 400 (patrón hub-order).
  if (!landingSurface) {
    const existing = await prisma.adminPreference.findUnique({
      where: { adminId: ctx.userId },
      select: { landingSurface: true },
    });
    const kept =
      existing?.landingSurface && VALID.has(existing.landingSurface)
        ? existing.landingSurface
        : null;
    return NextResponse.json({ success: true, landingSurface: kept });
  }

  await prisma.adminPreference.upsert({
    where: { adminId: ctx.userId },
    create: { adminId: ctx.userId, landingSurface },
    update: { landingSurface },
  });

  return NextResponse.json({ success: true, landingSurface });
}
