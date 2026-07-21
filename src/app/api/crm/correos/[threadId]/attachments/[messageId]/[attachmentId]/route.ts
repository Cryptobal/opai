import { NextRequest, NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
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

// Tipos que NO se sirven inline (riesgo XSS same-origin): se fuerzan a descarga.
const UNSAFE_INLINE = /html|xml|svg/i;

/**
 * GET adjunto de Gmail vía streaming. Abre inline (PDF/imagen) en el visor
 * nativo; el `download` del <a> fuerza la descarga con el nombre real.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const { tenantId, userId } = mod.ctx;

  const { threadId, messageId, attachmentId } = await ctx.params;
  const res = await fetchGmailAttachment({ tenantId, userId, threadId, messageId, attachmentId });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  const filename = sanitizeFilename(res.filename);
  const disposition = UNSAFE_INLINE.test(res.mimeType) ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(res.buffer), {
    status: 200,
    headers: {
      "Content-Type": res.mimeType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length": String(res.size),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
