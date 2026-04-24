/**
 * GET /api/portal/cliente/search?q=<texto>
 *
 * Search global del portal cliente: busca en instalaciones, guardias activos
 * asignados, tickets recientes y reportes generados. Todo scoped al tenant +
 * accountId de la sesión.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalClienteAuth,
  sanitizeGuardName,
} from "@/lib/portal-cliente";

export const dynamic = "force-dynamic";

const STATIC_SECTIONS = [
  {
    id: "dashboard",
    title: "Dashboard",
    hint: "Vista general del servicio",
    icon: "LayoutDashboard",
  },
  {
    id: "rondas",
    title: "Rondas",
    hint: "Rondas en tiempo real",
    icon: "MapPin",
  },
  {
    id: "marcaciones",
    title: "Marcaciones",
    hint: "Entradas y salidas Face ID",
    icon: "UserCheck",
  },
  {
    id: "personal",
    title: "Equipo",
    hint: "Guardias asignados",
    icon: "Users",
  },
  {
    id: "tickets",
    title: "Tickets",
    hint: "Tickets de soporte",
    icon: "Ticket",
  },
  {
    id: "reportes",
    title: "Reportes",
    hint: "Reportes y exportaciones",
    icon: "BarChart3",
  },
  {
    id: "bitacora",
    title: "Bitácora ejecutiva",
    hint: "Timeline unificado",
    icon: "BookOpen",
  },
  {
    id: "supervision",
    title: "Supervisión",
    hint: "Visitas de supervisión",
    icon: "Eye",
  },
];

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
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(Number(searchParams.get("limit") ?? 20) || 20, 40);

    const secciones = STATIC_SECTIONS.filter((s) =>
      q.length === 0
        ? true
        : s.title.toLowerCase().includes(q.toLowerCase()) ||
          s.hint.toLowerCase().includes(q.toLowerCase()),
    );

    if (q.length < 2) {
      return NextResponse.json({
        success: true,
        data: {
          sections: secciones.map((s) => ({ type: "section" as const, ...s })),
          instalaciones: [],
          guardias: [],
          tickets: [],
          reportes: [],
        },
      });
    }

    const installationIds = session.installationIds ?? [];
    const term = q.toLowerCase();
    const since90 = new Date(Date.now() - 90 * 86400_000);
    const since12m = new Date(Date.now() - 365 * 86400_000);

    const [installations, guardias, tickets, reportes] = await Promise.all([
      prisma.crmInstallation.findMany({
        where: {
          id: { in: installationIds },
          tenantId: session.tenantId,
          name: { contains: q, mode: "insensitive" },
        },
        select: { id: true, name: true, commune: true },
        take: limit,
      }),
      installationIds.length > 0
        ? prisma.opsGuardia.findMany({
            where: {
              tenantId: session.tenantId,
              currentInstallationId: { in: installationIds },
              status: "active",
              OR: [
                {
                  persona: {
                    firstName: { contains: q, mode: "insensitive" },
                  },
                },
                {
                  persona: {
                    lastName: { contains: q, mode: "insensitive" },
                  },
                },
              ],
            },
            select: {
              id: true,
              currentInstallationId: true,
              persona: { select: { firstName: true, lastName: true } },
            },
            take: limit,
          })
        : Promise.resolve([]),
      prisma.opsTicket.findMany({
        where: {
          tenantId: session.tenantId,
          installationId: { in: installationIds },
          createdAt: { gte: since90 },
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          createdAt: true,
        },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.portalClienteReporte.findMany({
        where: {
          tenantId: session.tenantId,
          accountId: session.accountId,
          createdAt: { gte: since12m },
          OR: [
            { type: { contains: term } },
            { period: { contains: q } },
          ],
        },
        select: { id: true, type: true, period: true, createdAt: true },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        sections: secciones.map((s) => ({ type: "section" as const, ...s })),
        instalaciones: installations.map((i) => ({
          type: "instalacion" as const,
          id: i.id,
          title: i.name,
          subtitle: i.commune ?? "",
        })),
        guardias: guardias.map((g) => ({
          type: "guardia" as const,
          id: g.id,
          title:
            sanitizeGuardName(
              g.persona.firstName ?? "",
              g.persona.lastName ?? "",
            ) || "Guardia",
          subtitle: "",
        })),
        tickets: tickets.map((t) => ({
          type: "ticket" as const,
          id: t.id,
          title: t.title,
          subtitle: `${t.code} · ${t.status}`,
          status: t.status,
        })),
        reportes: reportes.map((r) => ({
          type: "reporte" as const,
          id: r.id,
          title: r.type,
          subtitle: r.period,
        })),
      },
    });
  } catch (error) {
    console.error("[portal-cliente/search] error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
