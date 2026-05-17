/**
 * Notifica al creador del assessment cuando el scoring termina.
 * Email vía Resend con link al detalle. Tolerante a fallos.
 */

import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { buildEmailUrl } from "@/lib/emails/site-url";

export async function notifyCreatorOfScored(
  assessmentId: string,
): Promise<void> {
  const a = await prisma.psychAssessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      tenantId: true,
      targetName: true,
      createdById: true,
      result: { select: { band: true, globalScore: true } },
    },
  });
  if (!a || !a.createdById) return;

  const creator = await prisma.admin.findFirst({
    where: { id: a.createdById, tenantId: a.tenantId, status: "active" },
    select: { email: true, name: true },
  });
  if (!creator?.email) return;

  const emailCfg = await getTenantEmailConfig(a.tenantId);
  const detailUrl = buildEmailUrl(`/personas/psicolaboral/${a.id}`);
  const band = a.result?.band ?? "—";
  const score = a.result?.globalScore?.toFixed(1) ?? "—";

  try {
    await resend.emails.send({
      from: emailCfg.from,
      to: creator.email,
      subject: `Evaluación psicolaboral lista: ${a.targetName}`,
      text: `Hola ${creator.name ?? ""},\n\nLa evaluación de ${a.targetName} está lista.\n\nScore global: ${score}\nBanda: ${band}\n\nVer resultado: ${detailUrl}`,
      html: `
        <p>Hola ${creator.name ?? ""},</p>
        <p>La evaluación de <b>${a.targetName}</b> está lista.</p>
        <ul>
          <li>Score global: <b>${score}</b></li>
          <li>Banda: <b>${band}</b></li>
        </ul>
        <p><a href="${detailUrl}">Ver resultado completo →</a></p>
      `,
      replyTo: emailCfg.replyTo || undefined,
    });
  } catch (err) {
    console.error("[psych/notify] email failed:", err);
  }
}
