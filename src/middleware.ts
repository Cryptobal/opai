import { NextResponse, type NextRequest } from "next/server";

/**
 * Preview de enlaces para WhatsApp (y otros crawlers de OG) en cotizaciones.
 *
 * Problema: /crm/cotizaciones/[id] es privada. Cuando WhatsApp visita la URL
 * sin sesión para armar el preview, el guard del layout la redirige a
 * /opai/login y el bot termina scrapeando los metadatos del login
 * ("OPAI — Iniciar Sesión").
 *
 * Solución: solo para crawlers de preview SIN sesión, reescribimos (sin
 * cambiar la URL que ve el bot) a un endpoint público que devuelve OG mínimo
 * — N° de cotización + cliente — sin exponer el contenido real ni alterar el
 * flujo de los usuarios autenticados.
 */

// Bots que arman link previews (no son navegadores de usuarios reales).
const PREVIEW_BOT_RE =
  /(whatsapp|facebookexternalhit|facebookcatalog|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|skypeuripreview|pinterest|redditbot|embedly|vkshare|w3c_validator|applebot|bitlybot|flipboard|tumblr|nuzzel|qwantify|outbrain|mastodon|googlebot|bingbot|bingpreview)/i;

// Cookie de sesión de Auth.js v5 (dev: authjs.session-token, prod https: __Secure-authjs.session-token).
function hasSession(req: NextRequest): boolean {
  return req.cookies
    .getAll()
    .some((c) => c.name.endsWith("authjs.session-token"));
}

export function middleware(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!PREVIEW_BOT_RE.test(ua) || hasSession(req)) {
    return NextResponse.next();
  }
  const id = req.nextUrl.pathname.split("/").pop() ?? "";
  if (!id) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/api/og/cotizacion/${id}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Solo el detalle de una cotización (un único segmento tras /cotizaciones/).
  matcher: ["/crm/cotizaciones/:id"],
};
