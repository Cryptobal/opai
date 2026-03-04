import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ClienteSession } from "@/lib/portal-cliente";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("portal_cliente_session")?.value;
  if (!raw) return NextResponse.json({ error: "No session" }, { status: 401 });

  let session: ClienteSession;
  try {
    session = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") ?? "rondas_cumplimiento";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Get all active installations for this account
  const installations = await prisma.crmInstallation.findMany({
    where: {
      accountId: session.accountId,
      tenantId: session.tenantId,
      isActive: true,
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (installations.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to);
  const hasDateFilter = Object.keys(dateFilter).length > 0;

  const results: Array<{ installationId: string; installationName: string; value: number }> = [];

  if (metric === "rondas_cumplimiento") {
    // For each installation, count total and completed ejecuciones in range
    for (const inst of installations) {
      const whereBase = {
        tenantId: session.tenantId,
        installationId: inst.id,
        ...(hasDateFilter ? { scheduledAt: dateFilter } : {}),
      };

      const [total, completed] = await Promise.all([
        prisma.opsRondaEjecucion.count({ where: whereBase }),
        prisma.opsRondaEjecucion.count({
          where: { ...whereBase, status: "completada" },
        }),
      ]);

      results.push({
        installationId: inst.id,
        installationName: inst.name,
        value: total > 0 ? Math.round((completed / total) * 100) : 0,
      });
    }
  } else if (metric === "tickets") {
    // Count tickets per installation in range
    for (const inst of installations) {
      const count = await prisma.opsTicket.count({
        where: {
          tenantId: session.tenantId,
          installationId: inst.id,
          ...(hasDateFilter ? { createdAt: dateFilter } : {}),
        },
      });

      results.push({
        installationId: inst.id,
        installationName: inst.name,
        value: count,
      });
    }
  } else if (metric === "asistencia") {
    // Count present / total OpsAsistenciaDiaria per installation
    for (const inst of installations) {
      const whereBase = {
        tenantId: session.tenantId,
        installationId: inst.id,
        ...(hasDateFilter ? { date: dateFilter } : {}),
      };

      const [total, present] = await Promise.all([
        prisma.opsAsistenciaDiaria.count({ where: whereBase }),
        prisma.opsAsistenciaDiaria.count({
          where: { ...whereBase, attendanceStatus: "presente" },
        }),
      ]);

      results.push({
        installationId: inst.id,
        installationName: inst.name,
        value: total > 0 ? Math.round((present / total) * 100) : 0,
      });
    }
  } else {
    return NextResponse.json(
      { error: "Metrica no valida. Use: rondas_cumplimiento, tickets, asistencia" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, data: results });
}
