import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkEmailSchema } from "@/lib/signup/validation";
import { isDisposableEmail } from "@/lib/signup/disposable-emails";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`signup-check-email:${ip}`, { limit: 30, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas consultas. Intenta más tarde." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = checkEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Email inválido" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();

  if (isDisposableEmail(email)) {
    return NextResponse.json(
      {
        available: false,
        reason: "disposable",
        message: "Por favor usa un email corporativo o personal real.",
      },
      { status: 200 },
    );
  }

  const [existingAdmin, pendingSignup] = await Promise.all([
    prisma.admin.findFirst({ where: { email } }),
    prisma.pendingSignup.findFirst({
      where: {
        email,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
  ]);

  if (existingAdmin) {
    return NextResponse.json({
      available: false,
      reason: "exists",
      suggestLogin: true,
      message: "Ya tienes una cuenta. Inicia sesión.",
    });
  }

  if (pendingSignup) {
    return NextResponse.json({
      available: false,
      reason: "pending",
      message: "Ya iniciaste un registro con este email. Revisa tu correo o reenvía la verificación.",
    });
  }

  return NextResponse.json({ available: true });
}
