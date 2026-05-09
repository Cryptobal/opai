import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { resendVerificationSchema } from "@/lib/signup/validation";
import { resend, buildDeliverabilityHeaders } from "@/lib/resend";
import { render } from "@react-email/render";
import SignupVerificationEmail from "@/emails/SignupVerificationEmail";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_RESENDS = 3;
const RESEND_COOLDOWN_SECONDS = 60;
const VERIFICATION_TTL_HOURS = 24;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`signup-resend:${ip}`, { limit: 10, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = resendVerificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  const pending = await prisma.pendingSignup.findFirst({
    where: { email, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!pending) {
    // No revelar si existe o no — anti-enumeration
    return NextResponse.json({
      success: true,
      message: "Si tienes un registro pendiente, te enviamos el correo.",
    });
  }

  if (pending.resentCount >= MAX_RESENDS) {
    return NextResponse.json(
      { error: "Excediste el máximo de reenvíos. Contacta soporte." },
      { status: 429 },
    );
  }
  if (
    pending.lastResendAt &&
    Date.now() - pending.lastResendAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000
  ) {
    return NextResponse.json(
      { error: `Espera ${RESEND_COOLDOWN_SECONDS}s antes de reenviar.` },
      { status: 429 },
    );
  }

  const newToken = randomBytes(32).toString("hex");
  const newExpires = new Date(Date.now() + VERIFICATION_TTL_HOURS * 3600 * 1000);

  await prisma.pendingSignup.update({
    where: { id: pending.id },
    data: {
      verificationToken: newToken,
      expiresAt: newExpires,
      resentCount: pending.resentCount + 1,
      lastResendAt: new Date(),
    },
  });

  const verificationUrl = `${getCanonicalSiteUrl()}/verify-signup?token=${newToken}`;

  try {
    const html = await render(
      SignupVerificationEmail({
        ownerName: pending.ownerName,
        commercialName: pending.commercialName,
        verificationUrl,
        expiresInHours: VERIFICATION_TTL_HOURS,
      }),
    );
    await resend.emails.send({
      from: "Opai <noreply@opai.cl>",
      to: pending.email,
      replyTo: "hola@opai.cl",
      subject: `Confirma tu cuenta en Opai · ${pending.commercialName}`,
      html,
      headers: buildDeliverabilityHeaders(),
    });
  } catch (e) {
    console.error("[signup/resend] email failed:", e);
  }

  return NextResponse.json({ success: true, message: "Correo reenviado." });
}
