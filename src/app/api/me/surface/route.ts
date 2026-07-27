import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import {
  parseSurface,
  SURFACE_COOKIE,
  surfaceCookieOptions,
  type Surface,
} from "@/lib/surface";

export const dynamic = "force-dynamic";

/**
 * POST /api/me/surface
 * Body: { surface: "productividad" | "erp" }
 * Setea la cookie de superficie (sesión de presentación). No toca BD.
 */
export async function POST(req: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  let body: { surface?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.surface === "string" ? body.surface : "";
  if (raw !== "productividad" && raw !== "erp") {
    return NextResponse.json(
      { success: false, error: "surface debe ser 'productividad' o 'erp'" },
      { status: 400 },
    );
  }

  const surface: Surface = parseSurface(raw);
  const res = NextResponse.json({ success: true, surface });
  res.cookies.set(SURFACE_COOKIE, surface, surfaceCookieOptions());
  return res;
}
