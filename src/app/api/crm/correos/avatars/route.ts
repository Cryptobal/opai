/**
 * POST /api/crm/correos/avatars
 * Body: { emails: string[], emailAccountId?: string }
 * Resuelve fotos (Admin + cache + People API) y devuelve { [email]: photoUrl }.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import {
  extractEmails,
  fetchMissingPeopleAvatars,
} from "@/modules/crm/email/email-avatars";

export const runtime = "nodejs";

const bodySchema = z.object({
  emails: z.array(z.string()).max(50),
  emailAccountId: z.string().uuid().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmView(ctx);
  if (forbidden) return forbidden;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, error: "Body inválido" },
      { status: 400 },
    );
  }

  const emails = extractEmails(body.emails);
  if (emails.length === 0) {
    return NextResponse.json({ success: true, data: {} });
  }

  try {
    const map = await fetchMissingPeopleAvatars({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      emails,
      emailAccountId: body.emailAccountId,
    });
    const data: Record<string, string> = {};
    for (const [email, url] of map) data[email] = url;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[CORREOS/AVATARS] error:", err);
    return NextResponse.json(
      { success: false, error: "No se pudieron resolver avatares" },
      { status: 500 },
    );
  }
}
