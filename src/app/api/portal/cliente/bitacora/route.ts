/**
 * GET /api/portal/cliente/bitacora
 *
 * Timeline unificado de eventos relevantes del servicio: rondas, marcaciones,
 * tickets, visitas de supervisión e incidentes. Paralelizado, sanitizado,
 * ordenado descendente por fecha y paginado por cursor.
 *
 * Privacidad: usa `sanitizeGuardName` en cualquier guardia referenciado.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalClienteAuth,
  sanitizeGuardName,
} from "@/lib/portal-cliente";

export const dynamic = "force-dynamic";

type EventType =
  | "ronda_completada"
  | "ronda_incompleta"
  | "marcacion_entrada"
  | "marcacion_salida"
  | "ticket_creado"
  | "ticket_resuelto"
  | "supervision_realizada"
  | "incidente_reportado";

interface TimelineEvent {
  id: string;
  type: EventType;
  timestamp: string;
  installationId: string | null;
  installationName: string | null;
  title: string;
  detail: string | null;
  icon: string;
  severity: "info" | "success" | "warning" | "critical";
  guardiaName: string | null;
  link: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const installationParam = searchParams.get("installationId");
    const typesParam = searchParams.get("types");
    const limit = Math.min(Number(searchParams.get("limit") ?? 100) || 100, 200);

    const now = new Date();
    const hastaDate = hasta ? new Date(hasta) : now;
    const desdeDate = desde
      ? new Date(desde)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const installationIds = (
      installationParam && session.installationIds.includes(installationParam)
        ? [installationParam]
        : session.installationIds
    ) ?? [];

    if (installationIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { events: [], nextCursor: null },
      });
    }

    const typesFilter = typesParam
      ? new Set(typesParam.split(",").map((t) => t.trim()))
      : null;

    const installationsInfo = await prisma.crmInstallation.findMany({
      where: { id: { in: installationIds } },
      select: { id: true, name: true },
    });
    const instMap = new Map(installationsInfo.map((i) => [i.id, i.name]));

    const [rondas, marcaciones, tickets, supervisions, incidentes] =
      await Promise.all([
        prisma.opsRondaEjecucion.findMany({
          where: {
            tenantId: session.tenantId,
            installationId: { in: installationIds },
            completedAt: { gte: desdeDate, lte: hastaDate },
            status: { in: ["completed", "incomplete", "completada"] },
          },
          select: {
            id: true,
            installationId: true,
            status: true,
            completedAt: true,
            trustScore: true,
            guardia: {
              select: { persona: { select: { firstName: true, lastName: true } } },
            },
          },
          take: limit,
          orderBy: { completedAt: "desc" },
        }),
        prisma.opsMarcacion.findMany({
          where: {
            tenantId: session.tenantId,
            installationId: { in: installationIds },
            createdAt: { gte: desdeDate, lte: hastaDate },
          },
          select: {
            id: true,
            tipo: true,
            installationId: true,
            createdAt: true,
            geoValidada: true,
            guardia: {
              select: { persona: { select: { firstName: true, lastName: true } } },
            },
          },
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.opsTicket.findMany({
          where: {
            tenantId: session.tenantId,
            installationId: { in: installationIds },
            OR: [
              { createdAt: { gte: desdeDate, lte: hastaDate } },
              { resolvedAt: { gte: desdeDate, lte: hastaDate } },
            ],
          },
          select: {
            id: true,
            installationId: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            resolvedAt: true,
          },
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.opsVisitaSupervision.findMany({
          where: {
            tenantId: session.tenantId,
            installationId: { in: installationIds },
            checkOutAt: { gte: desdeDate, lte: hastaDate },
            status: { in: ["completed", "completada"] },
          },
          select: {
            id: true,
            installationId: true,
            checkInAt: true,
            checkOutAt: true,
            healthScore: true,
            supervisor: { select: { name: true } },
          },
          take: limit,
          orderBy: { checkOutAt: "desc" },
        }),
        prisma.opsRondaIncidente.findMany({
          where: {
            tenantId: session.tenantId,
            installationId: { in: installationIds },
            createdAt: { gte: desdeDate, lte: hastaDate },
          },
          select: {
            id: true,
            installationId: true,
            tipo: true,
            descripcion: true,
            createdAt: true,
            status: true,
            guardia: {
              select: { persona: { select: { firstName: true, lastName: true } } },
            },
          },
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const events: TimelineEvent[] = [];
    const nameOf = (p: { firstName: string | null; lastName: string | null } | null) =>
      p ? sanitizeGuardName(p.firstName ?? "", p.lastName ?? "") || null : null;

    for (const r of rondas) {
      if (!r.completedAt) continue;
      const isCompleted = r.status === "completed" || r.status === "completada";
      events.push({
        id: `ronda_${r.id}`,
        type: isCompleted ? "ronda_completada" : "ronda_incompleta",
        timestamp: r.completedAt.toISOString(),
        installationId: r.installationId ?? null,
        installationName: r.installationId
          ? (instMap.get(r.installationId) ?? null)
          : null,
        title: isCompleted
          ? "Ronda completada"
          : "Ronda completada con observaciones",
        detail: r.trustScore != null ? `Trust Score ${r.trustScore}` : null,
        icon: "MapPin",
        severity: isCompleted ? "success" : "warning",
        guardiaName: nameOf(r.guardia?.persona ?? null),
        link: "/portal/cliente?section=rondas",
      });
    }

    for (const m of marcaciones) {
      events.push({
        id: `marc_${m.id}`,
        type: m.tipo === "salida" ? "marcacion_salida" : "marcacion_entrada",
        timestamp: m.createdAt.toISOString(),
        installationId: m.installationId,
        installationName: instMap.get(m.installationId) ?? null,
        title:
          m.tipo === "salida" ? "Marcación de salida" : "Marcación de entrada",
        detail: m.geoValidada ? "GPS válido" : "GPS no validado",
        icon: m.tipo === "salida" ? "LogOut" : "LogIn",
        severity: m.geoValidada ? "info" : "warning",
        guardiaName: nameOf(m.guardia?.persona ?? null),
        link: "/portal/cliente?section=marcaciones",
      });
    }

    for (const t of tickets) {
      events.push({
        id: `tck_${t.id}`,
        type: "ticket_creado",
        timestamp: t.createdAt.toISOString(),
        installationId: t.installationId ?? null,
        installationName: t.installationId
          ? (instMap.get(t.installationId) ?? null)
          : null,
        title: `Ticket creado · ${t.title}`,
        detail: `Prioridad ${t.priority}`,
        icon: "Ticket",
        severity:
          t.priority === "high" || t.priority === "critical"
            ? "warning"
            : "info",
        guardiaName: null,
        link: "/portal/cliente?section=tickets",
      });
      if (t.resolvedAt) {
        events.push({
          id: `tck_res_${t.id}`,
          type: "ticket_resuelto",
          timestamp: t.resolvedAt.toISOString(),
          installationId: t.installationId ?? null,
          installationName: t.installationId
            ? (instMap.get(t.installationId) ?? null)
            : null,
          title: `Ticket resuelto · ${t.title}`,
          detail: null,
          icon: "CheckCircle2",
          severity: "success",
          guardiaName: null,
          link: "/portal/cliente?section=tickets",
        });
      }
    }

    for (const s of supervisions) {
      events.push({
        id: `sup_${s.id}`,
        type: "supervision_realizada",
        timestamp: (s.checkOutAt ?? s.checkInAt).toISOString(),
        installationId: s.installationId,
        installationName: instMap.get(s.installationId) ?? null,
        title: "Supervisión realizada",
        detail:
          s.healthScore != null
            ? `Score ${s.healthScore}`
            : (s.supervisor?.name ?? null),
        icon: "Eye",
        severity:
          s.healthScore != null && s.healthScore < 60 ? "warning" : "info",
        guardiaName: null,
        link: "/portal/cliente?section=supervision",
      });
    }

    for (const inc of incidentes) {
      events.push({
        id: `inc_${inc.id}`,
        type: "incidente_reportado",
        timestamp: inc.createdAt.toISOString(),
        installationId: inc.installationId ?? null,
        installationName: inc.installationId
          ? (instMap.get(inc.installationId) ?? null)
          : null,
        title: `Incidente: ${inc.tipo}`,
        detail: inc.descripcion.slice(0, 140),
        icon: "AlertTriangle",
        severity: inc.status === "abierto" ? "critical" : "warning",
        guardiaName: nameOf(inc.guardia?.persona ?? null),
        link: "/portal/cliente?section=rondas",
      });
    }

    const filtered = typesFilter
      ? events.filter((e) => typesFilter.has(e.type))
      : events;

    filtered.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    const sliced = filtered.slice(0, limit);

    return NextResponse.json({
      success: true,
      data: { events: sliced, nextCursor: null },
    });
  } catch (error) {
    console.error("[portal-cliente/bitacora] error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
