import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import {
  GUARDIA_COMM_TEMPLATES,
  renderGuardiaTemplate,
  type GuardiaCommunicationChannel,
} from "@/lib/personas";
import { sendGuardiaCommunicationSchema } from "@/lib/validations/ops";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

type Params = { id: string };

function buildPhoneForWhatsapp(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `56${digits}`;
  if (digits.length === 11 && digits.startsWith("56")) return digits;
  return null;
}

function toSafeString(value?: string | null): string {
  return value?.trim() || "";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;
    const { id } = await params;

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { persona: true },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const history = await prisma.opsGuardiaHistory.findMany({
      where: { tenantId: ctx.tenantId, guardiaId: id, eventType: "communication_sent" },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    });

    return NextResponse.json({
      success: true,
      data: {
        templates: GUARDIA_COMM_TEMPLATES,
        sent: history,
      },
    });
  } catch (error) {
    console.error("[PERSONAS] Error listing guardia communications:", error);
    return NextResponse.json({ success: false, error: "No se pudieron obtener las comunicaciones" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;
    const { id } = await params;

    const parsed = await parseBody(request, sendGuardiaCommunicationSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { persona: true },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const template = GUARDIA_COMM_TEMPLATES.find(
      (item) => item.id === body.templateId && item.channel === body.channel
    );
    if (!template) {
      return NextResponse.json({ success: false, error: "Plantilla de comunicación inválida" }, { status: 400 });
    }

    const tenantCfg = await getTenantCompanyConfig(ctx.tenantId);
    const vars = {
      nombre: toSafeString(guardia.persona.firstName),
      apellido: toSafeString(guardia.persona.lastName),
      rut: toSafeString(guardia.persona.rut),
      email: toSafeString(guardia.persona.email),
      celular: toSafeString(guardia.persona.phoneMobile),
      codigo: toSafeString(guardia.code),
      link_autogestion: `${request.nextUrl.origin}/personas/guardias/${guardia.id}`,
    };

    const resolvedSubject = template.subject ? renderGuardiaTemplate(template.subject, vars) : null;
    const resolvedBody = renderGuardiaTemplate(template.body, vars);
    let status = "registrado";
    let providerMessageId: string | null = null;
    let waLink: string | null = null;

    if (body.channel === "email") {
      const targetEmail = toSafeString(guardia.persona.email);
      if (!targetEmail) {
        return NextResponse.json({ success: false, error: "El guardia no tiene email registrado" }, { status: 400 });
      }
      try {
        const resendModule = await import("@/lib/resend");
        const response = await resendModule.resend.emails.send({
          from: resendModule.EMAIL_CONFIG.from,
          to: targetEmail,
          replyTo: resendModule.EMAIL_CONFIG.replyTo,
          subject: resolvedSubject || `Comunicación ${tenantCfg.commercialName}`,
          html: `<div style="font-family: Arial, sans-serif; white-space: pre-line;">${resolvedBody}</div>`,
          tags: [{ name: "type", value: "guardia_communication" }],
        });
        if (response.error) {
          status = "error_envio";
        } else {
          status = "enviado";
          providerMessageId = response.data?.id ?? null;
        }
      } catch {
        status = "pendiente_integracion";
      }
    }

    if (body.channel === "whatsapp") {
      const phone = buildPhoneForWhatsapp(guardia.persona.phoneMobile);
      if (!phone) {
        return NextResponse.json({ success: false, error: "El guardia no tiene celular válido (9 dígitos)" }, { status: 400 });
      }
      waLink = `https://wa.me/${phone}?text=${encodeURIComponent(resolvedBody)}`;
      status = "link_generado";
    }

    const channel = body.channel as GuardiaCommunicationChannel;
    const event = await prisma.opsGuardiaHistory.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId: guardia.id,
        eventType: "communication_sent",
        newValue: {
          channel,
          templateId: template.id,
          templateName: template.name,
          subject: resolvedSubject,
          message: resolvedBody,
          status,
          providerMessageId,
          waLink,
        },
        createdBy: ctx.userId,
      },
    });

    await createOpsAuditLog(ctx, "personas.guardia.communication.sent", "ops_guardia", guardia.id, {
      channel,
      templateId: template.id,
      status,
    });

    return NextResponse.json({
      success: true,
      data: {
        event,
        status,
        waLink,
      },
    });
  } catch (error) {
    console.error("[PERSONAS] Error sending guardia communication:", error);
    return NextResponse.json({ success: false, error: "No se pudo registrar la comunicación" }, { status: 500 });
  }
}
