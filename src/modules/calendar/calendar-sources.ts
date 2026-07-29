/**
 * Resolutor de fuentes de agenda (OPAI + Google) y preferencias de color/visibilidad.
 * Expandido en bloque 7; aquí solo el destino de creación usado por el push.
 */
import { prisma } from "@/lib/prisma";

export type CalendarSource = {
  sourceKey: string;
  kind: "opai" | "google";
  accountId: string | null;
  accountEmail: string | null;
  calendarId: string | null;
  name: string;
  color: string;
  hidden: boolean;
  isCreateTarget: boolean;
  sortIndex: number;
  accessRole?: string | null;
  accountStatus?: string;
};

export function opaiSourceKey(
  origin: "cliente" | "tecnica" | "tareas" | "licitaciones",
): string {
  return `opai:${origin}`;
}

export function googleSourceKey(accountId: string, calendarId: string): string {
  return `google:${accountId}:${calendarId}`;
}

/**
 * Calendario destino de creación del usuario.
 * Pref explícita → primary de la cuenta isDefault → primary de la más antigua.
 */
export async function resolveCreateTarget(p: {
  tenantId: string;
  userId: string;
}): Promise<{ accountId: string; calendarId: string } | null> {
  const targetPref = await prisma.calendarSourcePref.findFirst({
    where: {
      tenantId: p.tenantId,
      userId: p.userId,
      isCreateTarget: true,
      sourceKey: { startsWith: "google:" },
    },
  });
  if (targetPref) {
    const parts = targetPref.sourceKey.split(":");
    // google:{accountId}:{calendarId} — calendarId puede contener ':'
    if (parts.length >= 3 && parts[0] === "google") {
      const accountId = parts[1];
      const calendarId = parts.slice(2).join(":");
      const account = await prisma.googleCalendarAccount.findFirst({
        where: {
          id: accountId,
          tenantId: p.tenantId,
          userId: p.userId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (account) return { accountId: account.id, calendarId };
    }
  }

  const account = await prisma.googleCalendarAccount.findFirst({
    where: { tenantId: p.tenantId, userId: p.userId, status: "ACTIVE" },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }, { sortIndex: "asc" }],
    select: { id: true, calendarId: true },
  });
  if (!account) return null;
  return { accountId: account.id, calendarId: account.calendarId || "primary" };
}
