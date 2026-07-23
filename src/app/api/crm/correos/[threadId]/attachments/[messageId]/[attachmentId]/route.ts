import { NextRequest, NextResponse } from "next/server";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { fetchGmailAttachment } from "@/modules/crm/email/gmail-attachment";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ threadId: string; messageId: string; attachmentId: string }> };

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\\/\x00-\x1f"]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) || "adjunto"
  );
}

/**
 * Content-Disposition 100% ASCII (RFC 5987): un filename con caracteres fuera
 * de latin1 (– — emoji, etc.) en el header crudo lanza TypeError en undici y
 * el endpoint moría con 500 tanto al ver como al descargar ESE archivo.
 */
function contentDisposition(kind: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  const utf8 = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// Tipos que NO se sirven inline (riesgo XSS same-origin): se fuerzan a descarga.
const UNSAFE_INLINE = /html|xml|svg/i;

/**
 * GET adjunto de Gmail vía streaming. Abre inline (PDF/imagen) en el visor
 * nativo; el `download` del <a> fuerza la descarga con el nombre real.
 * `fn`/`sz` (query) re-ubican el adjunto si el attachmentId de Gmail rotó.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const { tenantId, userId } = mod.ctx;

  const { threadId, messageId, attachmentId } = await ctx.params;
  const fn = req.nextUrl.searchParams.get("fn");
  const sz = Number(req.nextUrl.searchParams.get("sz"));
  const res = await fetchGmailAttachment({
    tenantId,
    userId,
    threadId,
    messageId,
    attachmentId,
    filenameHint: fn || null,
    sizeHint: Number.isFinite(sz) && sz > 0 ? sz : null,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  const filename = sanitizeFilename(res.filename);
  const disposition = UNSAFE_INLINE.test(res.mimeType) ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(res.buffer), {
    status: 200,
    headers: {
      "Content-Type": res.mimeType || "application/octet-stream",
      "Content-Disposition": contentDisposition(disposition, filename),
      "Content-Length": String(res.size),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
