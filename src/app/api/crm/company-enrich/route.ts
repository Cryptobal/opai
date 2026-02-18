/**
 * API Route: /api/crm/company-enrich
 * POST - Extrae datos públicos desde sitio web y genera resumen en español con IA.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
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

type CompanyAiEnrichment = {
  companyNameDetected: string;
  summary: string;
  industry: string;
  segment: string;
  legalName: string;
  companyRut: string;
  legalRepresentativeName: string;
  legalRepresentativeRut: string;
};

const NOT_AVAILABLE = "Not Available";

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

function collectRawMatches(content: string, regex: RegExp, max = 5): string[] {
  const matches: string[] = [];
  for (const m of content.matchAll(regex)) {
    const raw = (m[0] || "").trim();
    if (!raw) continue;
    matches.push(raw);
    if (matches.length >= max) break;
  }
  return matches;
}

type LogoCandidate = {
  url: string;
  source: string;
  score: number;
};

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getCompanyTokens(companyName: string): string[] {
  const normalized = normalizeToken(companyName || "");
  return normalized
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function detectLogoCandidates(html: string, baseUrl: string, companyName: string): LogoCandidate[] {
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

  const companyTokens = getCompanyTokens(companyName);
  const allCandidates: LogoCandidate[] = [];

  // 1) Meta-based candidates (útiles, pero no siempre son logo corporativo)
  for (const c of [...metaCandidates, jsonLdLogo, ...linkCandidates].filter(Boolean)) {
    const absolute = resolveUrl(c, baseUrl);
    if (!absolute) continue;
    allCandidates.push({ url: absolute, source: "meta", score: 10 });
  }

  // 2) Header/nav image candidates (prioridad principal solicitada por usuario)
  const headerBlocks = [
    ...collectRawMatches(html, /<header[\s\S]*?<\/header>/gi, 4),
    ...collectRawMatches(html, /<nav[\s\S]*?<\/nav>/gi, 4),
  ];
  const imgTagRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const attrRegex = (attr: string) => new RegExp(`${attr}=["']([^"']+)["']`, "i");

  for (const block of headerBlocks) {
    for (const match of block.matchAll(imgTagRegex)) {
      const fullTag = match[0] || "";
      const src = match[1] || "";
      const absolute = resolveUrl(src, baseUrl);
      if (!absolute) continue;

      const alt = (fullTag.match(attrRegex("alt"))?.[1] || "").toLowerCase();
      const cls = (fullTag.match(attrRegex("class"))?.[1] || "").toLowerCase();
      const id = (fullTag.match(attrRegex("id"))?.[1] || "").toLowerCase();
      const srcLower = absolute.toLowerCase();

      let score = 120; // Header/nav base
      if (srcLower.includes("logo")) score += 55;
      if (alt.includes("logo")) score += 45;
      if (cls.includes("logo") || id.includes("logo")) score += 35;
      if (srcLower.endsWith(".svg")) score += 24;
      if (srcLower.endsWith(".png")) score += 18;
      if (srcLower.includes("favicon") || srcLower.endsWith(".ico")) score -= 80;
      if (srcLower.includes("icon")) score -= 20;

      for (const token of companyTokens) {
        if (srcLower.includes(token) || alt.includes(token) || cls.includes(token) || id.includes(token)) {
          score += 18;
        }
      }

      allCandidates.push({ url: absolute, source: "header", score });
    }
  }

  // 3) Global IMG fallback: por si no hay header estructurado
  for (const match of html.matchAll(imgTagRegex)) {
    const fullTag = match[0] || "";
    const src = match[1] || "";
    const absolute = resolveUrl(src, baseUrl);
    if (!absolute) continue;

    const alt = (fullTag.match(attrRegex("alt"))?.[1] || "").toLowerCase();
    const cls = (fullTag.match(attrRegex("class"))?.[1] || "").toLowerCase();
    const id = (fullTag.match(attrRegex("id"))?.[1] || "").toLowerCase();
    const srcLower = absolute.toLowerCase();

    let score = 30;
    if (srcLower.includes("logo")) score += 35;
    if (alt.includes("logo")) score += 25;
    if (cls.includes("logo") || id.includes("logo")) score += 20;
    if (srcLower.includes("favicon") || srcLower.endsWith(".ico")) score -= 60;
    if (srcLower.endsWith(".svg")) score += 16;
    if (srcLower.endsWith(".png")) score += 10;
    for (const token of companyTokens) {
      if (srcLower.includes(token) || alt.includes(token)) score += 12;
    }
    allCandidates.push({ url: absolute, source: "img", score });
  }

  // Dedup por URL manteniendo mejor score
  const bestByUrl = new Map<string, LogoCandidate>();
  for (const candidate of allCandidates) {
    const prev = bestByUrl.get(candidate.url);
    if (!prev || candidate.score > prev.score) bestByUrl.set(candidate.url, candidate);
  }
  return Array.from(bestByUrl.values()).sort((a, b) => b.score - a.score);
}

function pickBestLogoCandidate(candidates: LogoCandidate[]): string | null {
  if (candidates.length === 0) return null;
  return candidates[0]?.url || null;
}

async function downloadLogoToPublic(logoUrl: string): Promise<string | null> {
  const response = await fetch(logoUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; OPAI-Bot/1.0; +https://gard.cl)",
      Accept: "image/svg+xml,image/png,image/webp,image/jpeg,image/*",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const mime = (response.headers.get("content-type") || "").toLowerCase().split(";")[0];
  const allowed: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  };
  const ext = allowed[mime];
  if (!ext) return null;

  let buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength <= 0 || buffer.byteLength > 5 * 1024 * 1024) {
    return null;
  }

  const hash = createHash("sha1").update(logoUrl).digest("hex").slice(0, 12);
  const relDir = path.join("public", "uploads", "company-logos");
  const absDir = path.join(process.cwd(), relDir);
  await mkdir(absDir, { recursive: true });

  try {
    if (ext !== ".svg") {
      const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { width, height, channels } = info;
      const whiteThreshold = 248;
      for (let i = 0; i < width * height; i++) {
        const r = data[i * channels];
        const g = data[i * channels + 1];
        const b = data[i * channels + 2];
        const isWhite = r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold;
        if (isWhite) data[i * channels + 3] = 0;
      }
      const outFileName = `logo-${Date.now()}-${hash}.png`;
      const absFile = path.join(absDir, outFileName);
      await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(absFile);
      return `/uploads/company-logos/${outFileName}`;
    }
  } catch (logoErr) {
    console.error("Logo transparency processing failed, using raw:", logoErr);
  }

  const fileName = `logo-${Date.now()}-${hash}${ext}`;
  const absFile = path.join(absDir, fileName);
  await writeFile(absFile, buffer);
  return `/uploads/company-logos/${fileName}`;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchWithRetry(
  url: string,
  maxAttempts = 2,
  timeoutMs = 20000,
): Promise<string> {
  const userAgents = [
    "Mozilla/5.0 (compatible; OPAI-Bot/1.0; +https://gard.cl)",
    BROWSER_UA,
  ];

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": userAgents[attempt % userAgents.length],
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-CL,es;q=0.9,en;q=0.5",
        },
        cache: "no-store",
        redirect: "follow",
      });
      if (!res.ok) {
        const hint =
          res.status === 403 ? "El sitio bloqueó la solicitud"
          : res.status === 503 ? "El sitio no está disponible temporalmente"
          : res.status >= 500 ? "Error del servidor remoto"
          : `HTTP ${res.status}`;
        throw new Error(`${hint} (${res.status}).`);
      }
      return await res.text();
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === "AbortError") {
        lastError = new Error(
          "El sitio web demoró demasiado en responder. Intenta nuevamente o verifica que la URL sea correcta.",
        );
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("No se pudo leer el sitio web.");
}

async function scrapeWebsite(websiteNormalized: string, companyName: string): Promise<ExtractedWebData> {
  const html = await fetchWithRetry(websiteNormalized);

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
  const logoCandidates = detectLogoCandidates(html, websiteNormalized, companyName);
  const logoUrl = pickBestLogoCandidate(logoCandidates);

  return {
    websiteNormalized,
    title,
    metaDescription,
    headings,
    paragraphs,
    logoUrl,
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractFirstRut(text: string): string | null {
  const regex = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;
  const match = text.match(regex)?.[0] || null;
  return match ? normalizeWhitespace(match) : null;
}

function extractRepresentativeByRegex(text: string): { name: string | null; rut: string | null } {
  const representativeRegexes = [
    /representante\s+legal[:\s-]+([A-ZÁÉÍÓÚÑa-záéíóúñ.'"\- ]{6,120})/i,
    /rep\.?\s*legal[:\s-]+([A-ZÁÉÍÓÚÑa-záéíóúñ.'"\- ]{6,120})/i,
  ];
  for (const rx of representativeRegexes) {
    const m = text.match(rx);
    if (m?.[1]) {
      const name = normalizeWhitespace(m[1]).replace(/[|;,].*$/, "").trim();
      const near = text.slice(Math.max(0, (m.index || 0) - 120), (m.index || 0) + 220);
      const rut = extractFirstRut(near);
      return { name: name || null, rut };
    }
  }
  return { name: null, rut: null };
}

function normalizeExtracted(value: unknown): string {
  if (typeof value !== "string") return NOT_AVAILABLE;
  const clean = normalizeWhitespace(value);
  if (!clean) return NOT_AVAILABLE;
  const lower = clean.toLowerCase();
  if (["n/a", "na", "no disponible", "not available", "desconocido", "unknown", "null"].includes(lower)) {
    return NOT_AVAILABLE;
  }
  return clean;
}

function cleanCompanyNameCandidate(value: string): string {
  let clean = normalizeWhitespace(value)
    .replace(/®|™|\(.*?\)|\[.*?\]/g, "")
    .trim();
  // Para títulos tipo "Marca: descriptor", "Marca | descriptor", etc.
  clean = clean.split(/\s[:|–—-]\s/)[0]?.trim() || clean;
  clean = clean.replace(/^inicio\s*[-:]\s*/i, "").trim();
  return clean;
}

function guessCompanyNameFromExtracted(
  requestedCompanyName: string,
  extracted: ExtractedWebData
): string {
  const candidates = [
    requestedCompanyName,
    extracted.headings[0] || "",
    extracted.title || "",
  ]
    .map((c) => cleanCompanyNameCandidate(c))
    .filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.length < 2 || candidate.length > 120) continue;
    if (/^(inicio|home|bienvenido|welcome)$/i.test(candidate)) continue;
    return candidate;
  }
  return NOT_AVAILABLE;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  throw new Error("No se encontró JSON válido en respuesta de IA.");
}

async function fetchWebHints(companyName: string): Promise<string[]> {
  if (!companyName.trim()) return [];
  const query = encodeURIComponent(`${companyName} representante legal rut razón social`);
  const url = `https://duckduckgo.com/html/?q=${query}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; OPAI-Bot/1.0; +https://gard.cl)",
      Accept: "text/html",
    },
    cache: "no-store",
  });
  if (!response.ok) return [];
  const html = await response.text();
  const snippets = [
    ...collectRegexMatches(
      html,
      /<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
      6
    ),
    ...collectRegexMatches(
      html,
      /<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
      6
    ),
  ];
  return [...new Set(snippets)].slice(0, 8);
}

async function enrichCompanyWithAi(
  companyName: string,
  website: string,
  extracted: ExtractedWebData
): Promise<CompanyAiEnrichment> {
  const webHints = await fetchWebHints(companyName);
  const sourceText = [
    `Empresa: ${companyName || "No especificada"}`,
    `Sitio: ${website}`,
    extracted.title ? `Título: ${extracted.title}` : "",
    extracted.metaDescription ? `Meta descripción: ${extracted.metaDescription}` : "",
    extracted.headings.length ? `Encabezados: ${extracted.headings.join(" | ")}` : "",
    extracted.paragraphs.length
      ? `Párrafos detectados: ${extracted.paragraphs.slice(0, 5).join(" | ")}`
      : "",
    webHints.length ? `Pistas web (búsqueda): ${webHints.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 700,
    messages: [
      {
        role: "system",
        content:
          "Eres analista comercial B2B. Responde SOLO JSON válido, sin texto adicional. Nunca inventes datos: si falta información usa exactamente 'Not Available'.",
      },
      {
        role: "user",
        content:
          `Devuelve un objeto JSON con las claves exactas:\n` +
          `companyNameDetected, summary, industry, segment, legalName, companyRut, legalRepresentativeName, legalRepresentativeRut.\n\n` +
          `Reglas:\n` +
          `- companyNameDetected: nombre comercial/empresa corto (ej: "Steak"), o 'Not Available'.\n` +
          `- summary: 4-6 líneas en español sobre qué hace la empresa y foco comercial.\n` +
          `- industry y segment: clasificaciones comerciales en español, o 'Not Available'.\n` +
          `- legalName: razón social, o 'Not Available'.\n` +
          `- companyRut y legalRepresentativeRut: formato RUT chileno si existe; si no, 'Not Available'.\n` +
          `- legalRepresentativeName: nombre completo o 'Not Available'.\n\n` +
          `Información extraída:\n${sourceText}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() || "";
  const parsed = JSON.parse(extractJsonObject(raw)) as Partial<CompanyAiEnrichment>;

  const regexRut = extractFirstRut(sourceText);
  const regexRep = extractRepresentativeByRegex(sourceText);

  return {
    companyNameDetected:
      normalizeExtracted(parsed.companyNameDetected) !== NOT_AVAILABLE
        ? cleanCompanyNameCandidate(normalizeExtracted(parsed.companyNameDetected))
        : guessCompanyNameFromExtracted(companyName, extracted),
    summary:
      normalizeExtracted(parsed.summary) === NOT_AVAILABLE
        ? extracted.metaDescription || extracted.headings[0] || "Not Available"
        : normalizeExtracted(parsed.summary),
    industry: normalizeExtracted(parsed.industry),
    segment: normalizeExtracted(parsed.segment),
    legalName: normalizeExtracted(parsed.legalName),
    companyRut:
      normalizeExtracted(parsed.companyRut) !== NOT_AVAILABLE
        ? normalizeExtracted(parsed.companyRut)
        : regexRut || NOT_AVAILABLE,
    legalRepresentativeName:
      normalizeExtracted(parsed.legalRepresentativeName) !== NOT_AVAILABLE
        ? normalizeExtracted(parsed.legalRepresentativeName)
        : regexRep.name || NOT_AVAILABLE,
    legalRepresentativeRut:
      normalizeExtracted(parsed.legalRepresentativeRut) !== NOT_AVAILABLE
        ? normalizeExtracted(parsed.legalRepresentativeRut)
        : regexRep.rut || NOT_AVAILABLE,
  };
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
    const companyName = body.companyName?.trim() || "";
    const extracted = await scrapeWebsite(websiteNormalized, companyName);
    let localLogoUrl: string | null = null;
    if (extracted.logoUrl) {
      try {
        localLogoUrl = await downloadLogoToPublic(extracted.logoUrl);
      } catch (logoError) {
        console.error("Error downloading company logo:", logoError);
      }
    }

    let enrichment: CompanyAiEnrichment = {
      companyNameDetected: guessCompanyNameFromExtracted(companyName, extracted),
      summary: extracted.metaDescription || extracted.headings[0] || "Not Available",
      industry: NOT_AVAILABLE,
      segment: NOT_AVAILABLE,
      legalName: NOT_AVAILABLE,
      companyRut: extractFirstRut(
        [extracted.title, extracted.metaDescription, ...extracted.headings, ...extracted.paragraphs].join(" ")
      ) || NOT_AVAILABLE,
      legalRepresentativeName: NOT_AVAILABLE,
      legalRepresentativeRut: NOT_AVAILABLE,
    };
    try {
      enrichment = await enrichCompanyWithAi(companyName, websiteNormalized, extracted);
    } catch (aiError) {
      console.error("Error generating AI company summary:", aiError);
    }

    return NextResponse.json({
      success: true,
      data: {
        websiteNormalized,
        companyNameDetected: enrichment.companyNameDetected,
        logoUrl: extracted.logoUrl,
        localLogoUrl,
        summary: enrichment.summary,
        industry: enrichment.industry,
        segment: enrichment.segment,
        legalName: enrichment.legalName,
        companyRut: enrichment.companyRut,
        legalRepresentativeName: enrichment.legalRepresentativeName,
        legalRepresentativeRut: enrichment.legalRepresentativeRut,
        title: extracted.title,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "No se pudo analizar el sitio web.";
    console.error("Error in company enrich:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
