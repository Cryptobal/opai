import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_PORTALS = ["guardia", "rondas", "cliente", "supervisor"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  const { searchParams } = new URL(request.url);
  const portalType = searchParams.get("portal") ?? "cliente";
  const days = Math.min(Number(searchParams.get("days") || 30), 365);

  if (!VALID_PORTALS.includes(portalType)) {
    return NextResponse.json({ success: true, data: [] });
  }

  const since = new Date(Date.now() - days * 86_400_000);

  try {
    if (portalType === "rondas") return handleRondas(tenantId, since);
    if (portalType === "guardia") return handleGuardia(tenantId, since);
    if (portalType === "cliente") return handleCliente(tenantId, since);
    if (portalType === "supervisor") return handleSupervisor(tenantId, since);
    return NextResponse.json({ success: true, data: [] });
  } catch (error) {
    console.error("[Portales Ranking] Error:", error);
    return NextResponse.json({ success: false, error: "Error al obtener ranking" }, { status: 500 });
  }
}

async function handleRondas(tenantId: string, since: Date) {
  const ejecuciones = await prisma.opsRondaEjecucion.groupBy({
    by: ["guardiaId", "installationId"],
    where: {
      tenantId,
      startedAt: { gte: since },
      guardiaId: { not: null },
      status: { in: ["completada", "incompleta", "en_curso", "cerrada_auto", "cerrada_admin"] },
    },
    _count: { id: true },
    _max: { startedAt: true },
    orderBy: { _count: { id: "desc" } },
    take: 50,
  });

  if (ejecuciones.length === 0) return NextResponse.json({ success: true, data: [] });

  const guardIds = [...new Set(ejecuciones.map((e) => e.guardiaId!))];
  const instIds = [...new Set(ejecuciones.map((e) => e.installationId).filter(Boolean) as string[])];

  const [guardias, installations] = await Promise.all([
    prisma.opsGuardia.findMany({
      where: { id: { in: guardIds } },
      select: { id: true, code: true, persona: { select: { firstName: true, lastName: true } } },
    }),
    instIds.length > 0
      ? prisma.crmInstallation.findMany({
          where: { id: { in: instIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const guardMap = new Map(guardias.map((g) => [g.id, g]));
  const instMap = new Map(installations.map((i) => [i.id, i]));

  const byGuard = new Map<string, { totalRondas: number; lastAt: Date | null; installationId: string | null }>();
  for (const e of ejecuciones) {
    const gid = e.guardiaId!;
    const prev = byGuard.get(gid);
    if (!prev) {
      byGuard.set(gid, { totalRondas: e._count.id, lastAt: e._max.startedAt, installationId: e.installationId });
    } else {
      prev.totalRondas += e._count.id;
      if (e._max.startedAt && (!prev.lastAt || e._max.startedAt > prev.lastAt)) {
        prev.lastAt = e._max.startedAt;
        prev.installationId = e.installationId;
      }
    }
  }

  const data = [...byGuard.entries()]
    .sort((a, b) => b[1].totalRondas - a[1].totalRondas)
    .map(([guardiaId, info]) => {
      const guard = guardMap.get(guardiaId);
      const inst = info.installationId ? instMap.get(info.installationId) : null;
      return {
        userId: guardiaId,
        userName: guard ? [guard.persona.firstName, guard.persona.lastName].filter(Boolean).join(" ") : "Desconocido",
        userCode: guard?.code ?? null,
        installationId: info.installationId,
        installationName: inst?.name ?? null,
        totalActions: info.totalRondas,
        actionLabel: "rondas",
        lastAccessAt: info.lastAt?.toISOString() ?? null,
      };
    });

  return NextResponse.json({ success: true, data });
}

async function handleGuardia(tenantId: string, since: Date) {
  const tickets = await prisma.opsTicket.groupBy({
    by: ["guardiaId"],
    where: {
      tenantId,
      source: "portal",
      createdAt: { gte: since },
      guardiaId: { not: null },
    },
    _count: { id: true },
    _max: { createdAt: true },
  });

  type LoginCountRow = { userId: string; _count: { id: number }; _max: { createdAt: Date | null } };
  let loginCounts: LoginCountRow[] = [];
  try {
    // @ts-expect-error - Prisma groupBy tiene un bug de tipos conocido (prisma/prisma#17297)
    loginCounts = await prisma.portalAccessLog.groupBy({
      by: ["userId"],
      where: {
        tenantId,
        portalType: "guardia",
        action: "login",
        createdAt: { gte: since },
      },
      _count: { id: true },
      _max: { createdAt: true },
    });
  } catch {}

  const byGuard = new Map<string, { tickets: number; logins: number; lastAt: Date | null }>();

  for (const t of tickets) {
    const gid = t.guardiaId!;
    byGuard.set(gid, { tickets: t._count.id, logins: 0, lastAt: t._max.createdAt });
  }
  for (const l of loginCounts) {
    const prev = byGuard.get(l.userId);
    if (prev) {
      prev.logins = l._count.id;
      if (l._max.createdAt && (!prev.lastAt || l._max.createdAt > prev.lastAt)) {
        prev.lastAt = l._max.createdAt;
      }
    } else {
      byGuard.set(l.userId, { tickets: 0, logins: l._count.id, lastAt: l._max.createdAt });
    }
  }

  if (byGuard.size === 0) return NextResponse.json({ success: true, data: [] });

  const guardIds = [...byGuard.keys()];
  const guardias = await prisma.opsGuardia.findMany({
    where: { id: { in: guardIds } },
    select: {
      id: true,
      code: true,
      persona: { select: { firstName: true, lastName: true } },
      currentInstallation: { select: { id: true, name: true } },
    },
  });
  const guardMap = new Map(guardias.map((g) => [g.id, g]));

  const data = [...byGuard.entries()]
    .sort((a, b) => (b[1].tickets + b[1].logins) - (a[1].tickets + a[1].logins))
    .slice(0, 50)
    .map(([guardiaId, info]) => {
      const guard = guardMap.get(guardiaId);
      return {
        userId: guardiaId,
        userName: guard ? [guard.persona.firstName, guard.persona.lastName].filter(Boolean).join(" ") : "Desconocido",
        userCode: guard?.code ?? null,
        installationId: guard?.currentInstallation?.id ?? null,
        installationName: guard?.currentInstallation?.name ?? null,
        totalActions: info.tickets + info.logins,
        totalLogins: info.logins,
        totalTickets: info.tickets,
        actionLabel: "acciones",
        lastAccessAt: info.lastAt?.toISOString() ?? null,
      };
    });

  return NextResponse.json({ success: true, data });
}

async function handleCliente(tenantId: string, since: Date) {
  const auditLogs = await prisma.portalClienteAuditLog.groupBy({
    by: ["contactId"],
    where: {
      tenantId,
      createdAt: { gte: since },
    },
    _count: { id: true },
    _max: { createdAt: true },
  });

  let portalLogins: { userId: string; _count: { id: number } }[] = [];
  let portalQuoteViews: { userId: string; _count: { id: number } }[] = [];
  try {
    const contactIds = auditLogs.map((a) => a.contactId);
    if (contactIds.length > 0) {
      // @ts-expect-error - Prisma groupBy tiene un bug de tipos conocido (prisma/prisma#17297)
      [portalLogins, portalQuoteViews] = await Promise.all([
        prisma.portalAccessLog.groupBy({
          by: ["userId"],
          where: { tenantId, portalType: "cliente", action: "login", createdAt: { gte: since }, userId: { in: contactIds } },
          _count: { id: true },
        }),
        prisma.portalAccessLog.groupBy({
          by: ["userId"],
          where: { tenantId, portalType: "cliente", action: "view_quote", createdAt: { gte: since }, userId: { in: contactIds } },
          _count: { id: true },
        }),
      ]);
    }
  } catch {}

  const loginMap = new Map(portalLogins.map((l) => [l.userId, l._count.id]));
  const viewMap = new Map(portalQuoteViews.map((v) => [v.userId, v._count.id]));

  if (auditLogs.length === 0 && portalLogins.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const allContactIds = [...new Set([...auditLogs.map((a) => a.contactId), ...portalLogins.map((l) => l.userId)])];
  const contacts = await prisma.crmContact.findMany({
    where: { id: { in: allContactIds } },
    select: { id: true, firstName: true, lastName: true, accountId: true },
  });
  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  const accIds = [...new Set(contacts.map((c) => c.accountId).filter(Boolean) as string[])];
  const accounts = accIds.length > 0
    ? await prisma.crmAccount.findMany({
        where: { id: { in: accIds } },
        select: { id: true, name: true, status: true },
      })
    : [];
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const byContact = new Map<string, { totalActions: number; logins: number; quoteViews: number; lastAt: Date | null }>();
  for (const a of auditLogs) {
    byContact.set(a.contactId, {
      totalActions: a._count.id,
      logins: loginMap.get(a.contactId) ?? 0,
      quoteViews: viewMap.get(a.contactId) ?? 0,
      lastAt: a._max.createdAt,
    });
  }
  for (const l of portalLogins) {
    if (!byContact.has(l.userId)) {
      byContact.set(l.userId, {
        totalActions: l._count.id,
        logins: l._count.id,
        quoteViews: viewMap.get(l.userId) ?? 0,
        lastAt: null,
      });
    }
  }

  const data = [...byContact.entries()]
    .sort((a, b) => b[1].totalActions - a[1].totalActions)
    .slice(0, 50)
    .map(([contactId, info]) => {
      const contact = contactMap.get(contactId);
      const account = contact?.accountId ? accountMap.get(contact.accountId) : null;
      return {
        userId: contactId,
        userName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : "Desconocido",
        accountId: contact?.accountId ?? null,
        accountName: account?.name ?? null,
        isProspect: account?.status === "prospect",
        totalActions: info.totalActions,
        totalLogins: info.logins,
        totalQuoteViews: info.quoteViews,
        actionLabel: "acciones",
        lastAccessAt: info.lastAt?.toISOString() ?? null,
      };
    });

  return NextResponse.json({ success: true, data });
}

async function handleSupervisor(tenantId: string, since: Date) {
  const visitas = await prisma.opsVisitaSupervision.groupBy({
    by: ["supervisorId"],
    where: {
      tenantId,
      checkInAt: { gte: since },
      status: { in: ["completed", "in_progress"] },
    },
    _count: { id: true },
    _max: { checkInAt: true },
  });

  if (visitas.length === 0) return NextResponse.json({ success: true, data: [] });

  const supervisorIds = visitas.map((v) => v.supervisorId);

  const admins = await prisma.admin.findMany({
    where: { id: { in: supervisorIds } },
    select: { id: true, name: true, email: true },
  });
  const adminMap = new Map(admins.map((a) => [a.id, a]));

  const data = visitas
    .sort((a, b) => b._count.id - a._count.id)
    .slice(0, 50)
    .map((v) => {
      const admin = adminMap.get(v.supervisorId);
      return {
        userId: v.supervisorId,
        userName: admin?.name ?? admin?.email ?? "Desconocido",
        totalActions: v._count.id,
        actionLabel: "visitas",
        lastAccessAt: v._max.checkInAt?.toISOString() ?? null,
      };
    });

  return NextResponse.json({ success: true, data });
}
