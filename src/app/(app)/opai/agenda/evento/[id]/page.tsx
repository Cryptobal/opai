import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Deep link canónico de un evento de agenda (push/email/Slack apuntan acá).
 * Resuelve el id contra el modelo v2 (CalendarEvent) o legacy (AgendaVisita —
 * comparten id cuando el evento nació como visita) y abre la página Agenda
 * con el detalle correspondiente vía query interna.
 */
export default async function AgendaEventoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect(`/opai/login?callbackUrl=/opai/agenda/evento/${id}`);
  }
  const tenantId = session.user.tenantId;

  let target = "/opai/agenda";
  try {
    const visita = await prisma.agendaVisita.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (visita) {
      target = `/opai/agenda?visita=${id}`;
    } else {
      const event = await prisma.calendarEvent.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (event) target = `/opai/agenda?evento=${id}`;
    }
  } catch {
    // id con formato inválido (no uuid) → agenda sin detalle
  }
  redirect(target);
}
