/** POST /api/crm/correos/suggest-compose — borrador IA para mensaje nuevo (sin hilo). */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { generateDraftCompose } from "@/modules/crm/email/correo-draft-ai";
import { resolveCorreoAiStyle } from "@/modules/crm/email/correo-ai-style.server";
import { isDraftRefineMode } from "@/modules/crm/email/draft-reply-refine";
import { extractEmailAddresses, normalizeEmailAddress } from "@/lib/email-address";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const payload = (await req.json().catch(() => ({}))) as {
    instructions?: unknown;
    currentDraft?: unknown;
    refine?: unknown;
    subject?: unknown;
    to?: unknown;
  };

  const instructions =
    typeof payload.instructions === "string" ? payload.instructions.slice(0, 1200) : null;
  const currentDraft =
    typeof payload.currentDraft === "string" ? payload.currentDraft.slice(0, 8000) : null;
  const refine = isDraftRefineMode(payload.refine) ? payload.refine : null;
  const subject = typeof payload.subject === "string" ? payload.subject.slice(0, 500) : "";
  const toRaw = Array.isArray(payload.to) ? payload.to : [];
  const toEmails = toRaw
    .filter((e): e is string => typeof e === "string")
    .flatMap((e) => {
      const extracted = extractEmailAddresses(e)[0] ?? e.trim();
      return extracted ? [normalizeEmailAddress(extracted)] : [];
    })
    .filter((e) => e.includes("@") && e.length <= 320)
    .slice(0, 20);

  const style = await resolveCorreoAiStyle(ctx.tenantId, ctx.userId);
  const draft = await generateDraftCompose({
    tenantId: ctx.tenantId,
    subject,
    toEmails,
    instructions,
    currentDraft,
    refine,
    style,
  });

  return NextResponse.json({ draft });
}
