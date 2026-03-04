import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, toISODate, parseDateOnly } from "@/lib/ops";

export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const today = parseDateOnly(toISODate(new Date()));

    const [totalGuards, ppcRows, puestosByInstallation] = await Promise.all([
      prisma.opsGuardia.count({
        where: { tenantId: ctx.tenantId, status: "active" },
      }),
      prisma.opsPautaMensual.findMany({
        where: {
          tenantId: ctx.tenantId,
          date: { gte: today, lte: today },
          puesto: { active: true },
          OR: [
            { plannedGuardiaId: null, shiftCode: null },
            { plannedGuardiaId: null, shiftCode: { notIn: ["-"] } },
            { shiftCode: { in: ["V", "L", "P", "PCG", "PSG"] } },
          ],
        },
        select: {
          plannedGuardiaId: true,
          shiftCode: true,
          installationId: true,
          installation: { select: { name: true } },
        },
      }),
      prisma.opsPuestoOperativo.groupBy({
        by: ["installationId"],
        where: { tenantId: ctx.tenantId, active: true },
        _count: { id: true },
      }),
    ]);

    const puestosMap = new Map<string, number>();
    for (const row of puestosByInstallation) {
      puestosMap.set(row.installationId, row._count.id);
    }

    const byReason: Record<string, number> = {
      sin_guardia: 0,
      vacaciones: 0,
      licencia: 0,
      permiso: 0,
    };
    const instMap = new Map<string, { name: string; ppcCount: number }>();

    for (const row of ppcRows) {
      const reason = !row.plannedGuardiaId
        ? "sin_guardia"
        : row.shiftCode === "V"
          ? "vacaciones"
          : row.shiftCode === "L"
            ? "licencia"
            : (row.shiftCode === "P" || row.shiftCode === "PCG" || row.shiftCode === "PSG")
              ? "permiso"
              : "sin_guardia";
      byReason[reason] = (byReason[reason] || 0) + 1;

      const existing = instMap.get(row.installationId);
      if (existing) {
        existing.ppcCount++;
      } else {
        instMap.set(row.installationId, {
          name: row.installation.name,
          ppcCount: 1,
        });
      }
    }

    const totalPpc = ppcRows.length;
    const ppcPercentage = totalGuards > 0
      ? Math.round((totalPpc / totalGuards) * 10000) / 100
      : 0;

    const byInstallation = Array.from(instMap.entries())
      .map(([installationId, v]) => {
        const totalPuestos = puestosMap.get(installationId) ?? 0;
        return {
          installationId,
          name: v.name,
          ppcCount: v.ppcCount,
          totalPuestos,
          ppcPercentage: totalPuestos > 0
            ? Math.round((v.ppcCount / totalPuestos) * 10000) / 100
            : 0,
        };
      })
      .sort((a, b) => b.ppcPercentage - a.ppcPercentage);

    const snapshot = await prisma.opsPpcSnapshot.upsert({
      where: {
        tenantId_date: { tenantId: ctx.tenantId, date: today },
      },
      create: {
        tenantId: ctx.tenantId,
        date: today,
        totalPpc,
        totalGuards,
        ppcPercentage,
        byReason,
        byInstallation,
      },
      update: {
        totalPpc,
        totalGuards,
        ppcPercentage,
        byReason,
        byInstallation,
      },
    });

    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    console.error("[OPS] Error creating PPC snapshot:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo generar el snapshot PPC" },
      { status: 500 }
    );
  }
}
