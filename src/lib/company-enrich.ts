/**
 * lib/company-enrich
 * Enriquecimiento de datos de empresa desde su sitio web público.
 *
 * Extraído del route /api/crm/company-enrich para poder reutilizarlo sin auth
 * (ej: auto-enriquecer leads creados desde la web pública o por email entrante).
 *
 * Mejoras clave vs. versión original:
 *  - Resolución multi-candidato: prueba https/http × con-www/sin-www en orden.
 *  - Descubrimiento de dominio por búsqueda web cuando la URL no resuelve
 *    (o cuando no se ingresó URL pero sí nombre de empresa).
 */

import { createHash } from "crypto";
import sharp from "sharp";
import { uploadFile } from "@/lib/storage";
import { openai } from "@/lib/openai";
import { fetchCompanyWebHints, discoverCompanyWebsite } from "@/lib/company-web-hints";

export type CompanyEnrichResult = {
  websiteNormalized: string;
  companyNameDetected: string;
  logoUrl: string | null;
  localLogoUrl: string | null;
  summary: string;
  industry: string;
  segment: string;
  legalName: string;
  companyRut: string;
  legalRepresentativeName: string;
  legalRepresentativeRut: string;
  title: string;
};

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

export const NOT_AVAILABLE = "Not Available";

export function isNotAvailable(value: string | null | undefined): boolean {
  if (!value) return true;
  return value.trim().toLowerCase() === NOT_AVAILABLE.toLowerCase();
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.es", "outlook.com", "outlook.es",
  "yahoo.com", "yahoo.es", "live.com", "live.cl", "msn.com",
  "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me",
  "mail.com", "aol.com", "zoho.com", "yandex.com", "tutanota.com",
]);

/** Deriva un sitio web (https) desde el dominio de un email corporativo. */
export function websiteFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const domain = email.split("@")[1]?.toLowerCase()?.trim();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return "";
  return `https://${domain}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolución de URL: candidatos www / no-www / https / http + descubrimiento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye candidatos de URL en orden de preferencia a partir de lo que el
 * usuario ingresó. Mantiene el path/query si los hay.
 *
 * Ej: "enap.cl"  →  https://enap.cl, https://www.enap.cl, http://enap.cl, http://www.enap.cl
 *     "www.x.cl" →  https://www.x.cl, https://x.cl, http://www.x.cl, http://x.cl
 */
export function buildWebsiteCandidates(rawWebsite: string): string[] {
  const trimmed = rawWebsite.trim();
  if (!trimmed) return [];
  const hadProtocol = /^https?:\/\//i.test(trimmed);
  let url: URL;
  try {
    url = new URL(hadProtocol ? trimmed : `https://${trimmed}`);
  } catch {
    return [];
  }
  if (!["http:", "https:"].includes(url.protocol)) return [];

  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) return [];
  const pathQuery = url.pathname === "/" ? "" : `${url.pathname}${url.search}`;

  const isWww = host.startsWith("www.");
  const bareHost = isWww ? host.slice(4) : host;
  const wwwHost = isWww ? host : `www.${host}`;
  // Respeta la forma que ingresó el usuario primero.
  const hostsInOrder = isWww ? [wwwHost, bareHost] : [bareHost, wwwHost];

  const candidates: string[] = [];
  for (const scheme of ["https", "http"]) {
    for (const h of hostsInOrder) {
      candidates.push(`${scheme}://${h}${pathQuery}`);
    }
  }
  return [...new Set(candidates)];
}

function describeFetchFailure(err: unknown): string | null {
  const error = err as { name?: string; code?: string; cause?: { code?: string; name?: string } } | null;
  if (!error) return null;
  const code = error.code || error.cause?.code;
  const name = error.name || error.cause?.name;
  if (name === "AbortError") {
    return "El sitio web demoró demasiado en responder. Intenta nuevamente o verifica que la URL sea correcta.";
  }
  if (code === "UND_ERR_CONNECT_TIMEOUT") {
    return "El sitio web no respondió a tiempo. Es posible que esté caído o bloquee tráfico desde Vercel.";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "No se pudo resolver el dominio del sitio. Verifica que la URL sea correcta.";
  }
  if (code === "ECONNREFUSED") {
    return "El sitio rechazó la conexión.";
  }
  if (code === "ECONNRESET") {
    return "El sitio cerró la conexión inesperadamente.";
  }
  return null;
}

export { describeFetchFailure };

/** Un solo intento de fetch que lanza con mensaje amigable si falla. */
async function fetchHtmlOnceOrThrow(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
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
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resuelve y descarga el HTML probando cada candidato (www/no-www, https/http).
 * Si todos fallan y hay nombre de empresa, descubre el dominio por búsqueda web.
 */
async function resolveWebsiteHtml(
  rawWebsite: string,
  companyName: string,
): Promise<{ html: string; finalUrl: string }> {
  let lastError: unknown = null;

  const tryCandidates = async (seed: string): Promise<{ html: string; finalUrl: string } | null> => {
    for (const candidate of buildWebsiteCandidates(seed)) {
      try {
        const html = await fetchHtmlOnceOrThrow(candidate);
        return { html, finalUrl: candidate };
      } catch (err) {
        lastError = err;
      }
    }
    return null;
  };

  const seed = rawWebsite.trim();
  if (seed) {
    const direct = await tryCandidates(seed);
    if (direct) return direct;
  }

  // Fallback: descubrir dominio oficial por búsqueda web desde el nombre.
  if (companyName.trim()) {
    let discovered: string | null = null;
    try {
      discovered = await discoverCompanyWebsite(companyName.trim());
    } catch {
      discovered = null;
    }
    if (discovered) {
      const viaSearch = await tryCandidates(discovered);
      if (viaSearch) return viaSearch;
    }
  }

  const friendly =
    describeFetchFailure(lastError) ||
    (seed
      ? "No se pudo resolver el dominio del sitio. Verifica que la URL sea correcta."
      : "No se encontró el sitio web de la empresa.");
  throw new Error(friendly);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parseo de HTML
// ─────────────────────────────────────────────────────────────────────────────

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
    firstMatch(html, /<meta[^>]+property=["']og:logo["'][^>]+content=["']([^"']+)["'][^>]*>/i),
    firstMatch(html, /<meta[^>]+name=["']og:logo["'][^>]+content=["']([^"']+)["'][^>]*>/i),
    firstMatch(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i),
    firstMatch(html, /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i),
  ].filter(Boolean);

  const linkCandidates = collectRegexMatches(
    html,
    /<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
    6,
  );

  const jsonLdLogo = firstMatch(html, /"logo"\s*:\s*"([^"]+)"/i);

  const companyTokens = getCompanyTokens(companyName);
  const allCandidates: LogoCandidate[] = [];

  for (const c of [...metaCandidates, jsonLdLogo, ...linkCandidates].filter(Boolean)) {
    const absolute = resolveUrl(c, baseUrl);
    if (!absolute) continue;
    allCandidates.push({ url: absolute, source: "meta", score: 10 });
  }

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

      let score = 120;
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

async function downloadLogoToR2(logoUrl: string, tenantId?: string): Promise<string | null> {
  const response = await fetch(logoUrl, {
    headers: {
      "User-Agent": `Mozilla/5.0 (compatible; OPAI-Bot/1.0; +${process.env.NEXT_PUBLIC_SITE_URL || ""})`,
      Accept: "image/svg+xml,image/png,image/webp,image/jpeg,image/*",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const mime = (response.headers.get("content-type") || "").toLowerCase().split(";")[0];
  const allowed: Record<string, { ext: string; mime: string }> = {
    "image/png": { ext: ".png", mime: "image/png" },
    "image/jpeg": { ext: ".jpg", mime: "image/jpeg" },
    "image/webp": { ext: ".webp", mime: "image/webp" },
    "image/svg+xml": { ext: ".svg", mime: "image/svg+xml" },
  };
  const spec = allowed[mime];
  if (!spec) return null;

  const buffer: Buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength <= 0 || buffer.byteLength > 5 * 1024 * 1024) {
    return null;
  }

  const hash = createHash("sha1").update(logoUrl).digest("hex").slice(0, 12);
  let uploadBuffer: Buffer = buffer;
  let fileName = `logo-${Date.now()}-${hash}${spec.ext}`;
  let mimeType = spec.mime;

  if (spec.ext !== ".svg") {
    try {
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
      const rawCopy = Buffer.alloc(data.length);
      for (let i = 0; i < data.length; i++) rawCopy[i] = data[i];
      uploadBuffer = await sharp(rawCopy, { raw: { width, height, channels: 4 } }).png().toBuffer();
      fileName = `logo-${Date.now()}-${hash}.png`;
      mimeType = "image/png";
    } catch (logoErr) {
      console.error("Logo transparency processing failed, using raw:", logoErr);
    }
  }

  try {
    const result = await uploadFile(uploadBuffer, fileName, mimeType, "company-logos", tenantId);
    return result.publicUrl || null;
  } catch (err) {
    console.error("Logo upload to R2 failed:", err);
    return null;
  }
}

/** Single fetch auxiliar para rutas internas: no reintenta, falla silencioso ante 404. */
async function fetchHtmlQuiet(url: string, timeoutMs = 9000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9,en;q=0.5",
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const INTERNAL_PATHS_TRIED = [
  "/contacto",
  "/nosotros",
  "/quienes-somos",
  "/empresa",
  "/terminos-y-condiciones",
  "/terminos",
  "/politicas-de-privacidad",
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function mergeDedupeParagraphs(primary: string[], extra: string[], maxTotal = 24): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  function push(ps: string[]) {
    for (const p of ps) {
      const norm = normalizeWhitespace(p).slice(0, 400).toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(p);
      if (out.length >= maxTotal) break;
    }
  }
  push(primary);
  if (out.length < maxTotal) push(extra);
  return out;
}

async function scrapeWebsite(rawWebsite: string, companyName: string): Promise<ExtractedWebData> {
  const { html, finalUrl } = await resolveWebsiteHtml(rawWebsite, companyName);
  const websiteNormalized = finalUrl;

  const title = stripHtml(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const metaDescription = stripHtml(
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i),
  );
  let headings = collectRegexMatches(html, /<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi, 6);
  let paragraphs = collectRegexMatches(html, /<p[^>]*>([\s\S]*?)<\/p>/gi, 12).filter((p) => p.length > 40);

  let baseOrigin: string;
  try {
    baseOrigin = new URL(websiteNormalized).origin;
  } catch {
    baseOrigin = "";
  }

  if (baseOrigin) {
    const extraParas: string[] = [];
    for (const suffix of INTERNAL_PATHS_TRIED) {
      if (extraParas.length >= 28) break;
      const abs = `${baseOrigin}${suffix}`;
      const subHtml = await fetchHtmlQuiet(abs, 8500);
      if (!subHtml) continue;
      const subParas = collectRegexMatches(subHtml, /<p[^>]*>([\s\S]*?)<\/p>/gi, 10).filter((p) => p.length > 40);
      extraParas.push(...subParas);
      headings = mergeDedupeParagraphs(
        headings,
        collectRegexMatches(subHtml, /<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi, 4),
        12,
      );
    }
    paragraphs = mergeDedupeParagraphs(paragraphs, extraParas, 28);
  }

  const logoCandidates = detectLogoCandidates(html, websiteNormalized, companyName);
  const logoUrl = pickBestLogoCandidate(logoCandidates);

  return { websiteNormalized, title, metaDescription, headings, paragraphs, logoUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracción con IA + fallbacks por regex
// ─────────────────────────────────────────────────────────────────────────────

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
  clean = clean.split(/\s[:|–—-]\s/)[0]?.trim() || clean;
  clean = clean.replace(/^inicio\s*[-:]\s*/i, "").trim();
  return clean;
}

function guessCompanyNameFromExtracted(requestedCompanyName: string, extracted: ExtractedWebData): string {
  const candidates = [requestedCompanyName, extracted.headings[0] || "", extracted.title || ""]
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

async function enrichCompanyWithAi(
  companyName: string,
  website: string,
  extracted: ExtractedWebData,
): Promise<CompanyAiEnrichment> {
  let webHints: string[] = [];
  try {
    webHints = await fetchCompanyWebHints(companyName, website);
  } catch (hintErr) {
    console.warn("[company-enrich] web hints omitidos:", hintErr);
    webHints = [];
  }
  const sourceText = [
    `Empresa: ${companyName || "No especificada"}`,
    `Sitio: ${website}`,
    extracted.title ? `Título: ${extracted.title}` : "",
    extracted.metaDescription ? `Meta descripción: ${extracted.metaDescription}` : "",
    extracted.headings.length ? `Encabezados: ${extracted.headings.join(" | ")}` : "",
    extracted.paragraphs.length ? `Párrafos detectados: ${extracted.paragraphs.slice(0, 5).join(" | ")}` : "",
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
  let parsed: Partial<CompanyAiEnrichment>;
  try {
    parsed = JSON.parse(extractJsonObject(raw)) as Partial<CompanyAiEnrichment>;
  } catch {
    parsed = {};
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// API pública del módulo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pipeline completo: resolver URL (multi-candidato + descubrimiento) → scrape →
 * logo → IA. Lanza Error con mensaje amigable si no se puede resolver el sitio.
 */
export async function enrichCompanyFromWebsite(opts: {
  website: string;
  companyName?: string;
  tenantId?: string;
}): Promise<CompanyEnrichResult> {
  const companyName = (opts.companyName || "").trim();
  const extracted = await scrapeWebsite(opts.website || "", companyName);

  let localLogoUrl: string | null = null;
  if (extracted.logoUrl) {
    try {
      localLogoUrl = await downloadLogoToR2(extracted.logoUrl, opts.tenantId);
    } catch (logoError) {
      console.error("Error downloading company logo:", logoError);
    }
  }

  let enrichment: CompanyAiEnrichment = {
    companyNameDetected: guessCompanyNameFromExtracted(companyName, extracted),
    summary: extracted.metaDescription || extracted.headings[0] || NOT_AVAILABLE,
    industry: NOT_AVAILABLE,
    segment: NOT_AVAILABLE,
    legalName: NOT_AVAILABLE,
    companyRut:
      extractFirstRut(
        [extracted.title, extracted.metaDescription, ...extracted.headings, ...extracted.paragraphs].join(" "),
      ) || NOT_AVAILABLE,
    legalRepresentativeName: NOT_AVAILABLE,
    legalRepresentativeRut: NOT_AVAILABLE,
  };
  try {
    enrichment = await enrichCompanyWithAi(companyName, extracted.websiteNormalized, extracted);
  } catch (aiError) {
    console.error("Error generating AI company summary:", aiError);
  }

  return {
    websiteNormalized: extracted.websiteNormalized,
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
  };
}
