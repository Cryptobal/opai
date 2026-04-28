/**
 * Análisis IA de una respuesta abierta.
 *
 * Reutiliza el cliente OPAI Intelligence existente (`src/lib/openai.ts`) —
 * NO crea un cliente paralelo. Modelo: gpt-4o-mini (rápido, barato, suficiente
 * para esta rúbrica acotada).
 *
 * Contrato: nunca throw — si falla, retorna { error, dimensionScores: null }.
 * El scoring engine tolera esto y continúa con score fallback 0.5 + alerta.
 */

import { openai } from "@/lib/openai";
import type { PsychDimension } from "../constants";
import type { OpenAnalysisResult } from "../types";

const MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 30_000;
const MAX_TOKENS = 600;

const SYSTEM_PROMPT = `Eres un psicólogo laboral especializado en selección de personal de seguridad privada en Chile. Analizas la respuesta escrita de un candidato a un escenario laboral. Devuelves JSON estricto con:
{
  "dimensionScores": { "IMPULSE_CONTROL": number 0-1, "STRESS_MANAGEMENT": number 0-1, "VOCATIONAL_FIT": number 0-1 },
  "markers": string[],
  "summary": string,
  "flags": string[]
}

Reglas:
- Devuelve sólo las dimensiones que correspondan al escenario (las que vienen en input.dimensions).
- NO diagnostiques (no uses términos DSM/CIE).
- NO juzgues. Describe en lenguaje técnico.
- Para VOCATIONAL_FIT: evalúa identificación con el rol, motivación intrínseca, proyección a futuro y comprensión del oficio. Penaliza respuestas con marcadores de "es solo un trabajo más" o instrumentales puros (solo por dinero / solo mientras encuentro otra cosa).
- Si la respuesta es muy corta (<20 palabras) o incoherente, usa flag "RED_FLAG_INCOHERENT" y baja todos los scores.
- Si detectas lenguaje agresivo o uso de violencia como primera respuesta, flag "RED_FLAG_AGGRESSION" y IMPULSE_CONTROL ≤ 0.3.
- markers: máx 5, en español; summary máx 600 caracteres; flags máx 3.
- Responde SOLO JSON válido, sin markdown ni texto adicional.`;

interface AnalyzeInput {
  itemId: string;
  prompt: string;
  text: string;
  dimensions: PsychDimension[];
}

function fallback(
  input: AnalyzeInput,
  error: string,
): OpenAnalysisResult {
  return {
    itemId: input.itemId,
    dimensionScores: null,
    markers: [],
    summary: "",
    flags: [],
    error,
  };
}

function parseAiJson(raw: string): unknown {
  let clean = raw.trim();
  if (clean.startsWith("```json")) clean = clean.slice(7);
  if (clean.startsWith("```")) clean = clean.slice(3);
  if (clean.endsWith("```")) clean = clean.slice(0, -3);
  return JSON.parse(clean.trim());
}

export async function analyzeOpenResponse(
  input: AnalyzeInput,
): Promise<OpenAnalysisResult> {
  if (!input.text || input.text.trim().length < 5) {
    return {
      itemId: input.itemId,
      dimensionScores: null,
      markers: [],
      summary: "Respuesta vacía o demasiado corta.",
      flags: ["RED_FLAG_INCOHERENT"],
    };
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith("sk-build-")) {
    return fallback(input, "OPENAI_API_KEY no configurada");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const completion = await openai.chat.completions.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Escenario: ${input.prompt}\n\nRespuesta del candidato:\n"""${input.text}"""`,
          },
        ],
      },
      { signal: controller.signal },
    );

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = parseAiJson(raw) as {
      dimensionScores?: Record<string, number>;
      markers?: string[];
      summary?: string;
      flags?: string[];
    };

    const scores: Partial<Record<PsychDimension, number>> = {};
    if (parsed.dimensionScores) {
      for (const dim of input.dimensions) {
        const v = parsed.dimensionScores[dim];
        if (typeof v === "number" && v >= 0 && v <= 1) scores[dim] = v;
      }
    }

    // Log de uso (billing) — mismo patrón informal que resto de calls a openai.
    const usage = completion.usage;
    if (usage) {
      console.log(
        `[psych/analyzeOpen] tokens in=${usage.prompt_tokens} out=${usage.completion_tokens} total=${usage.total_tokens}`,
      );
    }

    return {
      itemId: input.itemId,
      dimensionScores: Object.keys(scores).length > 0 ? scores : null,
      markers: (parsed.markers ?? []).slice(0, 5),
      summary: (parsed.summary ?? "").slice(0, 600),
      flags: (parsed.flags ?? []).slice(0, 3),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[psych/analyzeOpen] failed:", msg);
    return fallback(input, msg);
  } finally {
    clearTimeout(timer);
  }
}
