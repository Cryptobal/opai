import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifySlackSignature } from "@/lib/integrations/slack/signature";
import { handleInteractivity } from "@/lib/integrations/slack/interactivity";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/slack/interactivity — Slack Interactivity (block_actions).
 * Pública en el proxy; la seguridad es la firma HMAC verificada in-route sobre
 * el raw body ANTES de parsear. ACK 200 en <3s; el trabajo corre en after().
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifySlackSignature({ headers: req.headers, rawBody })) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // El payload viene como form-urlencoded: `payload=<json>`.
  let payload: Record<string, unknown>;
  try {
    const encoded = new URLSearchParams(rawBody).get("payload");
    if (!encoded) return NextResponse.json({ ok: true });
    payload = JSON.parse(encoded);
  } catch {
    return NextResponse.json({ ok: true });
  }

  after(async () => {
    try {
      await handleInteractivity(payload);
    } catch (err) {
      console.error("[slack] handleInteractivity falló:", err);
    }
  });

  return NextResponse.json({ ok: true });
}
