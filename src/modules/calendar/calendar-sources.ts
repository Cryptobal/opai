/**
 * Resolutor de fuentes de agenda (OPAI + Google) y preferencias de color/visibilidad.
 */
import { prisma } from "@/lib/prisma";
import {
  getCalendarClientForAccount,
  listCalendarAccounts,
} from "@/lib/google-workspace/clients";
import {
  isValidPaletteKey,
  OPAI_SOURCE_DEFAULT_COLORS,
  type CalendarPaletteKey,
} from "@/lib/design/calendar-palette";
import type { calendar_v3 } from "googleapis";
import { isInsufficientScopeError } from "@/modules/agenda/google-events-helpers";

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
  accountColor?: string | null;
};

const OPAI_ORIGINS = ["cliente", "tecnica", "tareas", "licitaciones"] as const;
export type OpaiOrigin = (typeof OPAI_ORIGINS)[number];

const OPAI_LABELS: Record<OpaiOrigin, string> = {
  cliente: "Visitas cliente",
  tecnica: "Visitas técnicas",
  tareas: "Tareas",
  licitaciones: "Licitaciones",
};

const LIST_CACHE_TTL = 5 * 60_000;
const calendarListCache = new Map<
  string,
  { at: number; calendars: Array<{ id: string; summary: string; primary: boolean; accessRole: string | null }> }
>();

export function opaiSourceKey(origin: OpaiOrigin): string {
  return `opai:${origin}`;
}

export function googleSourceKey(accountId: string, calendarId: string): string {
  return `google:${accountId}:${calendarId}`;
}

export function parseGoogleSourceKey(
  sourceKey: string,
): { accountId: string; calendarId: string } | null {
  if (!sourceKey.startsWith("google:")) return null;
  const rest = sourceKey.slice("google:".length);
  const idx = rest.indexOf(":");
  if (idx <= 0) return null;
  return { accountId: rest.slice(0, idx), calendarId: rest.slice(idx + 1) };
}

async function listCalendarsForAccount(
  accountId: string,
  calendar: calendar_v3.Calendar,
): Promise<Array<{ id: string; summary: string; primary: boolean; accessRole: string | null }>> {
  const hit = calendarListCache.get(accountId);
  if (hit && Date.now() - hit.at < LIST_CACHE_TTL) return hit.calendars;

  const PRIMARY = [
    { id: "primary", summary: "primary", primary: true, accessRole: "owner" as string | null },
  ];
  try {
    const res = await calendar.calendarList.list({
      fields: "items(id,summary,selected,accessRole,primary)",
      maxResults: 50,
    });
    const readable = new Set(["owner", "writer", "reader"]);
    const items = (res.data.items ?? []).filter(
      (c) => c.id && c.selected !== false && (!c.accessRole || readable.has(c.accessRole)),
    );
    items.sort((a, b) => Number(!!b.primary) - Number(!!a.primary));
    const mapped = items.slice(0, 12).map((c) => ({
      id: c.id!,
      summary: c.summary?.trim() || c.id!,
      primary: !!c.primary,
      accessRole: c.accessRole ?? null,
    }));
    const calendars = mapped.length > 0 ? mapped : PRIMARY;
    calendarListCache.set(accountId, { at: Date.now(), calendars });
    return calendars;
  } catch (err) {
    if (isInsufficientScopeError(err)) {
      calendarListCache.set(accountId, { at: Date.now(), calendars: PRIMARY });
      return PRIMARY;
    }
    throw err;
  }
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
    const parsed = parseGoogleSourceKey(targetPref.sourceKey);
    if (parsed) {
      const account = await prisma.googleCalendarAccount.findFirst({
        where: {
          id: parsed.accountId,
          tenantId: p.tenantId,
          userId: p.userId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (account) return { accountId: account.id, calendarId: parsed.calendarId };
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

export async function listCalendarSources(p: {
  tenantId: string;
  userId: string;
}): Promise<CalendarSource[]> {
  const prefs = await prisma.calendarSourcePref.findMany({
    where: { tenantId: p.tenantId, userId: p.userId },
  });
  const prefByKey = new Map(prefs.map((pr) => [pr.sourceKey, pr]));

  const sources: CalendarSource[] = [];

  for (let i = 0; i < OPAI_ORIGINS.length; i++) {
    const origin = OPAI_ORIGINS[i];
    const sourceKey = opaiSourceKey(origin);
    const pref = prefByKey.get(sourceKey);
    const defaultColor = OPAI_SOURCE_DEFAULT_COLORS[origin];
    sources.push({
      sourceKey,
      kind: "opai",
      accountId: null,
      accountEmail: null,
      calendarId: null,
      name: OPAI_LABELS[origin],
      color: (pref?.color && isValidPaletteKey(pref.color) ? pref.color : defaultColor) as string,
      hidden: pref?.hidden ?? false,
      isCreateTarget: false,
      sortIndex: pref?.sortIndex ?? i,
    });
  }

  const accounts = await listCalendarAccounts(p.tenantId, p.userId);
  let googleSortBase = 100;

  for (const account of accounts) {
    const client = await getCalendarClientForAccount(p.tenantId, account.id);
    let calendars: Array<{
      id: string;
      summary: string;
      primary: boolean;
      accessRole: string | null;
    }> = [{ id: "primary", summary: "primary", primary: true, accessRole: "owner" }];

    if (client) {
      try {
        calendars = await listCalendarsForAccount(account.id, client.calendar);
      } catch (err) {
        console.warn("[calendar-sources] listCalendars falló:", account.id, err);
      }
    }

    const accountColor = account.color && isValidPaletteKey(account.color) ? account.color : "teal";

    for (const cal of calendars) {
      const sourceKey = googleSourceKey(account.id, cal.id);
      const pref = prefByKey.get(sourceKey);
      const color =
        (pref?.color && isValidPaletteKey(pref.color) ? pref.color : null) ?? accountColor;
      sources.push({
        sourceKey,
        kind: "google",
        accountId: account.id,
        accountEmail: account.googleEmail,
        calendarId: cal.id,
        name: cal.primary ? account.googleEmail : cal.summary,
        color,
        hidden: pref?.hidden ?? false,
        isCreateTarget: pref?.isCreateTarget ?? false,
        sortIndex: pref?.sortIndex ?? googleSortBase++,
        accessRole: cal.accessRole,
        accountStatus: client ? account.status : "ERROR",
        accountColor,
      });
    }
  }

  // Si no hay destino marcado y hay calendarios writable, no forzar aquí —
  // resolveCreateTarget cae al primary de la cuenta default.
  return sources;
}

export async function updateCalendarSourcePref(p: {
  tenantId: string;
  userId: string;
  sourceKey: string;
  color?: string;
  hidden?: boolean;
  isCreateTarget?: boolean;
  sortIndex?: number;
}): Promise<CalendarSource> {
  const sources = await listCalendarSources({
    tenantId: p.tenantId,
    userId: p.userId,
  });
  const source = sources.find((s) => s.sourceKey === p.sourceKey);
  if (!source) {
    throw new Error("SOURCE_NOT_FOUND");
  }

  if (p.color !== undefined && !isValidPaletteKey(p.color)) {
    throw new Error("INVALID_COLOR");
  }

  if (p.isCreateTarget === true) {
    if (source.kind !== "google") throw new Error("CREATE_TARGET_OPAI");
    if (source.accessRole === "reader") throw new Error("CREATE_TARGET_READONLY");
  }

  await prisma.$transaction(async (tx) => {
    if (p.isCreateTarget === true) {
      await tx.calendarSourcePref.updateMany({
        where: {
          tenantId: p.tenantId,
          userId: p.userId,
          isCreateTarget: true,
          NOT: { sourceKey: p.sourceKey },
        },
        data: { isCreateTarget: false },
      });
    }

    await tx.calendarSourcePref.upsert({
      where: {
        tenantId_userId_sourceKey: {
          tenantId: p.tenantId,
          userId: p.userId,
          sourceKey: p.sourceKey,
        },
      },
      create: {
        tenantId: p.tenantId,
        userId: p.userId,
        sourceKey: p.sourceKey,
        color: p.color ?? source.color,
        hidden: p.hidden ?? source.hidden,
        isCreateTarget: p.isCreateTarget ?? false,
        sortIndex: p.sortIndex ?? source.sortIndex,
      },
      update: {
        ...(p.color !== undefined ? { color: p.color } : {}),
        ...(p.hidden !== undefined ? { hidden: p.hidden } : {}),
        ...(p.isCreateTarget !== undefined ? { isCreateTarget: p.isCreateTarget } : {}),
        ...(p.sortIndex !== undefined ? { sortIndex: p.sortIndex } : {}),
      },
    });
  });

  const refreshed = await listCalendarSources({
    tenantId: p.tenantId,
    userId: p.userId,
  });
  const next = refreshed.find((s) => s.sourceKey === p.sourceKey);
  if (!next) throw new Error("SOURCE_NOT_FOUND");
  return next;
}

/** Cambia el color de una cuenta y arrastra calendarios que aún heredaban. */
export async function updateAccountColor(p: {
  tenantId: string;
  userId: string;
  accountId: string;
  color: CalendarPaletteKey;
}): Promise<void> {
  const account = await prisma.googleCalendarAccount.findFirst({
    where: {
      id: p.accountId,
      tenantId: p.tenantId,
      userId: p.userId,
      status: "ACTIVE",
    },
  });
  if (!account) throw new Error("ACCOUNT_NOT_FOUND");

  const oldColor = account.color;
  await prisma.googleCalendarAccount.update({
    where: { id: account.id },
    data: { color: p.color },
  });

  const sources = await listCalendarSources({
    tenantId: p.tenantId,
    userId: p.userId,
  });
  const inherited = sources.filter(
    (s) =>
      s.kind === "google" &&
      s.accountId === p.accountId &&
      s.color === (oldColor || "teal"),
  );

  for (const s of inherited) {
    const pref = await prisma.calendarSourcePref.findUnique({
      where: {
        tenantId_userId_sourceKey: {
          tenantId: p.tenantId,
          userId: p.userId,
          sourceKey: s.sourceKey,
        },
      },
    });
    // Solo arrastra si no hay pref explícita de color, o el color coincidía con el de cuenta.
    if (!pref?.color || pref.color === oldColor) {
      await prisma.calendarSourcePref.upsert({
        where: {
          tenantId_userId_sourceKey: {
            tenantId: p.tenantId,
            userId: p.userId,
            sourceKey: s.sourceKey,
          },
        },
        create: {
          tenantId: p.tenantId,
          userId: p.userId,
          sourceKey: s.sourceKey,
          color: p.color,
          hidden: pref?.hidden ?? false,
          isCreateTarget: pref?.isCreateTarget ?? false,
          sortIndex: pref?.sortIndex ?? s.sortIndex,
        },
        update: { color: p.color },
      });
    }
  }
}

/** Siembra prefs desde hiddenSources legacy de localStorage (una vez). */
export async function seedHiddenFromLegacy(p: {
  tenantId: string;
  userId: string;
  legacyKeys: string[];
}): Promise<void> {
  const map: Record<string, string> = {
    cliente: opaiSourceKey("cliente"),
    tecnica: opaiSourceKey("tecnica"),
    tareas: opaiSourceKey("tareas"),
    licitaciones: opaiSourceKey("licitaciones"),
  };
  for (const key of p.legacyKeys) {
    const sourceKey = map[key];
    if (!sourceKey) continue;
    await prisma.calendarSourcePref.upsert({
      where: {
        tenantId_userId_sourceKey: {
          tenantId: p.tenantId,
          userId: p.userId,
          sourceKey,
        },
      },
      create: {
        tenantId: p.tenantId,
        userId: p.userId,
        sourceKey,
        hidden: true,
      },
      update: { hidden: true },
    });
  }
}
