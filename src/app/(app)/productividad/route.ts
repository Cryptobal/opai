import { NextResponse } from "next/server";
import { getProductividadEntryContext } from "@/lib/productividad-entry";
import {
  PRODUCTIVIDAD_LANDING_COOKIE,
  SURFACE_COOKIE,
  surfaceCookieOptions,
} from "@/lib/surface";

export const dynamic = "force-dynamic";

/**
 * Entrada del portal Productividad (Route Handler).
 *
 * Debe ser `route.ts` y no `page.tsx`: en Next 15+ `cookies().set()` desde un
 * Server Component lanza ("Cookies can only be modified in a Server Action or
 * Route Handler") y tumba el error boundary de producción.
 *
 * En caliente el middleware ya redirige con la cookie `opai-prod-landing`.
 * En frío resolvemos aquí y dejamos las cookies para el próximo arranque PWA.
 */
export async function GET(req: Request) {
  const { session, landing } = await getProductividadEntryContext();
  const origin = new URL(req.url).origin;

  if (!session?.user) {
    return NextResponse.redirect(
      new URL("/opai/login?callbackUrl=/productividad", origin),
    );
  }

  if (!landing) {
    return NextResponse.redirect(new URL("/hub", origin));
  }

  const res = NextResponse.redirect(new URL(landing, origin));
  const opts = surfaceCookieOptions();
  res.cookies.set(SURFACE_COOKIE, "productividad", opts);
  res.cookies.set(PRODUCTIVIDAD_LANDING_COOKIE, landing, opts);
  return res;
}
