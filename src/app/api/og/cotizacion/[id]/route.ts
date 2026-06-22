/**
 * OG preview público y MÍNIMO para cotizaciones (link previews de WhatsApp).
 *
 * Reescrito desde /crm/cotizaciones/[id] por middleware SOLO para crawlers de
 * preview sin sesión. Devuelve únicamente N° de cotización + cliente — lo
 * justo para identificar la cotización en el chat. No expone montos ni el
 * contenido real (eso sigue tras login).
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "opai.gard.cl";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;
  const canonical = `${base}/crm/cotizaciones/${id}`;
  const ogImage = `${base}/icons/og-image.png`;

  let title = "Cotización · OPAI";
  const description = "Cotización en OPAI — abrir requiere iniciar sesión.";

  try {
    const isUuid = uuidSchema.safeParse(id).success;
    const quote = await prisma.cpqQuote.findUnique({
      where: isUuid ? { id } : { code: id },
      select: {
        code: true,
        name: true,
        clientName: true,
        installation: { select: { name: true } },
      },
    });
    if (quote) {
      const cliente =
        quote.clientName?.trim() ||
        quote.installation?.name?.trim() ||
        quote.name?.trim() ||
        null;
      title = cliente
        ? `Cotización ${quote.code} · ${cliente}`
        : `Cotización ${quote.code}`;
    }
  } catch {
    // Si falla la consulta, caemos al título genérico — el preview nunca rompe.
  }

  const t = esc(title);
  const d = esc(description);

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<meta name="description" content="${d}" />
<meta name="robots" content="noindex, nofollow" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="OPAI" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
</head>
<body></body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
