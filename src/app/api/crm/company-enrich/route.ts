/**
 * API Route: /api/crm/company-enrich
 * POST - Extrae datos públicos desde sitio web y genera resumen en español con IA.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { openai } from "@/lib/openai";

type ExtractedWebData = {
  websiteNormalized: string;
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
  logoUrl: string | null;
};

function normalizeWebsiteUrl(rawWebsite: string): string {
  const trimmed = rawWebsite.trim();
  if (!trimmed) throw new Error("Debes ingresar una página web.");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("La URL debe usar http o https.");
  }
  return url.toString();
}

function firstMatch(content: string, regex: RegExp): string {
  const match = content.match(regex);
  return match?.[1]?.trim() || "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveUrl(candidate: string, baseUrl: string): string | null {
  if (!candidate) return null;
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

function collectRegexMatches(content: string, regex: RegExp, max = 5): string[] {
  const matches: string[] = [];
  for (const m of content.matchAll(regex)) {
    const clean = stripHtml(m[1] || "");
    if (!clean) continue;
    if (!matches.includes(clean)) matches.push(clean);
    if (matches.length >= max) break;
  }
  return matches;
}

function detectLogoUrl(html: string, baseUrl: string): string | null {
  const metaCandidates = [
    firstMatch(
      html,
      /<meta[^>]+property=["']og:logo["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ),
    firstMatch(
      html,
      /<meta[^>]+name=["']og:logo["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ),
    firstMatch(
      html,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ),
    firstMatch(
      html,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ),
  ].filter(Boolean);

  const linkCandidates = collectRegexMatches(
    html,
    /<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
    6
  );

  const jsonLdLogo = firstMatch(
    html,
    /"logo"\s*:\s*"([^"]+)"/i
  );

  const orderedCandidates = [...metaCandidates, jsonLdLogo, ...linkCandidates].filter(Boolean);
  for (const c of orderedCandidates) {
    const absolute = resolveUrl(c, baseUrl);
    if (!absolute) continue;
    return absolute;
  }
  return null;
}

async function scrapeWebsite(websiteNormalized: string): Promise<ExtractedWebData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(websiteNormalized, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OPAI-Bot/1.0; +https://gard.cl)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`No se pudo leer el sitio (${response.status}).`);
    }
    const html = await response.text();
    const title = stripHtml(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
    const metaDescription = stripHtml(
      firstMatch(
        html,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
      )
    );
    const headings = collectRegexMatches(html, /<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi, 6);
    const paragraphs = collectRegexMatches(html, /<p[^>]*>([\s\S]*?)<\/p>/gi, 10).filter(
      (p) => p.length > 40
    );
    const logoUrl = detectLogoUrl(html, websiteNormalized);

    return {
      websiteNormalized,
      title,
      metaDescription,
      headings,
      paragraphs,
      logoUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function summarizeInSpanish(
  companyName: string,
  website: string,
  extracted: ExtractedWebData
): Promise<string> {
  const sourceText = [
    `Empresa: ${companyName || "No especificada"}`,
    `Sitio: ${website}`,
    extracted.title ? `Título: ${extracted.title}` : "",
    extracted.metaDescription ? `Meta descripción: ${extracted.metaDescription}` : "",
    extracted.headings.length ? `Encabezados: ${extracted.headings.join(" | ")}` : "",
    extracted.paragraphs.length
      ? `Párrafos detectados: ${extracted.paragraphs.slice(0, 5).join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 220,
    messages: [
      {
        role: "system",
        content:
          "Eres analista comercial B2B. Resume en español neutro, sin inventar datos y en tono ejecutivo.",
      },
      {
        role: "user",
        content: `Con la información del sitio web, redacta un resumen breve (4-6 líneas) de: qué hace la empresa, a qué se dedica, foco de negocio y cualquier señal útil para una propuesta comercial de seguridad privada.\n\nSi faltan datos, indícalo de forma explícita sin inventar.\n\nInformación extraída:\n${sourceText}`,
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = (await request.json()) as { website?: string; companyName?: string };
    const rawWebsite = body.website?.trim() || "";
    if (!rawWebsite) {
      return NextResponse.json(
        { success: false, error: "Debes ingresar una página web." },
        { status: 400 }
      );
    }

    const websiteNormalized = normalizeWebsiteUrl(rawWebsite);
    const extracted = await scrapeWebsite(websiteNormalized);

    let summary = "";
    try {
      summary = await summarizeInSpanish(body.companyName?.trim() || "", websiteNormalized, extracted);
    } catch (aiError) {
      console.error("Error generating AI company summary:", aiError);
      summary =
        extracted.metaDescription ||
        extracted.headings[0] ||
        "No se pudo generar resumen con IA. Revisa manualmente el sitio para obtener contexto.";
    }

    return NextResponse.json({
      success: true,
      data: {
        websiteNormalized,
        logoUrl: extracted.logoUrl,
        summary,
        title: extracted.title,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "No se pudo analizar el sitio web.";
    console.error("Error in company enrich:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
