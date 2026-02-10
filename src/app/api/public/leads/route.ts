/**
 * API Route: /api/public/leads
 * POST - Crear lead desde formulario web (público, sin auth)
 * 
 * Este endpoint es público y está diseñado para recibir datos
 * del formulario de cotización de la página web de Gard Security.
 * Crea un lead en el CRM, genera una notificación y envía un email.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { getWaTemplate } from "@/lib/whatsapp-templates";

// CORS headers for cross-origin requests from the website
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Labels para servicio en mensajes
const SERVICIO_LABELS: Record<string, string> = {
  guardias_seguridad: "Guardias de Seguridad",
  seguridad_electronica: "Vigilancia Electrónica",
  central_monitoreo: "Monitoreo 24/7",
  drones: "Drones de Seguridad",
  consultoria: "Consultoría en Seguridad",
  otro: "Otro servicio",
};

const WHATSAPP_COMERCIAL = "56982307771"; // +56 98 230 7771

// Validation schema for the incoming form data
const publicLeadSchema = z.object({
  nombre: z.string().trim().min(1, "Nombre es requerido").max(100),
  apellido: z.string().trim().min(1, "Apellido es requerido").max(100),
  email: z.string().trim().email("Email inválido").max(200),
  celular: z.string().trim().max(30),
  empresa: z.string().trim().min(1, "Empresa es requerida").max(200),
  direccion: z.string().trim().max(500).optional(),
  comuna: z.string().trim().max(100).optional(),
  ciudad: z.string().trim().max(100).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  pagina_web: z.string().trim().max(500).optional(),
  industria: z.string().trim().max(100).optional(),
  servicio: z.string().trim().max(100).default("guardias_seguridad"),
  detalle: z.string().trim().max(5000).optional(),
  dotacion: z
    .array(
      z.object({
        puesto: z.string().trim().max(200),
        cantidad: z.number().int().min(1).max(100),
        dias: z.array(z.string()).optional(),
        horaInicio: z.string().max(10).optional(),
        horaFin: z.string().max(10).optional(),
      })
    )
    .optional(),
  source: z
    .enum(["web_cotizador", "web_cotizador_inteligente"])
    .default("web_cotizador"),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const result = publicLeadSchema.safeParse(raw);

    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return NextResponse.json(
        { success: false, error: issues },
        { status: 400, headers: corsHeaders }
      );
    }

    const data = result.data;
    const emailOnly = (raw as { emailOnly?: boolean }).emailOnly === true;

    const totalGuards = data.dotacion?.reduce((sum, d) => sum + d.cantidad, 0) || 0;
    const tenantId = await getDefaultTenantId();

    let leadId: string | null = null;
    if (!emailOnly) {
      const notesLines: string[] = [];
      if (data.detalle) notesLines.push(`Detalle: ${data.detalle}`);
      if (data.dotacion && data.dotacion.length > 0) {
        notesLines.push(`\n--- Dotación solicitada (${totalGuards} guardias) ---`);
        data.dotacion.forEach((d, i) => {
          const dias = d.dias?.join(", ") || "No especificado";
          const horario = d.horaInicio && d.horaFin ? `${d.horaInicio} - ${d.horaFin}` : "No especificado";
          notesLines.push(
            `${i + 1}. ${d.puesto}: ${d.cantidad} guardia(s) | Días: ${dias} | Horario: ${horario}`
          );
        });
      }

      const lead = await prisma.crmLead.create({
        data: {
          tenantId,
          status: "pending",
          source: data.source,
          firstName: data.nombre,
          lastName: data.apellido,
          email: data.email,
          phone: data.celular,
          companyName: data.empresa,
          industry: data.industria || null,
          address: data.direccion || null,
          commune: data.comuna || null,
          city: data.ciudad || null,
          website: data.pagina_web || null,
          serviceType: data.servicio,
          notes: notesLines.join("\n") || null,
          metadata: data.dotacion
            ? {
                dotacion: data.dotacion,
                totalGuards,
                webFormData: {
                  pagina_web: data.pagina_web,
                  industria: data.industria,
                  servicio: data.servicio,
                },
              }
            : undefined,
        },
      });
      leadId = lead.id;

      // Crear instalación tentativa cuando hay dirección (Google Maps con lat/lng)
      const tieneDireccion = data.direccion && data.direccion.trim().length > 0;
      const nombreTentativo = `${data.empresa} - ${data.direccion || "Instalación"}`.slice(0, 200);
      if (tieneDireccion) {
        await prisma.crmInstallation.create({
          data: {
            tenantId,
            leadId: lead.id,
            accountId: null,
            name: nombreTentativo,
            address: data.direccion || null,
            commune: data.comuna || null,
            city: data.ciudad || null,
            lat: data.lat ?? null,
            lng: data.lng ?? null,
            notes: data.detalle ? `From lead: ${data.detalle.slice(0, 500)}` : null,
          },
        });
      }

      await prisma.notification.create({
        data: {
          tenantId,
          type: "new_lead",
          title: `Nuevo lead: ${data.empresa}`,
          message: `${data.nombre} ${data.apellido} de ${data.empresa} solicita cotización de ${
            data.servicio === "guardias_seguridad"
              ? `guardias de seguridad (${totalGuards} guardias)`
              : data.servicio
          }`,
          data: { leadId: lead.id, email: data.email, company: data.empresa },
          link: "/crm/leads",
        },
      });
    }

    // Mensaje WhatsApp para enviar al cliente (prellenado al hacer clic)
    const servicioLabel = SERVICIO_LABELS[data.servicio] || data.servicio;
    const direccionCompleta = [data.direccion, data.comuna, data.ciudad].filter(Boolean).join(", ") || "Sin dirección";
    const dotacionTexto =
      data.dotacion && data.dotacion.length > 0
        ? data.dotacion.map((d) => `${d.puesto}: ${d.cantidad} guardia(s)`).join("; ")
        : "";

    // Token values for lead WhatsApp templates
    const leadTokenValues: Record<string, string> = {
      nombre: data.nombre,
      apellido: data.apellido,
      empresa: data.empresa,
      direccion: direccionCompleta,
      comuna: data.comuna || "",
      ciudad: data.ciudad || "",
      servicio: servicioLabel,
      dotacion: dotacionTexto,
      email: data.email,
      celular: data.celular,
      pagina_web: data.pagina_web || "",
      industria: data.industria || "",
      detalle: data.detalle || "",
    };

    // Resolver templates desde la BD (o DocTemplate whatsapp, o defaults)
    const [tplComercial, tplCliente] = await Promise.all([
      getWaTemplate(tenantId, "lead_commercial", { waValues: leadTokenValues }),
      getWaTemplate(tenantId, "lead_client", { waValues: leadTokenValues }),
    ]);

    const whatsappMsgComercial = tplComercial;

    const celularLimpio = data.celular.replace(/\D/g, "").replace(/^0/, "");
    const waNumCliente = celularLimpio.startsWith("56") ? celularLimpio : `56${celularLimpio}`;
    const waUrlComercial = `https://wa.me/${waNumCliente}?text=${encodeURIComponent(whatsappMsgComercial)}`;

    const waMsgCliente = tplCliente;
    const waUrlCliente = `https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(waMsgCliente)}`;

    // Send email notification to comercial@gard.cl
    try {
      const dotacionHtml = data.dotacion?.length
        ? `
          <h3 style="color: #0d9488; margin-top: 20px;">Dotación Solicitada (${totalGuards} guardias)</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Puesto</th>
                <th style="padding: 8px; text-align: center; border: 1px solid #e2e8f0;">Cantidad</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Días</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Horario</th>
              </tr>
            </thead>
            <tbody>
              ${data.dotacion
                .map(
                  (d) => `
                <tr>
                  <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.puesto}</td>
                  <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0;">${d.cantidad}</td>
                  <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.dias?.join(", ") || "—"}</td>
                  <td style="padding: 8px; border: 1px solid #e2e8f0;">${
                    d.horaInicio && d.horaFin ? `${d.horaInicio} - ${d.horaFin}` : "—"
                  }</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>`
        : "";

      const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://opai.gard.cl";
      const logoUrl = `${baseUrl}/logo-gard-blanco.svg`;

      await resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: "comercial@gard.cl",
        replyTo: data.email,
        subject: `🔔 Nuevo lead: ${data.empresa} — ${data.nombre} ${data.apellido}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 0 20px; color-scheme: light;">
            <div style="background: #0d9488; padding: 28px 24px; border-radius: 12px 12px 0 0;">
              <img src="${logoUrl}" alt="Gard Security" width="140" height="36" style="display: block; margin-bottom: 16px;" />
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">Nuevo lead desde gard.cl</h1>
              <p style="color: #ffffff; opacity: 0.95; margin: 8px 0 0; font-size: 14px;">Formulario de cotización</p>
            </div>
            <div style="background: #ffffff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <h2 style="color: #0f172a; margin: 0 0 20px; font-size: 18px; font-weight: 600;">${data.empresa}</h2>
              <table style="width: 100%; margin-bottom: 20px; font-size: 14px;">
                <tr><td style="padding: 6px 0; color: #64748b; width: 100px; vertical-align: top;">Contacto</td><td style="padding: 6px 0; color: #0f172a;"><strong>${data.nombre} ${data.apellido}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Email</td><td style="padding: 6px 0;"><a href="mailto:${data.email}" style="color: #0d9488; text-decoration: none;">${data.email}</a></td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Teléfono</td><td style="padding: 6px 0;"><a href="tel:${data.celular}" style="color: #0f172a; text-decoration: none;">${data.celular}</a></td></tr>
                ${data.direccion ? `<tr><td style="padding: 6px 0; color: #64748b;">Dirección</td><td style="padding: 6px 0; color: #0f172a;">${data.direccion}${data.comuna ? `, ${data.comuna}` : ""}${data.ciudad ? `, ${data.ciudad}` : ""}</td></tr>` : ""}
                ${data.industria ? `<tr><td style="padding: 6px 0; color: #64748b;">Industria</td><td style="padding: 6px 0; color: #0f172a;">${data.industria}</td></tr>` : ""}
                ${data.pagina_web ? `<tr><td style="padding: 6px 0; color: #64748b;">Web</td><td style="padding: 6px 0;"><a href="${data.pagina_web}" style="color: #0d9488; text-decoration: none;">${data.pagina_web}</a></td></tr>` : ""}
                <tr><td style="padding: 6px 0; color: #64748b;">Servicio</td><td style="padding: 6px 0; color: #0f172a; font-weight: 500;">${servicioLabel}</td></tr>
              </table>
              ${data.detalle ? `<div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #0d9488;"><p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.6;">${data.detalle.replace(/\n/g, "<br>")}</p></div>` : ""}
              ${dotacionHtml}
              <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0 0 16px; font-size: 13px; color: #64748b;">Responde cuanto antes para aumentar la probabilidad de cierre:</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; text-align: center;">
                      <a href="${waUrlComercial}" style="display: inline-block; background: #25D366; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">Escribir en WhatsApp al cliente</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; text-align: center;">
                      <a href="${baseUrl}/crm/leads" style="display: inline-block; color: #0d9488; font-size: 14px; text-decoration: none;">Ver en OPAI →</a>
                    </td>
                  </tr>
                </table>
              </div>
            </div>
          </div>
        `,
      });

      // Email de confirmación al cliente
      await resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: data.email,
        subject: `Tu solicitud fue recibida — Gard Security te contactará pronto`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 0 20px; color-scheme: light;">
            <div style="background: #0d9488; padding: 28px 24px; border-radius: 12px 12px 0 0;">
              <img src="${logoUrl}" alt="Gard Security" width="140" height="36" style="display: block; margin-bottom: 16px;" />
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">Gard Security</h1>
              <p style="color: #ffffff; opacity: 0.95; margin: 8px 0 0; font-size: 14px;">Solicitud de cotización recibida</p>
            </div>
            <div style="background: #ffffff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <p style="color: #0f172a; margin: 0 0 16px; font-size: 16px; line-height: 1.6;">Hola${data.nombre ? ` ${data.nombre}` : ""},</p>
              <p style="color: #475569; margin: 0 0 16px; font-size: 15px; line-height: 1.6;">Hemos recibido tu solicitud de cotización para <strong>${data.empresa}</strong>.</p>
              ${dotacionHtml ? `
              <h3 style="color: #0d9488; margin-top: 24px; margin-bottom: 12px; font-size: 16px;">Dotación solicitada (${totalGuards} guardias)</h3>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <thead>
                  <tr style="background: #f1f5f9;">
                    <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0; color: #0f172a;">Puesto</th>
                    <th style="padding: 8px; text-align: center; border: 1px solid #e2e8f0; color: #0f172a;">Cantidad</th>
                    <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0; color: #0f172a;">Días</th>
                    <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0; color: #0f172a;">Horario</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.dotacion!
                    .map(
                      (d) => `
                    <tr>
                      <td style="padding: 8px; border: 1px solid #e2e8f0; color: #0f172a;">${d.puesto}</td>
                      <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0; color: #0f172a;">${d.cantidad}</td>
                      <td style="padding: 8px; border: 1px solid #e2e8f0; color: #0f172a;">${d.dias?.join(", ") || "—"}</td>
                      <td style="padding: 8px; border: 1px solid #e2e8f0; color: #0f172a;">${d.horaInicio && d.horaFin ? `${d.horaInicio} - ${d.horaFin}` : "—"}</td>
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
              ` : ""}
              <p style="color: #475569; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">Nuestro equipo comercial te contactará en menos de 12 horas hábiles. Si necesitas más información antes, puedes escribirnos o llamarnos:</p>
              <div style="margin: 24px 0; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <a href="${waUrlCliente}" style="display: inline-block; background: #25D366; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 12px;">Enviar WhatsApp a Gard</a>
                <p style="color: #475569; font-size: 14px; margin: 0;">O llámanos al <a href="tel:+56982307771" style="color: #0d9488; font-weight: 500;">+56 98 230 7771</a></p>
              </div>
              <p style="color: #64748b; font-size: 13px; margin: 0;"><a href="http://gard.cl" style="color: #0d9488;">http://gard.cl</a></p>
            </div>
          </div>
        `,
      });
    } catch (emailError) {
      // Log email error but don't fail the lead creation
      console.error("Error sending lead notification email:", emailError);
    }

    return NextResponse.json(
      { success: true, data: emailOnly ? { emailOnly: true } : { id: leadId } },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error creating public lead:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar la solicitud" },
      { status: 500, headers: corsHeaders }
    );
  }
}
