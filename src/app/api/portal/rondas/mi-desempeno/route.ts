import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const guardiaId = sp.get("guardiaId");
    const mes = sp.get("mes"); // YYYY-MM

    if (!guardiaId || !mes) {
      return NextResponse.json(
        { success: false, error: "guardiaId y mes son requeridos" },
        { status: 400 }
      );
    }

    // Parse month range
    const [year, month] = mes.split("-").map(Number);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59, 999);

    // Verify guard exists
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true, tenantId: true },
    });
    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }

    // Get all executions for this guard in the month
    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        guardiaId,
        tenantId: guardia.tenantId,
        scheduledAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        trustScore: true,
        programacion: {
          select: { toleranciaMinutos: true },
        },
      },
      orderBy: { scheduledAt: "desc" },
    });

    const total = ejecuciones.length;
    const completadas = ejecuciones.filter(
      (e) => e.status === "completada"
    ).length;

    let aTiempo = 0;
    let conRetraso = 0;
    for (const ej of ejecuciones) {
      if (ej.status !== "completada") continue;
      const tolerancia = ej.programacion?.toleranciaMinutos ?? 15;
      const deadline = new Date(
        ej.scheduledAt.getTime() + tolerancia * 60 * 1000
      );
      if (ej.startedAt && ej.startedAt <= deadline) {
        aTiempo++;
      } else {
        conRetraso++;
      }
    }

    const noRealizadas = ejecuciones.filter(
      (e) => e.status === "no_realizada"
    ).length;

    const scoresArr = ejecuciones
      .filter((e) => e.trustScore > 0)
      .map((e) => e.trustScore);
    const trustScorePromedio =
      scoresArr.length > 0
        ? Math.round(
            (scoresArr.reduce((a, b) => a + b, 0) / scoresArr.length) * 10
          ) / 10
        : 0;

    // Streak: consecutive days backwards from today where ALL scheduled rounds were completed
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let rachaActual = 0;
    const streakEjecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        guardiaId,
        tenantId: guardia.tenantId,
        scheduledAt: { lte: today },
      },
      select: { scheduledAt: true, status: true },
      orderBy: { scheduledAt: "desc" },
      take: 500,
    });

    // Group by date
    const byDate = new Map<string, { total: number; completed: number }>();
    for (const ej of streakEjecuciones) {
      const dateKey = ej.scheduledAt.toISOString().slice(0, 10);
      const entry = byDate.get(dateKey) ?? { total: 0, completed: 0 };
      entry.total++;
      if (ej.status === "completada") {
        entry.completed++;
      }
      byDate.set(dateKey, entry);
    }

    // Walk backwards from today
    const cursor = new Date(today);
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      const day = byDate.get(key);
      if (!day || day.total === 0) break;
      if (day.completed < day.total) break;
      rachaActual++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return NextResponse.json({
      success: true,
      data: {
        completadas,
        aTiempo,
        conRetraso,
        noRealizadas,
        total,
        trustScorePromedio,
        rachaActual,
      },
    });
  } catch (err) {
    console.error("Error en mi-desempeno:", err);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
