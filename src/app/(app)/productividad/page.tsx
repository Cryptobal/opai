import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProductividadEntryContext } from "@/lib/productividad-entry";
import {
  PRODUCTIVIDAD_LANDING_COOKIE,
  SURFACE_COOKIE,
  surfaceCookieOptions,
} from "@/lib/surface";

export const dynamic = "force-dynamic";

/**
 * Entrada del portal Productividad.
 * En caliente el middleware ya redirige con la cookie `opai-prod-landing`.
 * En frío resuelve aquí (dedupe via React.cache con el layout) y deja la
 * cookie para el próximo arranque PWA en un solo viaje.
 */
export default async function ProductividadEntryPage() {
  const { session, landing } = await getProductividadEntryContext();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/productividad");
  }

  if (!landing) {
    redirect("/hub");
  }

  const cookieStore = await cookies();
  cookieStore.set(SURFACE_COOKIE, "productividad", surfaceCookieOptions());
  cookieStore.set(PRODUCTIVIDAD_LANDING_COOKIE, landing, surfaceCookieOptions());

  redirect(landing);
}
