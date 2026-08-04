import { prisma } from "@/lib/prisma";

/**
 * Mensaje canónico al desconectar Google Calendar. El OAuth callback y el
 * retry de links lo usan para reactivar vínculos que quedaron en ERROR.
 */
export const GOOGLE_CALENDAR_DISCONNECT_ERROR =
  "Cuenta de Google Calendar desconectada por el usuario";

/**
 * Tras reconectar una cuenta: pasa a PENDING los AgendaEventLink /
 * CalendarProviderLink marcados ERROR por disconnect, para que el retry
 * post-OAuth los vuelva a materializar en Google.
 */
export async function reactivateDisconnectedCalendarLinks(
  tenantId: string,
  accountId: string,
): Promise<{ agendaLinks: number; providerLinks: number }> {
  const [agenda, provider] = await Promise.all([
    prisma.agendaEventLink.updateMany({
      where: {
        tenantId,
        calendarAccountId: accountId,
        syncStatus: "ERROR",
        lastError: GOOGLE_CALENDAR_DISCONNECT_ERROR,
      },
      data: { syncStatus: "PENDING", lastError: null },
    }),
    prisma.calendarProviderLink.updateMany({
      where: {
        tenantId,
        provider: "google",
        providerAccountId: accountId,
        syncStatus: "ERROR",
        lastError: GOOGLE_CALENDAR_DISCONNECT_ERROR,
      },
      data: { syncStatus: "PENDING", lastError: null },
    }),
  ]);
  return { agendaLinks: agenda.count, providerLinks: provider.count };
}
