/**
 * API Route: /api/public/[tenantSlug]/registro-demo
 * POST - Auto-registro de prospecto desde link público
 *
 * Crea CrmAccount (prospect) + CrmContact (con PIN) + envía email de bienvenida.
 * Sin autenticación pero con rate limiting por IP.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromSlug } from "@/lib/tenant";
import { resend } from "@/lib/resend";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { render } from "@react-email/render";
import RegistroDemoEmail from "@/emails/RegistroDemoEmail";

// ── Rate limiting in-memory (por IP, 5 req/h) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hora

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ── Zod schema ──
const registroDemoSchema = z.object({
  companyName: z.string().trim().min(1, "Nombre de empresa es requerido").max(200),
  contactName: z.string().trim().min(1, "Nombre del contacto es requerido").max(200),
  email: z.string().trim().email("Email inválido").max(200),
  phone: z.string().trim().max(30).optional().default(""),
  industry: z.enum([
    "condominio",
    "construccion",
    "logistica",
    "retail",
    "industrial",
    "educacion",
    "salud",
    "otro",
  ]),
  estimatedGuards: z.enum(["1-5", "6-15", "16-30", "30+"]).optional(),
  // Honeypot field — debe llegar vacío
  website_url: z.string().max(0, "").optional().default(""),
  // UTM tracking
  utmSource: z.string().trim().max(100).optional().default(""),
  utmCampaign: z.string().trim().max(100).optional().default(""),
});

const INDUSTRY_LABELS: Record<string, string> = {
  condominio: "Condominio",
  construccion: "Construcción",
  logistica: "Logística",
  retail: "Retail",
  industrial: "Industrial",
  educacion: "Educación",
  salud: "Salud",
  otro: "Otro",
};

function generatePin(): string {
  // 4 dígitos — consistente con el resto del sistema (CPQ, portal invites, etc.)
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json(
      { success: false, error: "Tenant not found" },
      { status: 404 },
    );
  }
  const tenantId = tenant.id;

  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    // Rate limiting
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Intente nuevamente en una hora." },
        { status: 429 },
      );
    }

    const raw = await request.json();
    const result = registroDemoSchema.safeParse(raw);

    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }

    const data = result.data;

    // Honeypot check (bots llenan el campo oculto)
    if (data.website_url) {
      // Silently reject — parece bot
      return NextResponse.json({ success: true });
    }

    const emailNorm = data.email.trim().toLowerCase();

    // Verificar que el email no exista ya como contacto con portal habilitado
    const existingContact = await prisma.crmContact.findFirst({
      where: {
        email: { equals: emailNorm, mode: "insensitive" },
        portalEnabled: true,
        account: { tenantId, status: { in: ["prospect", "client_active"] } },
      },
      select: { id: true },
    });

    if (existingContact) {
      return NextResponse.json(
        { success: false, error: "Este email ya tiene una cuenta registrada. Puede acceder al portal directamente." },
        { status: 409 },
      );
    }

    // Generar PIN y hash
    const bcrypt = await import("bcryptjs");
    const pin = generatePin();
    const pinHash = await bcrypt.hash(pin, 10);

    // Determinar source
    const source = data.utmSource
      ? `outreach_${data.utmSource}`
      : "web_registro";

    // Split contactName into firstName / lastName
    const nameParts = data.contactName.trim().split(/\s+/);
    const firstName = nameParts[0] || data.contactName;
    const lastName = nameParts.slice(1).join(" ") || "";

    // Crear Account + Contact en una transacción
    const { account, contact } = await prisma.$transaction(async (tx) => {
      const account = await tx.crmAccount.create({
        data: {
          tenantId,
          name: data.companyName,
          status: "prospect",
          type: "prospect",
          industry: data.industry,
          source,
          notes: [
            `Registro demo automático`,
            data.estimatedGuards ? `Guardias estimados: ${data.estimatedGuards}` : null,
            data.utmCampaign ? `Campaña: ${data.utmCampaign}` : null,
          ].filter(Boolean).join("\n"),
          portalConfig: {
            dashboard: true,
            guardias: true,
            liquidaciones: false,
            asistencia: true,
            pautas: false,
            examenes: false,
            rondas: true,
            posta: true,
            documentacion: true,
            cotizaciones: true,
            chat_instalacion: false,
            chat_grupos: false,
            tickets: true,
            encuestas: false,
            reportes: true,
            comparativa: true,
            alertas: true,
            gamificacion: true,
          },
        },
      });

      const contact = await tx.crmContact.create({
        data: {
          tenantId,
          accountId: account.id,
          firstName,
          lastName,
          email: emailNorm,
          phone: data.phone || null,
          roleTitle: "Contacto Principal",
          isPrimary: true,
          portalEnabled: true,
          portalPin: pinHash,
          portalPinVisible: pin,
          portalInvitationSentAt: new Date(),
        },
      });

      return { account, contact };
    });

    // Crear nota en CRM para auditoría
    try {
      await prisma.crmNote.create({
        data: {
          tenantId,
          entityType: "account",
          entityId: account.id,
          content: `Prospecto auto-registrado desde ${source === "web_registro" ? "formulario web" : "link de outreach"}.\n\nDatos:\n- Contacto: ${data.contactName} (${emailNorm})\n- Rubro: ${INDUSTRY_LABELS[data.industry] || data.industry}\n${data.estimatedGuards ? `- Guardias estimados: ${data.estimatedGuards}` : ""}\n${data.phone ? `- Teléfono: ${data.phone}` : ""}\n${data.utmCampaign ? `- Campaña: ${data.utmCampaign}` : ""}`.trim(),
          createdBy: "system",
        },
      });
    } catch (e) {
      console.warn("[registro-demo] Failed to create CRM note:", (e as Error)?.message);
    }

    // Notificación al equipo comercial
    try {
      const { sendNotification } = await import("@/lib/notification-service");
      await sendNotification({
        tenantId,
        type: "new_lead",
        title: `Nuevo prospecto demo: ${data.companyName}`,
        message: `${data.contactName} de ${data.companyName} se registró para demo del portal (${INDUSTRY_LABELS[data.industry] || data.industry})`,
        data: { accountId: account.id, email: emailNorm, company: data.companyName },
        link: "/crm",
      });
    } catch (e) {
      console.warn("[registro-demo] Failed to send notification:", (e as Error)?.message);
    }

    // Enviar email de bienvenida con credenciales
    try {
      const tenantCfg = await getTenantCompanyConfig(tenantId);
      const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ""}/portal/cliente`;

      const emailHtml = await render(
        RegistroDemoEmail({
          contactName: data.contactName,
          companyName: data.companyName,
          email: emailNorm,
          pin,
          portalUrl,
          industry: INDUSTRY_LABELS[data.industry] || data.industry,
        }),
      );

      await resend.emails.send({
        from: tenantCfg.emailFrom,
        to: emailNorm,
        subject: "Bienvenido al Portal de Clientes Gard — Sus credenciales de acceso",
        html: emailHtml,
      });

      // Email interno al equipo comercial
      await resend.emails.send({
        from: tenantCfg.emailFrom,
        to: tenantCfg.emailContact,
        subject: `🆕 Prospecto demo: ${data.companyName} — ${data.contactName}`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f172a;">Nuevo registro demo</h2>
            <table style="font-size: 14px; line-height: 1.8;">
              <tr><td style="color: #64748b; padding-right: 16px;">Empresa</td><td><strong>${data.companyName}</strong></td></tr>
              <tr><td style="color: #64748b; padding-right: 16px;">Contacto</td><td>${data.contactName}</td></tr>
              <tr><td style="color: #64748b; padding-right: 16px;">Email</td><td><a href="mailto:${emailNorm}">${emailNorm}</a></td></tr>
              ${data.phone ? `<tr><td style="color: #64748b; padding-right: 16px;">Teléfono</td><td>${data.phone}</td></tr>` : ""}
              <tr><td style="color: #64748b; padding-right: 16px;">Rubro</td><td>${INDUSTRY_LABELS[data.industry] || data.industry}</td></tr>
              ${data.estimatedGuards ? `<tr><td style="color: #64748b; padding-right: 16px;">Guardias est.</td><td>${data.estimatedGuards}</td></tr>` : ""}
              ${data.utmSource ? `<tr><td style="color: #64748b; padding-right: 16px;">Fuente</td><td>${data.utmSource}</td></tr>` : ""}
              ${data.utmCampaign ? `<tr><td style="color: #64748b; padding-right: 16px;">Campaña</td><td>${data.utmCampaign}</td></tr>` : ""}
            </table>
            <p style="margin-top: 20px;"><a href="${process.env.NEXT_PUBLIC_SITE_URL || ""}/opai/crm" style="color: #1e3a8a;">Ver en OPAI →</a></p>
          </div>
        `,
      });
    } catch (e) {
      console.error("[registro-demo] Failed to send email:", e);
    }

    // Suppress unused variable warning
    void contact;

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("[registro-demo] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar el registro" },
      { status: 500 },
    );
  }
}
