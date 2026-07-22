/**
 * Push de correo nuevo (PR-15, C22a): al cierre de una corrida incremental de
 * sync se detectan los inbound nuevos de la corrida (direction='in', label
 * INBOX, excluyendo remitente = la propia casilla) y se envía UNA notificación
 * por casilla al dueño, vía el sistema unificado de notificaciones (respeta la
 * preferencia de la categoría "CRM - Correos" y el opt-out global).
 *
 * El payload no incluye el cuerpo del mensaje: título = remitente y cuerpo =
 * asunto truncado (1 correo) o "N correos nuevos" (agrupado).
 */
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import { normalizeEmailAddress } from "@/lib/email-address";
import { captureEmailError } from "./email-observability";

const MAX_SCAN = 30;
const SUBJECT_MAX = 80;

/** Best-effort: nunca lanza — un push fallido no puede fallar el sync. */
export async function notifyNewInboundMail(params: {
  tenantId: string;
  emailAccountId: string;
  ownerUserId: string;
  ownEmail: string;
  /** Inicio de la corrida: solo cuentan mensajes INSERTADOS después de esto. */
  since: Date;
}): Promise<{ notified: number }> {
  try {
    const ownEmail = normalizeEmailAddress(params.ownEmail);
    const fresh = await prisma.crmEmailMessage.findMany({
      where: {
        tenantId: params.tenantId,
        emailAccountId: params.emailAccountId,
        direction: "in",
        createdAt: { gte: params.since },
        labelIds: { has: "INBOX" },
        NOT: { fromEmail: ownEmail },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_SCAN,
      select: { threadId: true, fromEmail: true, subject: true },
    });
    if (fresh.length === 0) return { notified: 0 };

    const single = fresh.length === 1 ? fresh[0] : null;
    let title: string;
    let body: string;
    let url: string;
    if (single) {
      const subject = (single.subject ?? "").trim() || "(sin asunto)";
      title = single.fromEmail || "Correo nuevo";
      body =
        subject.length > SUBJECT_MAX ? `${subject.slice(0, SUBJECT_MAX)}…` : subject;
      url = `/crm/correos?thread=${single.threadId}`;
    } else {
      title = `${fresh.length} correos nuevos`;
      body = "Tocá para abrir tu bandeja";
      url = "/crm/correos?folder=inbox";
    }

    await notify({
      tenantId: params.tenantId,
      type: "correo_nuevo",
      targetIds: [params.ownerUserId],
      targetType: "ADMIN",
      title,
      body,
      link: url,
      data: { emailAccountId: params.emailAccountId },
    });
    return { notified: fresh.length };
  } catch (error) {
    captureEmailError(error, {
      scope: "push-correo-nuevo",
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      level: "warning",
    });
    return { notified: 0 };
  }
}
