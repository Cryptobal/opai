/**
 * Genera un resumen AI del reporte de control nocturno.
 *
 * Usa gpt-4o-mini para analizar la eficiencia de las rondas,
 * detectar desviaciones y generar un párrafo ejecutivo.
 */

import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

interface ReportData {
  date: string;
  centralOperatorName: string;
  totalInstalaciones: number;
  instalaciones: Array<{
    installationName: string;
    statusInstalacion: string;
    notes: string | null;
    guardias: Array<{ guardiaNombre: string; horaLlegada: string | null }>;
    rondas: Array<{
      rondaNumber: number;
      horaEsperada: string;
      horaMarcada: string | null;
      status: string;
      notes: string | null;
    }>;
  }>;
  generalNotes: string | null;
}

interface HistoricalContext {
  avgCumplimiento7d: number | null;
  reportCount7d: number;
}

/**
 * Genera el resumen AI para incluir en el email del reporte.
 * Returns null if AI generation fails (non-blocking).
 */
export async function generateControlNocturnoSummary(
  reportData: ReportData,
  tenantId: string,
): Promise<string | null> {
  try {
    // Fetch recent historical data for context (last 7 days)
    const history = await getRecentHistory(tenantId, reportData.date);

    // Build the analysis prompt
    const prompt = buildPrompt(reportData, history);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un analista de operaciones de seguridad. Generas resúmenes ejecutivos breves y accionables sobre el cumplimiento de rondas nocturnas. Responde siempre en español chileno, de forma directa y profesional. Máximo 4 oraciones.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    return response.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.warn("[AI] Could not generate control nocturno summary:", error);
    return null;
  }
}

async function getRecentHistory(
  tenantId: string,
  currentDate: string,
): Promise<HistoricalContext> {
  try {
    const sevenDaysAgo = new Date(currentDate + "T00:00:00");
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recent = await prisma.opsControlNocturno.findMany({
      where: {
        tenantId,
        status: { in: ["aprobado", "enviado"] },
        date: { gte: sevenDaysAgo, lt: new Date(currentDate + "T00:00:00") },
      },
      select: {
        instalaciones: {
          select: {
            rondas: { select: { status: true } },
          },
        },
      },
    });

    if (recent.length === 0) return { avgCumplimiento7d: null, reportCount7d: 0 };

    let total = 0;
    let completadas = 0;
    for (const r of recent) {
      for (const inst of r.instalaciones) {
        for (const ronda of inst.rondas) {
          if (ronda.status === "no_aplica") continue;
          total++;
          if (ronda.status === "completada") completadas++;
        }
      }
    }

    return {
      avgCumplimiento7d: total > 0 ? Math.round((completadas / total) * 100) : null,
      reportCount7d: recent.length,
    };
  } catch {
    return { avgCumplimiento7d: null, reportCount7d: 0 };
  }
}

function buildPrompt(data: ReportData, history: HistoricalContext): string {
  // Calculate tonight's stats
  let totalRondas = 0;
  let completadas = 0;
  let omitidas = 0;
  const problemInstallations: string[] = [];
  const incidentNotes: string[] = [];

  for (const inst of data.instalaciones) {
    let instTotal = 0;
    let instComp = 0;
    for (const r of inst.rondas) {
      if (r.status === "no_aplica") continue;
      instTotal++;
      totalRondas++;
      if (r.status === "completada") {
        instComp++;
        completadas++;
      } else if (r.status === "omitida") {
        omitidas++;
      }
      if (r.notes) incidentNotes.push(`${inst.installationName} R${r.rondaNumber}: ${r.notes}`);
    }
    const pct = instTotal > 0 ? Math.round((instComp / instTotal) * 100) : 100;
    if (pct < 80) problemInstallations.push(`${inst.installationName} (${pct}%)`);

    if (inst.statusInstalacion === "critico") {
      problemInstallations.push(`${inst.installationName} [CRÍTICO]`);
    }
    if (inst.notes) incidentNotes.push(`${inst.installationName}: ${inst.notes}`);
  }

  const cumplimiento = totalRondas > 0 ? Math.round((completadas / totalRondas) * 100) : 100;

  let prompt = `Reporte Control Nocturno del ${data.date}
Operador: ${data.centralOperatorName}
Instalaciones: ${data.totalInstalaciones}

RONDAS ESTA NOCHE:
- Total: ${totalRondas}, Completadas: ${completadas}, Omitidas: ${omitidas}
- Cumplimiento: ${cumplimiento}%
`;

  if (problemInstallations.length > 0) {
    prompt += `\nINSTALACIONES CON PROBLEMAS:\n- ${problemInstallations.join("\n- ")}`;
  }

  if (incidentNotes.length > 0) {
    prompt += `\n\nNOTAS/INCIDENCIAS:\n- ${incidentNotes.slice(0, 10).join("\n- ")}`;
  }

  if (data.generalNotes) {
    prompt += `\n\nNOTAS GENERALES: ${data.generalNotes}`;
  }

  if (history.avgCumplimiento7d !== null) {
    prompt += `\n\nCONTEXTO HISTÓRICO (últimos 7 días, ${history.reportCount7d} reportes):
- Cumplimiento promedio: ${history.avgCumplimiento7d}%`;
    const diff = cumplimiento - history.avgCumplimiento7d;
    if (diff > 5) prompt += ` (esta noche fue ${diff} puntos MEJOR)`;
    else if (diff < -5) prompt += ` (esta noche fue ${Math.abs(diff)} puntos PEOR)`;
  }

  prompt += `\n\nGenera un resumen ejecutivo breve (3-4 oraciones) indicando: eficiencia general, desviaciones o alertas si las hay, y recomendaciones si el cumplimiento es bajo. Si todo está bien, resáltalo positivamente.`;

  return prompt;
}
