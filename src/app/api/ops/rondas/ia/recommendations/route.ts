import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { formatPersonName } from "@/lib/personas";
import { AIService } from "@/lib/ai-service";

interface Recommendation {
  type: "coverage" | "guard" | "schedule" | "template";
  priority: "high" | "medium" | "low";
  text: string;
}

export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const tenantId = ctx.tenantId;

    const [ejecuciones, alertas, checkpoints] = await Promise.all([
      prisma.opsRondaEjecucion.findMany({
        where: { tenantId, scheduledAt: { gte: fourWeeksAgo } },
        select: {
          id: true,
          status: true,
          trustScore: true,
          scheduledAt: true,
          checkpointsTotal: true,
          checkpointsCompletados: true,
          guardiaId: true,
          installationId: true,
          rondaTemplate: {
            select: { name: true, installation: { select: { name: true } } },
          },
          guardia: {
            select: { persona: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      prisma.opsAlertaRonda.findMany({
        where: { tenantId, createdAt: { gte: fourWeeksAgo } },
        select: {
          tipo: true,
          severidad: true,
          createdAt: true,
          installation: { select: { name: true } },
        },
      }),
      prisma.opsMarcacionCheckpoint.findMany({
        where: { tenantId, timestamp: { gte: fourWeeksAgo }, status: "COMPLETED" },
        select: {
          checkpointId: true,
          checkpoint: { select: { name: true, installationId: true, installation: { select: { name: true } } } },
        },
      }),
    ]);

    // --- Aggregate data ---

    const instMap = new Map<string, { name: string; total: number; completed: number; trustSum: number; trustCount: number }>();
    for (const ej of ejecuciones) {
      const instName = ej.rondaTemplate.installation.name;
      const instId = ej.installationId ?? "unknown";
      const entry = instMap.get(instId) ?? { name: instName, total: 0, completed: 0, trustSum: 0, trustCount: 0 };
      entry.total++;
      if (ej.status === "completada") entry.completed++;
      if (ej.trustScore > 0) { entry.trustSum += ej.trustScore; entry.trustCount++; }
      instMap.set(instId, entry);
    }

    const guardMap = new Map<string, { name: string; scores4w: number[]; scores2w: number[]; total: number }>();
    for (const ej of ejecuciones) {
      if (!ej.guardiaId || !ej.guardia) continue;
      const gName = formatPersonName(ej.guardia.persona.firstName, ej.guardia.persona.lastName);
      const entry = guardMap.get(ej.guardiaId) ?? { name: gName, scores4w: [], scores2w: [], total: 0 };
      entry.total++;
      if (ej.trustScore > 0) {
        entry.scores4w.push(ej.trustScore);
        if (ej.scheduledAt >= twoWeeksAgo) entry.scores2w.push(ej.trustScore);
      }
      guardMap.set(ej.guardiaId, entry);
    }

    const cpMap = new Map<string, { name: string; instName: string; count: number }>();
    for (const m of checkpoints) {
      const entry = cpMap.get(m.checkpointId) ?? { name: m.checkpoint.name, instName: m.checkpoint.installation.name, count: 0 };
      entry.count++;
      cpMap.set(m.checkpointId, entry);
    }

    const alertHourMap = new Map<string, Map<number, number>>();
    for (const a of alertas) {
      const instName = a.installation.name;
      const hour = a.createdAt.getHours();
      const hourMap = alertHourMap.get(instName) ?? new Map();
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
      alertHourMap.set(instName, hourMap);
    }

    const totalRoundsForCoverage = ejecuciones.filter(e => e.status === "completada" || e.status === "incompleta").length;

    const installationsSummary = Array.from(instMap.entries())
      .map(([, v]) => ({
        name: v.name,
        total: v.total,
        completed: v.completed,
        compliancePct: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
        trustAvg: v.trustCount > 0 ? Math.round(v.trustSum / v.trustCount) : 0,
      }))
      .sort((a, b) => a.compliancePct - b.compliancePct)
      .slice(0, 10);

    const guardsSummary = Array.from(guardMap.entries())
      .map(([, v]) => {
        const avg4w = v.scores4w.length > 0 ? Math.round(v.scores4w.reduce((a, b) => a + b, 0) / v.scores4w.length) : 0;
        const avg2w = v.scores2w.length > 0 ? Math.round(v.scores2w.reduce((a, b) => a + b, 0) / v.scores2w.length) : 0;
        return { name: v.name, total: v.total, trustAvg4w: avg4w, trustAvg2w: avg2w, trend: avg2w - avg4w };
      })
      .sort((a, b) => a.trustAvg4w - b.trustAvg4w)
      .slice(0, 10);

    const checkpointsSummary = Array.from(cpMap.entries())
      .map(([, v]) => ({
        name: v.name,
        installation: v.instName,
        marks: v.count,
        coveragePct: totalRoundsForCoverage > 0 ? Math.round((v.count / totalRoundsForCoverage) * 100) : 0,
      }))
      .sort((a, b) => a.coveragePct - b.coveragePct)
      .slice(0, 20);

    const alertsSummary: Array<{ installation: string; peakHours: string; alertCount: number }> = [];
    for (const [instName, hourMap] of alertHourMap) {
      const totalAlerts = Array.from(hourMap.values()).reduce((a, b) => a + b, 0);
      const sorted = Array.from(hourMap.entries()).sort((a, b) => b[1] - a[1]);
      const peakHours = sorted.slice(0, 3).map(([h]) => `${String(h).padStart(2, "0")}:00`).join(", ");
      alertsSummary.push({ installation: instName, peakHours, alertCount: totalAlerts });
    }

    const dataForAI = {
      periodo: "últimas 4 semanas",
      totalRondas: ejecuciones.length,
      totalAlertas: alertas.length,
      instalaciones: installationsSummary,
      guardias: guardsSummary,
      checkpoints: checkpointsSummary,
      alertasPorHora: alertsSummary.slice(0, 10),
    };

    // --- Try AI, fallback to algorithmic ---
    let recommendations: Recommendation[];

    try {
      const aiService = new AIService();
      const prompt = `Eres un analista de seguridad. Genera recomendaciones accionables basadas en datos operacionales de rondas de vigilancia.

Analiza estos datos y genera 3-5 recomendaciones. Cada recomendación debe ser específica con datos concretos (nombres, porcentajes, horarios).

Datos:
${JSON.stringify(dataForAI, null, 2)}

Responde SOLO en JSON válido, sin markdown ni explicaciones extra:
[{ "type": "coverage"|"guard"|"schedule"|"template", "priority": "high"|"medium"|"low", "text": "recomendación en español" }]`;

      const result = await aiService.generateJSON(prompt, 2000);
      const arr = Array.isArray(result) ? result : [];
      recommendations = arr.slice(0, 5).map((r: Record<string, unknown>) => ({
        type: (["coverage", "guard", "schedule", "template"].includes(r.type as string) ? r.type : "coverage") as Recommendation["type"],
        priority: (["high", "medium", "low"].includes(r.priority as string) ? r.priority : "medium") as Recommendation["priority"],
        text: String(r.text ?? ""),
      }));
    } catch (aiError) {
      console.warn("[IA] Fallback to algorithmic recommendations:", aiError);
      recommendations = generateAlgorithmicRecommendations(installationsSummary, guardsSummary, checkpointsSummary, alertsSummary);
    }

    return NextResponse.json({
      success: true,
      data: {
        recommendations,
        generatedAt: new Date().toISOString(),
        source: recommendations.length > 0 ? "ai" : "algorithmic",
      },
    });
  } catch (error) {
    console.error("[IA] recommendations", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

function generateAlgorithmicRecommendations(
  installations: Array<{ name: string; compliancePct: number; trustAvg: number }>,
  guards: Array<{ name: string; trustAvg4w: number; trend: number; total: number }>,
  checkpoints: Array<{ name: string; installation: string; coveragePct: number }>,
  alerts: Array<{ installation: string; peakHours: string; alertCount: number }>,
): Recommendation[] {
  const recs: Recommendation[] = [];

  const lowCoverage = checkpoints.filter(c => c.coveragePct < 50);
  if (lowCoverage.length > 0) {
    const cp = lowCoverage[0];
    recs.push({
      type: "coverage",
      priority: "high",
      text: `El checkpoint "${cp.name}" en ${cp.installation} tiene solo ${cp.coveragePct}% de cobertura. Revisar accesibilidad o ajustar la plantilla de ronda.`,
    });
  }

  const decliningGuards = guards.filter(g => g.trend < -5 && g.total >= 5);
  if (decliningGuards.length > 0) {
    const g = decliningGuards[0];
    recs.push({
      type: "guard",
      priority: g.trend < -10 ? "high" : "medium",
      text: `${g.name} promedia Trust Score ${g.trustAvg4w} con tendencia descendente (${g.trend > 0 ? "+" : ""}${g.trend}%). Considerar supervisión adicional o capacitación.`,
    });
  }

  const lowCompliance = installations.filter(i => i.compliancePct < 70);
  if (lowCompliance.length > 0) {
    const inst = lowCompliance[0];
    recs.push({
      type: "template",
      priority: "medium",
      text: `${inst.name} tiene cumplimiento del ${inst.compliancePct}% con Trust promedio ${inst.trustAvg}. Revisar carga de rondas y dotación de guardias.`,
    });
  }

  if (alerts.length > 0) {
    const topAlert = alerts.sort((a, b) => b.alertCount - a.alertCount)[0];
    recs.push({
      type: "schedule",
      priority: "medium",
      text: `${topAlert.alertCount} alertas en ${topAlert.installation}. Horarios pico: ${topAlert.peakHours}. Considerar ronda adicional focalizada en esos horarios.`,
    });
  }

  const stableGuards = guards.filter(g => g.trustAvg4w >= 85 && g.trend >= 0);
  if (stableGuards.length > 0) {
    recs.push({
      type: "guard",
      priority: "low",
      text: `${stableGuards.length} guardia(s) mantienen Trust Score ≥85 con tendencia estable. Reconocer buen desempeño para motivación del equipo.`,
    });
  }

  return recs.slice(0, 5);
}
