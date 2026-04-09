/**
 * API Route: /api/public/[tenantSlug]/messages
 * POST - Recibir mensajes públicos (contacto general, denuncias legales)
 *
 * Persiste en BD (PublicInquiry) por compliance y envía email a operaciones@gard.cl.
 * Soporta tipos: contacto, denuncia_ley_karin, denuncia_codigo_etica, denuncia_programa_cumplimiento
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromSlug } from "@/lib/tenant";
import { resend } from "@/lib/resend";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const INQUIRY_TYPES = [
  "contacto",
  "denuncia_ley_karin",
  "denuncia_codigo_etica",
  "denuncia_programa_cumplimiento",
] as const;

const TYPE_LABELS: Record<string, string> = {
  contacto: "Contacto General",
  denuncia_ley_karin: "Denuncia Ley Karin",
  denuncia_codigo_etica: "Denuncia Código de Ética",
  denuncia_programa_cumplimiento: "Denuncia Programa de Cumplimiento",
};

const messageSchema = z.object({
  type: z.enum(INQUIRY_TYPES),
  anonymous: z.boolean().default(false),
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email("Email inválido").max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1, "Mensaje es requerido").max(10000),
  metadata: z.record(z.string(), z.unknown()).optional(),
  fileUrl: z.string().trim().max(2000).optional(),
  fileName: z.string().trim().max(300).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
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
      { status: 404, headers: corsHeaders },
    );
  }
  const tenantId = tenant.id;

  try {
    const raw = await request.json();
    const result = messageSchema.safeParse(raw);

    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return NextResponse.json(
        { success: false, error: issues },
        { status: 400, headers: corsHeaders },
      );
    }

    const data = result.data;

    // Persist in DB for compliance
    const inquiry = await prisma.publicInquiry.create({
      data: {
        tenantId,
        type: data.type,
        anonymous: data.anonymous,
        name: data.anonymous ? null : (data.name || null),
        email: data.anonymous ? null : (data.email || null),
        phone: data.anonymous ? null : (data.phone || null),
        subject: data.subject || null,
        body: data.body,
        metadata: data.metadata ? (data.metadata as Record<string, string>) : undefined,
        fileUrl: data.fileUrl || null,
        fileName: data.fileName || null,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      },
    });

    // Send email notification
    const tenantCfg = await getTenantCompanyConfig(tenantId);
    const typeLabel = TYPE_LABELS[data.type] || data.type;
    const isLegal = data.type !== "contacto";
    const toEmail = isLegal ? "operaciones@gard.cl" : "operaciones@gard.cl";

    const contactInfo = data.anonymous
      ? `<p style="color: #94a3b8; font-style: italic;">Denuncia anónima — datos de contacto no proporcionados.</p>`
      : `
        <table style="width: 100%; margin-bottom: 16px; font-size: 14px;">
          ${data.name ? `<tr><td style="padding: 6px 0; color: #64748b; width: 100px;">Nombre</td><td style="padding: 6px 0; color: #0f172a;"><strong>${data.name}</strong></td></tr>` : ""}
          ${data.email ? `<tr><td style="padding: 6px 0; color: #64748b;">Email</td><td style="padding: 6px 0;"><a href="mailto:${data.email}" style="color: #0d9488;">${data.email}</a></td></tr>` : ""}
          ${data.phone ? `<tr><td style="padding: 6px 0; color: #64748b;">Teléfono</td><td style="padding: 6px 0;">${data.phone}</td></tr>` : ""}
        </table>`;

    // Metadata fields for legal complaints
    let metadataHtml = "";
    if (data.metadata && isLegal) {
      const meta = data.metadata as Record<string, string>;
      const metaFields = [];
      if (meta.tipo) metaFields.push(`<tr><td style="padding: 4px 0; color: #64748b;">Tipo</td><td>${meta.tipo}</td></tr>`);
      if (meta.fecha_hecho) metaFields.push(`<tr><td style="padding: 4px 0; color: #64748b;">Fecha del hecho</td><td>${meta.fecha_hecho}</td></tr>`);
      if (meta.lugar_hecho) metaFields.push(`<tr><td style="padding: 4px 0; color: #64748b;">Lugar</td><td>${meta.lugar_hecho}</td></tr>`);
      if (meta.persona_involucrada) metaFields.push(`<tr><td style="padding: 4px 0; color: #64748b;">Persona involucrada</td><td>${meta.persona_involucrada}</td></tr>`);
      if (meta.testigos) metaFields.push(`<tr><td style="padding: 4px 0; color: #64748b;">Testigos</td><td>${meta.testigos}</td></tr>`);
      if (metaFields.length > 0) {
        metadataHtml = `
          <h3 style="color: #0f2847; margin-top: 20px; font-size: 14px;">Detalles de la denuncia</h3>
          <table style="width: 100%; font-size: 14px;">${metaFields.join("")}</table>`;
      }
    }

    const fileHtml = data.fileUrl
      ? `<p style="margin-top: 12px;"><a href="${data.fileUrl}" style="color: #0d9488;">📎 Ver archivo adjunto${data.fileName ? ` (${data.fileName})` : ""}</a></p>`
      : "";

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
    const logoUrl = tenantCfg.logoUrl || tenantCfg.brandingLogoWhite || (baseUrl ? `${baseUrl}/logo.png` : "");
    const headerBg = "#0f2847";

    await resend.emails.send({
      from: tenantCfg.emailFrom,
      to: toEmail,
      replyTo: data.anonymous ? undefined : (data.email || undefined),
      subject: `${isLegal ? "⚠️" : "📩"} ${typeLabel}: ${data.subject || (data.name ? `de ${data.name}` : "Nuevo mensaje")}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color-scheme: light;">
          <div style="background: ${headerBg}; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
            ${logoUrl ? `<img src="${logoUrl}" alt="${tenantCfg.commercialName}" width="160" height="48" style="display: block; margin: 0 auto; object-fit: contain; max-width: 180px; height: 48px;" />` : ""}
          </div>
          <div style="background: #ffffff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <span style="display: inline-block; background: ${isLegal ? "#fef2f2" : "#f0fdf4"}; color: ${isLegal ? "#dc2626" : "#16a34a"}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">${typeLabel}</span>
            ${contactInfo}
            ${metadataHtml}
            <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid ${isLegal ? "#dc2626" : "#0d9488"};">
              <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${data.body.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
            </div>
            ${fileHtml}
            <p style="margin-top: 20px; color: #94a3b8; font-size: 12px;">ID: ${inquiry.id} · ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json(
      { success: true, data: { id: inquiry.id } },
      { status: 201, headers: corsHeaders },
    );
  } catch (error) {
    console.error("[MESSAGES] Error creating public inquiry:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar el mensaje" },
      { status: 500, headers: corsHeaders },
    );
  }
}
