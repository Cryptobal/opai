import { prisma } from "@/lib/prisma";
import { clampText } from "./radar-util";

/** Ejemplos de aprendizaje (texto de correos) según decisiones previas. */
export type LeadFeedback = { approved: string[]; rejected: string[] };

const SAMPLE = 40;
const PER_BUCKET = 6;

/** Una línea por correo: título + resumen del item (señal de texto). */
function toLine(title: string, summary: string | null): string {
  const text = summary ? `${title} — ${summary}` : title;
  return clampText(text, 120);
}

/**
 * Aprendizaje a partir de las decisiones ✓/✗ del usuario sobre novedades
 * "nuevo_lead": DONE = lo consideró lead real (aprobado), DISMISSED = lo
 * descartó (no era lead). Alimenta el few-shot del clasificador para que se
 * adapte a las preferencias reales del usuario. Sin migración: reusa el
 * estado que ya guardan los RadarItems.
 */
export async function getLeadFeedbackExamples(
  tenantId: string,
  userId: string,
): Promise<LeadFeedback> {
  const rows = await prisma.crmRadarItem.findMany({
    where: {
      tenantId,
      userId,
      kind: "nuevo_lead",
      status: { in: ["DONE", "DISMISSED"] },
    },
    select: { status: true, title: true, summary: true },
    orderBy: { updatedAt: "desc" },
    take: SAMPLE,
  });

  const approved: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const line = toLine(r.title, r.summary);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    const bucket = r.status === "DONE" ? approved : rejected;
    if (bucket.length < PER_BUCKET) bucket.push(line);
  }
  return { approved, rejected };
}
