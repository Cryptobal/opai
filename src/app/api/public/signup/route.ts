import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/signup/validation";
import { isDisposableEmail } from "@/lib/signup/disposable-emails";
import { isReservedSlug } from "@/lib/signup/reserved-slugs";
import { verifyTurnstileToken } from "@/lib/signup/turnstile";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { lookupRutSimpleApi } from "@/modules/finance/shared/adapters/simpleapi-rut";
import { resend, buildDeliverabilityHeaders } from "@/lib/resend";
import { render } from "@react-email/render";
import SignupVerificationEmail from "@/emails/SignupVerificationEmail";
import {
  notifyPlatform,
  type PlatformAlertSiiData,
} from "@/lib/notifications/notify-platform";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VERIFICATION_TTL_HOURS = 24;

interface SiiRawShape {
  fechaInicioActividades?: string;
  esEmpresaMenorTamano?: boolean;
  actividadesEconomicas?: Array<{ codigo: string; descripcion: string }>;
}

function pickSiiSummary(raw: unknown): PlatformAlertSiiData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as SiiRawShape;
  return {
    fechaInicioActividades: r.fechaInicioActividades,
    esEmpresaMenorTamano: r.esEmpresaMenorTamano,
    actividadesEconomicas: r.actividadesEconomicas,
  };
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? undefined;

  const rl = checkRateLimit(`signup-create:${ip}`, { limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta en una hora." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Honeypot: si llegó algo, devolver 200 OK falso para no alertar al bot
  if (data.honeypot && data.honeypot.length > 0) {
    return NextResponse.json({ success: true, message: "Te enviamos un correo." });
  }

  if (isDisposableEmail(data.email)) {
    return NextResponse.json({ error: "Por favor usa un email corporativo." }, { status: 400 });
  }

  if (isReservedSlug(data.proposedSlug)) {
    return NextResponse.json({ error: "Ese identificador no está disponible." }, { status: 400 });
  }

  const turnstile = await verifyTurnstileToken(data.turnstileToken, ip);
  if (!turnstile.success) {
    console.warn("[signup] Turnstile failed", turnstile.errorCodes);
    return NextResponse.json(
      { error: "Verificación de seguridad falló. Recarga e intenta de nuevo." },
      { status: 400 },
    );
  }

  const [existingAdmin, existingTenant, pending] = await Promise.all([
    prisma.admin.findFirst({ where: { email: data.email } }),
    prisma.tenant.findFirst({ where: { slug: data.proposedSlug } }),
    prisma.pendingSignup.findFirst({
      where: { email: data.email, verifiedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);

  if (existingAdmin) {
    return NextResponse.json({ error: "Ya tienes una cuenta. Inicia sesión." }, { status: 409 });
  }
  if (existingTenant) {
    return NextResponse.json(
      { error: "Ese identificador ya está en uso. Elige otro." },
      { status: 409 },
    );
  }
  if (pending) {
    return NextResponse.json(
      {
        error: "Ya iniciaste un registro con este email. Revisa tu correo.",
        action: "resend",
      },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const verificationToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 3600 * 1000);

  // SII enrichment (si hay RUT) — guardar raw para auditoría y reuso
  let siiData: unknown = null;
  let requiresReview = false;
  let reviewReason: string | undefined;
  if (data.companyRut) {
    try {
      const sii = await lookupRutSimpleApi(data.companyRut);
      if (sii.success) {
        siiData = sii.raw;
      } else {
        requiresReview = true;
        reviewReason = `SII lookup failed: ${sii.error}`;
      }
    } catch (e) {
      requiresReview = true;
      reviewReason = `SII lookup exception: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    requiresReview = true;
    reviewReason = "Sin RUT empresa (empresa nueva o sin inicio actividades)";
  }

  const pendingSignup = await prisma.pendingSignup.create({
    data: {
      email: data.email,
      passwordHash,
      ownerName: data.ownerName,
      ownerPhone: data.ownerPhone,
      legalName: data.legalName,
      companyRut: data.companyRut,
      commercialName: data.commercialName,
      proposedSlug: data.proposedSlug,
      industry: data.industry,
      estimatedGuards: data.estimatedGuards,
      address: data.address,
      commune: data.commune,
      city: data.city,
      giro: data.giro,
      source: data.source ?? "web",
      utmSource: data.utmSource,
      utmCampaign: data.utmCampaign,
      utmMedium: data.utmMedium,
      ip,
      userAgent,
      siiData: (siiData ?? undefined) as never,
      verificationToken,
      expiresAt,
      requiresReview,
      reviewReason,
    },
  });

  const verificationUrl = `${getCanonicalSiteUrl()}/verify-signup?token=${verificationToken}`;

  try {
    const html = await render(
      SignupVerificationEmail({
        ownerName: data.ownerName,
        commercialName: data.commercialName,
        verificationUrl,
        expiresInHours: VERIFICATION_TTL_HOURS,
      }),
    );
    const text = await render(
      SignupVerificationEmail({
        ownerName: data.ownerName,
        commercialName: data.commercialName,
        verificationUrl,
        expiresInHours: VERIFICATION_TTL_HOURS,
      }),
      { plainText: true },
    );

    await resend.emails.send({
      from: "Opai <noreply@opai.cl>",
      to: data.email,
      replyTo: "hola@opai.cl",
      subject: `Confirma tu cuenta en Opai · ${data.commercialName}`,
      html,
      text,
      headers: buildDeliverabilityHeaders(),
    });
  } catch (e) {
    console.error("[signup] Verification email failed:", e);
    // No abortamos — el PendingSignup quedó creado y el usuario puede pedir reenvío
  }

  // Notif a super-admin (no bloqueante)
  void notifyPlatform({
    event: "signup_pending",
    ownerEmail: data.email,
    ownerName: data.ownerName,
    ownerPhone: data.ownerPhone,
    commercialName: data.commercialName,
    legalName: data.legalName,
    companyRut: data.companyRut,
    industry: data.industry,
    estimatedGuards: data.estimatedGuards,
    address: data.address,
    commune: data.commune,
    city: data.city,
    giro: data.giro,
    siiData: pickSiiSummary(siiData),
    source: data.source,
    utmSource: data.utmSource,
    utmCampaign: data.utmCampaign,
    utmMedium: data.utmMedium,
    ip,
  });

  await logAudit({
    action: "CREATE",
    entity: "PendingSignup",
    entityId: pendingSignup.id,
    details: {
      email: data.email,
      slug: data.proposedSlug,
      requiresReview,
      reviewReason,
    },
    request,
  });

  return NextResponse.json(
    {
      success: true,
      message: `Te enviamos un correo a ${data.email}. Confirma tu cuenta para empezar.`,
    },
    { status: 201 },
  );
}
