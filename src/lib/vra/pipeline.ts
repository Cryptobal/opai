/**
 * Pipeline de 3 fases para generar un informe VRA.
 *
 *   Fase 1 — Vision Analysis: cada foto se analiza para extraer descripción
 *            técnica, vulnerabilidad observable y severidad estimada.
 *            Paralelo con concurrencia 5.
 *
 *   Fase 2 — Section Generation: se generan las secciones del informe.
 *            Las que dependen de previas (`previous_section:*`) esperan.
 *            Paralelo con concurrencia 3 dentro de cada nivel de dependencia.
 *
 *   Fase 3 — Assembly: serial, sin AI. Toma el output de Fase 2 y persiste
 *            las secciones en `vra.report_sections`.
 */

import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import { getFileBuffer } from "@/lib/storage";
import { buildInstallationContext, buildFindingsContext, buildPhotosContext } from "./context-builder";
import type {
  VraPhotoAnalysis,
  VraPhotoContext,
  VraSectionContent,
  VraSeverity,
} from "./types";

const VRA_VISION_MODEL_OVERRIDE = process.env.VRA_VISION_MODEL ?? "gpt-4o-mini";

// ────────────────────────────────────────────────────────────────────────────
// FASE 1 — VISION ANALYSIS
// ────────────────────────────────────────────────────────────────────────────

async function analyzePhotoBatch(
  photos: VraPhotoContext[],
  vulnerabilityKeys: string[],
  tenantId: string,
  userId: string,
): Promise<Map<string, VraPhotoAnalysis>> {
  const results = new Map<string, VraPhotoAnalysis>();
  const BATCH_SIZE = 5;

  const processOne = async (photo: VraPhotoContext): Promise<void> => {
    try {
      // Descargar imagen desde R2 (max 8MB por defecto en getFileBuffer)
      const buffer = await getFileBuffer(photo.storageKey);
      const base64 = buffer.toString("base64");

      // Detectar mime type por extensión
      const mimeType = photo.storageKey.toLowerCase().endsWith(".png")
        ? "image/png"
        : "image/jpeg";

      const prompt = `Eres un analista experto en seguridad física, especializado en identificación de vulnerabilidades de instalaciones industriales y comerciales.

Analiza esta fotografía tomada durante una visita de inspección de seguridad y devuelve EXACTAMENTE este JSON, sin texto adicional:

{
  "technicalDescription": "Descripción técnica de 2-3 líneas de lo que se observa, en lenguaje profesional de seguridad. NO describir como 'una foto de'. Describir lo observado: 'Vista del muro perimetral lindante con la línea férrea. Se observan intentos de forado con técnica de erosión...'",
  "observableVulnerability": "Si la foto muestra una vulnerabilidad clara, describirla en 1 línea. Si no hay vulnerabilidad visible, null.",
  "estimatedSeverity": "critical | high | medium | low — severidad estimada del riesgo asociado. critical = evidencia material activa de delito. high = vulnerabilidad estructural sin mitigación. medium = facilitador delictual. low = observación sin riesgo material.",
  "suggestedVulnerabilityKeys": ["array de claves cortas a las que se vincula, ej: 'perimeter_breach', 'cctv_blind_spot', 'lighting_gap'. Vacío si no aplica."],
  "visibleSector": "Norte | Sur | Este | Oeste | Perimetral | Interior | Tecnología | null si no se puede determinar"
}

Categoría declarada de la foto (si existe): ${photo.categoryName ?? "no especificada"}
Coordenadas GPS: ${photo.gpsLat && photo.gpsLng ? `${photo.gpsLat}, ${photo.gpsLng}` : "no disponibles"}

Vulnerabilidades disponibles para vincular: ${vulnerabilityKeys.join(", ")}`;

      const t0 = Date.now();
      const response = (await aiService.generateFromImages(
        [base64],
        [mimeType],
        prompt,
        { maxTokens: 1024, modelOverride: VRA_VISION_MODEL_OVERRIDE },
        { tenantId },
      )) as VraPhotoAnalysis;

      results.set(photo.id, {
        technicalDescription: response.technicalDescription ?? "Análisis no disponible.",
        observableVulnerability: response.observableVulnerability ?? null,
        estimatedSeverity: (response.estimatedSeverity as VraSeverity) ?? "low",
        suggestedVulnerabilityKeys: Array.isArray(response.suggestedVulnerabilityKeys)
          ? response.suggestedVulnerabilityKeys
          : [],
        visibleSector: response.visibleSector ?? null,
      });

      logAiUsage({
        tenantId,
        userId,
        providerType: "openai",
        model: VRA_VISION_MODEL_OVERRIDE,
        feature: "vra_vision",
        durationMs: Date.now() - t0,
        metadata: { photoId: photo.id },
      });
    } catch (err) {
      console.error(`[VRA pipeline] Vision error photo ${photo.id}:`, err);
      // Fallback: analysis vacío para no romper pipeline
      results.set(photo.id, {
        technicalDescription: photo.categoryName
          ? `Foto categorizada como ${photo.categoryName}. Análisis automático no disponible.`
          : "Foto registrada durante visita técnica.",
        observableVulnerability: null,
        estimatedSeverity: "low",
        suggestedVulnerabilityKeys: [],
        visibleSector: null,
      });
    }
  };

  // Process in batches
  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    const batch = photos.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(processOne));
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// FASE 2 — SECTION GENERATION
// ────────────────────────────────────────────────────────────────────────────

async function generateSection(
  template: {
    key: string;
    title: string;
    description: string;
    aiPromptHint: string | null;
    outputType: string;
    dataInputs: string[];
  },
  context: {
    installation: unknown;
    findings: unknown[];
    photosWithAnalysis: unknown[];
    previousSections: Record<string, unknown>;
  },
  tenantId: string,
  userId: string,
): Promise<{ contentJson: VraSectionContent; durationMs: number }> {
  // Filtrar inputs según dataInputs declarados
  const ctxFiltered: Record<string, unknown> = {};
  for (const input of template.dataInputs) {
    if (input === "installation") ctxFiltered.installation = context.installation;
    else if (input === "findings") ctxFiltered.findings = context.findings;
    else if (input === "photos") ctxFiltered.photos = context.photosWithAnalysis;
    else if (input.startsWith("previous_section:")) {
      const key = input.split(":")[1];
      if (context.previousSections[key]) {
        ctxFiltered[`previous_section_${key}`] = context.previousSections[key];
      }
    }
  }

  const prompt = `Eres el Director de Operaciones de Seguridad de Gard Security, redactando una sección de un informe profesional de evaluación de vulnerabilidad.

SECCIÓN A GENERAR: "${template.title}"

INSTRUCCIONES PARA ESTA SECCIÓN:
${template.description}

${template.aiPromptHint ? `INSTRUCCIONES ADICIONALES:\n${template.aiPromptHint}\n` : ""}

TIPO DE BLOQUE DE SALIDA: ${template.outputType}

CONTEXTO DISPONIBLE:
${JSON.stringify(ctxFiltered, null, 2)}

INSTRUCCIONES DE FORMATO DEL OUTPUT JSON:

Devuelve EXACTAMENTE un objeto JSON con esta estructura según el outputType:

- "narrative": { "narrative": "texto largo en español, párrafos separados por \\n\\n" }
- "bulleted_list": { "bullets": ["bullet 1", "bullet 2", ...] }
- "comparison_table": { "table": { "headers": ["col1", "col2"], "rows": [["val1", "val2"], ...] } }
- "vuln_cards": { "vulnerabilities": [{ "code": "V-01", "title": "...", "description": "...", "sectorOrSystem": "...", "probability": "Alta", "impact": "Alto", "finalRisk": "critical", "aggravatingFactors": "...", "affectedSystems": ["..."] }] }
- "risk_matrix": { "vulnerabilities": [...] (mismo formato que vuln_cards, consolidado) }
- "heat_map": { "heatMap": [{ "probability": "Casi Cierto", "impact": "Mayor", "vulnerabilityCodes": ["V-01", "V-02"] }] }
- "recommendations": { "recommendations": [{ "code": "R-01", "title": "...", "priority": "Inmediata", "termDays": {"from": 0, "to": 30}, "investmentLevel": "Media", "investmentNote": "...", "action": "...", "justification": "...", "kpi": "...", "linkedVulnerabilities": ["V-01"] }] }
- "roadmap": { "roadmap": [{ "phase": 1, "title": "...", "termDays": {"from": 0, "to": 30}, "items": [{"code": "R-01", "description": "..."}], "outcome": "..." }] }
- "photo_gallery": { "photoGallery": [{ "code": "E-01", "photoId": "uuid del input", "severity": "critical", "title": "...", "technicalObservation": "...", "linkedVulnerabilityCodes": ["V-01"] }] }
- "risk_distribution": { "narrative": "...", "bullets": [...], "metadata": {"riskLevel": "high", "criticalCount": "2", "highCount": "4", "mediumCount": "3", "lowCount": "0"} }
- "site_description": { "narrative": "...", "table": {...} (límites cardinales) }
- "norms_table": { "customBlocks": [{"type":"section", "title":"B.1 Marco Normativo Chileno", "table": {...}}, {"type":"section", "title":"B.2 ...", "table": {...}}, {"type":"section", "title":"B.3 Glosario", "table": {...}}] }
- "metadata_card": { "metadata": {"key": "value", ...} }

REGLAS DE CALIDAD CRÍTICAS:
- NO inventar datos que no están en el contexto. Si falta información, decirlo explícitamente ("Información no disponible").
- Usar lenguaje profesional, técnico, en español de Chile.
- NO usar frases de relleno tipo "Es importante destacar que...".
- Si la sección requiere referencias normativas, usar las chilenas (DS Nº 1.814, OS-10, Ley Nº 19.303).
- Devolver SOLO el JSON, sin código markdown ni explicaciones adicionales.`;

  const t0 = Date.now();
  const result = (await aiService.generateJSON(prompt, 4096, { tenantId })) as VraSectionContent;
  const durationMs = Date.now() - t0;

  logAiUsage({
    tenantId,
    userId,
    providerType: "auto",
    model: "tenant-default",
    feature: "vra_section",
    durationMs,
    metadata: { sectionKey: template.key, outputType: template.outputType },
  });

  return { contentJson: result, durationMs };
}

// ────────────────────────────────────────────────────────────────────────────
// PIPELINE PRINCIPAL
// ────────────────────────────────────────────────────────────────────────────

export async function runVraGenerationPipeline(params: {
  reportId: string;
  tenantId: string;
  userId: string;
}): Promise<void> {
  const { reportId, tenantId, userId } = params;

  console.log(`[VRA pipeline] Iniciando generación reportId=${reportId}`);

  const report = await prisma.vraReport.findFirst({
    where: { id: reportId, tenantId },
  });
  if (!report) throw new Error("Informe no encontrado");

  await prisma.vraReport.update({
    where: { id: reportId },
    data: { status: "generating" },
  });

  try {
    // 1) Construir contexto base
    const installation = await buildInstallationContext(report.installationId, tenantId);
    if (!installation) throw new Error("Instalación no encontrada");

    const findings = await buildFindingsContext(report.installationId, tenantId, report.visitId);
    const photos = await buildPhotosContext(report.installationId, tenantId, report.visitId);

    // 2) Cargar plantillas activas del tenant
    const templates = await prisma.vraSectionTemplate.findMany({
      where: { tenantId, isEnabled: true },
      orderBy: { sortOrder: "asc" },
    });

    if (templates.length === 0) {
      throw new Error("El tenant no tiene secciones activas. Configura el catálogo VRA primero.");
    }

    // 3) Crear filas vra.report_sections en estado pending
    await prisma.vraReportSection.deleteMany({ where: { reportId } });
    const reportSections = await Promise.all(
      templates.map((t) =>
        prisma.vraReportSection.create({
          data: {
            reportId,
            templateId: t.id,
            key: t.key,
            title: t.title,
            description: t.description,
            outputType: t.outputType,
            sortOrder: t.sortOrder,
            status: "pending",
          },
        }),
      ),
    );

    // 4) FASE 1 — Vision Analysis
    console.log(`[VRA pipeline] Fase 1: Vision analysis (${photos.length} fotos)`);
    const photoAnalyses = photos.length > 0
      ? await analyzePhotoBatch(
          photos,
          ["perimeter_breach", "cctv_blind_spot", "lighting_gap", "fence_discontinuity", "elevated_observation_point", "unauthorized_access_route", "vegetation_facilitator", "abandoned_object"],
          tenantId,
          userId,
        )
      : new Map<string, VraPhotoAnalysis>();

    const photosWithAnalysis = photos.map((p) => ({
      ...p,
      aiAnalysis: photoAnalyses.get(p.id),
    }));

    // 5) FASE 2 — Section Generation con dependencias
    console.log(`[VRA pipeline] Fase 2: Section generation (${templates.length} secciones)`);
    const previousSections: Record<string, unknown> = {};

    const independentTemplates = templates.filter(
      (t) => !((t.dataInputs as string[]) ?? []).some((d) => d.startsWith("previous_section:")),
    );
    const dependentTemplates = templates.filter(
      (t) => ((t.dataInputs as string[]) ?? []).some((d) => d.startsWith("previous_section:")),
    );

    // Generar independientes en paralelo (concurrencia 3)
    await processInChunks(independentTemplates, 3, async (t) => {
      const reportSection = reportSections.find((rs) => rs.key === t.key);
      if (!reportSection) return;
      try {
        await prisma.vraReportSection.update({
          where: { id: reportSection.id },
          data: { status: "generating" },
        });
        const { contentJson } = await generateSection(
          {
            key: t.key,
            title: t.title,
            description: t.description,
            aiPromptHint: t.aiPromptHint,
            outputType: t.outputType,
            dataInputs: (t.dataInputs as string[]) ?? [],
          },
          { installation, findings, photosWithAnalysis, previousSections },
          tenantId,
          userId,
        );
        previousSections[t.key] = contentJson;
        await prisma.vraReportSection.update({
          where: { id: reportSection.id },
          data: {
            status: "generated",
            contentJson: contentJson as unknown as object,
            generatedAt: new Date(),
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[VRA pipeline] Error sección ${t.key}:`, msg);
        await prisma.vraReportSection.update({
          where: { id: reportSection.id },
          data: { status: "error", errorMessage: msg },
        });
      }
    });

    // Generar dependientes secuencialmente para asegurar previousSections esté completo
    for (const t of dependentTemplates) {
      const reportSection = reportSections.find((rs) => rs.key === t.key);
      if (!reportSection) continue;
      try {
        await prisma.vraReportSection.update({
          where: { id: reportSection.id },
          data: { status: "generating" },
        });
        const { contentJson } = await generateSection(
          {
            key: t.key,
            title: t.title,
            description: t.description,
            aiPromptHint: t.aiPromptHint,
            outputType: t.outputType,
            dataInputs: (t.dataInputs as string[]) ?? [],
          },
          { installation, findings, photosWithAnalysis, previousSections },
          tenantId,
          userId,
        );
        previousSections[t.key] = contentJson;
        await prisma.vraReportSection.update({
          where: { id: reportSection.id },
          data: {
            status: "generated",
            contentJson: contentJson as unknown as object,
            generatedAt: new Date(),
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[VRA pipeline] Error sección dependiente ${t.key}:`, msg);
        await prisma.vraReportSection.update({
          where: { id: reportSection.id },
          data: { status: "error", errorMessage: msg },
        });
      }
    }

    // 6) FASE 3 — Assembly: calcular metadata y nivel de riesgo agregado
    console.log(`[VRA pipeline] Fase 3: Assembly`);
    const riskDistribution = computeRiskDistribution(previousSections);
    const aggregateRiskLevel = computeAggregateRisk(riskDistribution);

    await prisma.vraReport.update({
      where: { id: reportId },
      data: {
        status: "ready",
        riskLevel: aggregateRiskLevel,
        generatedAt: new Date(),
        metadata: {
          installationName: installation.name,
          clientName: installation.clientName,
          generatedAt: new Date().toISOString(),
          visitId: report.visitId,
          version: report.version,
          riskLevel: aggregateRiskLevel,
          riskDistribution,
        } as unknown as object,
      },
    });

    console.log(`[VRA pipeline] ✅ Completado reportId=${reportId} risk=${aggregateRiskLevel}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[VRA pipeline] ❌ Error reportId=${reportId}:`, msg);
    await prisma.vraReport.update({
      where: { id: reportId },
      data: { status: "draft", metadata: { error: msg } as unknown as object },
    });
    throw err;
  }
}

// Helpers

async function processInChunks<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(chunk.map(fn));
  }
}

function computeRiskDistribution(
  previousSections: Record<string, unknown>,
): { critical: number; high: number; medium: number; low: number } {
  const dist = { critical: 0, high: 0, medium: 0, low: 0 };
  const vulnsSection = previousSections["vulnerabilities"] as
    | { vulnerabilities?: { finalRisk?: string }[] }
    | undefined;
  const vulns = vulnsSection?.vulnerabilities ?? [];
  for (const v of vulns) {
    const r = v.finalRisk?.toLowerCase();
    if (r === "critical") dist.critical++;
    else if (r === "high") dist.high++;
    else if (r === "medium") dist.medium++;
    else if (r === "low") dist.low++;
  }
  return dist;
}

function computeAggregateRisk(d: {
  critical: number;
  high: number;
  medium: number;
  low: number;
}): VraSeverity {
  if (d.critical > 0) return "critical";
  if (d.high >= 3) return "high";
  if (d.high > 0 || d.medium >= 4) return "high";
  if (d.medium > 0) return "medium";
  return "low";
}
