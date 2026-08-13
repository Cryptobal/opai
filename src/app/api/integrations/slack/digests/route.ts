/**
 * GET/POST /api/integrations/slack/digests
 * Toggles por tenant de digests/reportes periódicos a Slack.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSlackAdmin } from "@/lib/integrations/slack/guard";
import {
  DEFAULT_SLACK_DIGEST_CONFIG,
  SLACK_DIGEST_META,
  getSlackDigestConfig,
  setSlackDigestConfig,
  type SlackDigestConfig,
  type SlackDigestKey,
} from "@/lib/integrations/slack/digest-config";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const KEYS = new Set<SlackDigestKey>(Object.keys(DEFAULT_SLACK_DIGEST_CONFIG) as SlackDigestKey[]);

export async function GET() {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;

  const digests = await getSlackDigestConfig(auth.ctx.tenantId);
  return NextResponse.json({
    success: true,
    digests,
    meta: SLACK_DIGEST_META,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const partial: Partial<SlackDigestConfig> = {};
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    // Acepta { digests: {...} } o un parcial plano { rondas: false }.
    const src =
      obj.digests && typeof obj.digests === "object"
        ? (obj.digests as Record<string, unknown>)
        : obj;
    for (const key of KEYS) {
      if (typeof src[key] === "boolean") partial[key] = src[key] as boolean;
    }
  }

  if (Object.keys(partial).length === 0) {
    return NextResponse.json(
      { success: false, error: "Envía al menos un toggle booleano." },
      { status: 400 },
    );
  }

  const digests = await setSlackDigestConfig(auth.ctx.tenantId, partial);
  await logAudit({
    action: "UPDATE",
    entity: "SlackDigests",
    entityId: auth.ctx.tenantId,
    tenantId: auth.ctx.tenantId,
    userId: auth.ctx.userId,
    details: { digests: partial, via: "web" },
    request: req,
  });

  return NextResponse.json({ success: true, digests, meta: SLACK_DIGEST_META });
}
