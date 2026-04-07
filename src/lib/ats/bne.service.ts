/**
 * BNE (Bolsa Nacional de Empleo) integration service.
 *
 * Per-tenant OAuth2 (Client Credentials) integration with the BNE Ofertas
 * Publicas REST API. Each tenant requests its own credentials from BNE
 * (https://www.bne.cl) and pastes them into ATS configuration. We never share
 * credentials across tenants.
 *
 * Credentials are encrypted at rest with AES-256-GCM using the existing
 * `src/lib/crypto.ts` helper. The encryption key is derived from the
 * BNE_ENCRYPTION_KEY env var; if missing, falls back to NEXTAUTH_SECRET so the
 * integration still works in dev (loud warning).
 *
 * Reference: Manual API BNE v3 (15/04/2025).
 */

import { prisma } from "@/lib/prisma";
import { encryptText, decryptText } from "@/lib/crypto";

const BNE_BASE_URLS = {
  prod: "https://api.bne.cl",
  test: "https://test.api.bne.cl",
} as const;

type BneEnv = keyof typeof BNE_BASE_URLS;

function getEncryptionSecret(): string {
  // Reuse the existing application secrets so ops doesn't have to manage a new
  // key. Order of preference: a dedicated BNE key (if provided), the AI
  // provider key already used for encrypting other secrets at rest, then
  // NextAuth's secret. The crypto helper hashes the input to a 32-byte key, so
  // any non-empty value works.
  const key =
    process.env.BNE_ENCRYPTION_KEY ||
    process.env.AI_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error(
      "[BNE] Missing AI_ENCRYPTION_KEY / AUTH_SECRET — cannot encrypt credentials.",
    );
  }
  return key;
}

export function encryptBneSecret(plain: string): string {
  return encryptText(plain, getEncryptionSecret());
}

export function decryptBneSecret(payload: string): string {
  return decryptText(payload, getEncryptionSecret());
}

/** Mask a secret for safe display in the UI (first 4, last 4). */
export function maskSecret(s: string | null | undefined): string {
  if (!s) return "";
  if (s.length <= 8) return "•".repeat(s.length);
  return `${s.slice(0, 4)}${"•".repeat(Math.max(4, s.length - 8))}${s.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Token cache (per-process, per-tenant). Token TTL is ~1h per BNE manual.
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}
const tokenCache = new Map<string, CachedToken>();

/**
 * Obtain a Bearer token for a tenant. Uses an in-process cache and the DB
 * `tokenExpiresAt` field as a secondary cache. Refreshes via OAuth2 Client
 * Credentials when expired.
 */
export async function getBneAccessToken(tenantId: string): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(tenantId);
  if (cached && cached.expiresAt - 60_000 > now) return cached.token;

  const integration = await prisma.bneIntegration.findUnique({
    where: { tenantId },
  });
  if (!integration?.consumerKey || !integration?.consumerSecretEncrypted) {
    throw new Error("BNE: credenciales no configuradas para este tenant");
  }

  // DB-cached token still valid?
  if (
    integration.accessToken &&
    integration.tokenExpiresAt &&
    integration.tokenExpiresAt.getTime() - 60_000 > now
  ) {
    tokenCache.set(tenantId, {
      token: integration.accessToken,
      expiresAt: integration.tokenExpiresAt.getTime(),
    });
    return integration.accessToken;
  }

  const env: BneEnv = (integration.environment as BneEnv) || "prod";
  const baseUrl = BNE_BASE_URLS[env] || BNE_BASE_URLS.prod;
  const consumerSecret = decryptBneSecret(integration.consumerSecretEncrypted);
  const basic = Buffer.from(
    `${integration.consumerKey}:${consumerSecret}`,
  ).toString("base64");

  const res = await fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=read",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await prisma.bneIntegration.update({
      where: { tenantId },
      data: {
        status: "error",
        lastErrorAt: new Date(),
        lastError: `Token ${res.status}: ${text.slice(0, 500)}`,
      },
    });
    throw new Error(`BNE token ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in?: number;
    token_type?: string;
  };
  const expiresAt = now + (json.expires_in ?? 3600) * 1000;

  await prisma.bneIntegration.update({
    where: { tenantId },
    data: {
      accessToken: json.access_token,
      tokenExpiresAt: new Date(expiresAt),
      status: "active",
      lastError: null,
      lastErrorAt: null,
    },
  });
  tokenCache.set(tenantId, { token: json.access_token, expiresAt });
  return json.access_token;
}

/** Reset cached token (use after credential rotation). */
export function invalidateBneToken(tenantId: string) {
  tokenCache.delete(tenantId);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Try to extract a human-readable error message from a BNE error body.
 *
 * BNE returns Spring Boot ApiControllerAdvice payloads that look like:
 *   { "cause": null, "stackTrace": [...lots...], "message": "Campo X invalido", ... }
 * The stackTrace dwarfs the actual message and isn't useful in toasts. This
 * helper hunts for the first informative `message` / `error` / `mensaje`
 * field anywhere in the JSON tree, falling back to the raw text snippet.
 */
function extractBneErrorMessage(text: string): string {
  if (!text) return "(sin cuerpo)";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text.slice(0, 300);
  }
  const candidates: string[] = [];
  function walk(v: unknown, depth: number) {
    if (depth > 4 || v == null) return;
    if (Array.isArray(v)) {
      for (const item of v.slice(0, 5)) walk(item, depth + 1);
      return;
    }
    if (typeof v !== "object") return;
    const obj = v as Record<string, unknown>;
    for (const key of [
      "descripcion",
      "message",
      "mensaje",
      "error",
      "errorMessage",
      "detail",
      "description",
    ]) {
      const val = obj[key];
      if (typeof val === "string" && val.length > 0 && val.length < 500) {
        candidates.push(val);
      }
    }
    for (const key of Object.keys(obj)) {
      if (key === "stackTrace" || key === "suppressed") continue;
      walk(obj[key], depth + 1);
    }
  }
  walk(parsed, 0);
  if (candidates.length === 0) return text.slice(0, 300);
  // Prefer the longest non-trivial message — usually the most descriptive.
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

async function bneFetch<T>(
  tenantId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const integration = await prisma.bneIntegration.findUnique({
    where: { tenantId },
    select: { environment: true },
  });
  const env: BneEnv = (integration?.environment as BneEnv) || "prod";
  const baseUrl = BNE_BASE_URLS[env];
  const token = await getBneAccessToken(tenantId);

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const message = extractBneErrorMessage(text);
    // Always log the meaningful parts of the body server-side. We strip the
    // huge `stackTrace` array because BNE returns Spring stack traces and they
    // dwarf the descriptive fields.
    let logBody: unknown = text.slice(0, 4000);
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const { stackTrace: _st, suppressed: _sp, ...rest } = j;
      logBody = rest;
    } catch {}
    console.error(`[BNE] ${res.status} ${path}:`, logBody);
    throw new Error(`BNE ${res.status} ${path}: ${message}`);
  }
  // Some endpoints (DELETE) may return empty body.
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Look up an empleador by RUT and return its BNE numeric idEmpleador and the
 * first available administrator user (idUsuarioPublicador). The BNE manual
 * (4.3.2.4) exposes GET /empresas?rut={rut} for this discovery flow.
 *
 * RUT must be sent without dots/dashes per BNE conventions.
 */
export async function discoverEmpleador(
  tenantId: string,
  rut: string,
): Promise<{ idEmpleador: number | null; idUsuario: number | null }> {
  // BNE expects RUT joined (no dots, no dash). Other formats return 422/404.
  const cleanRut = rut.replace(/[.\-\s]/g, "");
  type EmpresaRow = { id?: number; idEmpleador?: number };
  // The endpoint may return either a single object (current PROD behaviour)
  // or an array depending on tenant/version — handle both shapes.
  const empresas = await bneFetch<
    EmpresaRow | EmpresaRow[] | { resultado?: EmpresaRow[] }
  >(tenantId, `/OfertasPublicas/v1/empresas?rut=${encodeURIComponent(cleanRut)}`);
  let row: EmpresaRow | undefined;
  if (Array.isArray(empresas)) row = empresas[0];
  else if (empresas && typeof empresas === "object") {
    if ("resultado" in empresas && Array.isArray(empresas.resultado)) {
      row = empresas.resultado[0];
    } else if ("id" in empresas || "idEmpleador" in empresas) {
      row = empresas as EmpresaRow;
    }
  }
  const idEmpleador = row?.idEmpleador ?? row?.id ?? null;
  if (!idEmpleador) return { idEmpleador: null, idUsuario: null };

  type UsuarioRow = { id?: number; perfil?: string };
  const usuarios = await bneFetch<
    UsuarioRow[] | { resultado?: UsuarioRow[] }
  >(tenantId, `/OfertasPublicas/v1/empresas/${idEmpleador}/usuarios`).catch(
    () => null,
  );
  const userList: UsuarioRow[] = Array.isArray(usuarios)
    ? usuarios
    : usuarios?.resultado || [];
  const admin = userList.find((u) => /admin/i.test(u.perfil || "")) || userList[0];
  return { idEmpleador, idUsuario: admin?.id ?? null };
}

/** Test the connection: just obtain a token. Returns ok / error message. */
export async function testBneConnection(
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    invalidateBneToken(tenantId);
    await getBneAccessToken(tenantId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Catalog cache (regiones, comunas, jornadas, ocupaciones, …)
// ---------------------------------------------------------------------------

interface BneCatalogRow {
  id: number;
  valor: string;
}
interface BneCatalogCache {
  regiones?: BneCatalogRow[];
  comunasByRegion?: Record<string, BneCatalogRow[]>;
  jornadas?: BneCatalogRow[];
  rangosSalariales?: BneCatalogRow[];
  nivelesCargo?: BneCatalogRow[];
  fetchedAt?: string;
}

const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function getCatalogCache(tenantId: string): Promise<BneCatalogCache> {
  const row = await prisma.bneIntegration.findUnique({
    where: { tenantId },
    select: { catalogCache: true, catalogCacheAt: true },
  });
  if (
    row?.catalogCache &&
    row.catalogCacheAt &&
    Date.now() - row.catalogCacheAt.getTime() < CATALOG_TTL_MS
  ) {
    return row.catalogCache as BneCatalogCache;
  }
  // Refresh from BNE.
  const cache: BneCatalogCache = { comunasByRegion: {} };
  try {
    cache.regiones = await bneFetch<BneCatalogRow[]>(
      tenantId,
      "/OfertasPublicas/v1/data/regiones",
    );
  } catch (e) {
    console.warn("[BNE] catalog regiones failed:", e);
  }
  try {
    cache.jornadas = await bneFetch<BneCatalogRow[]>(
      tenantId,
      "/OfertasPublicas/v1/data/ofertas/jornadas-trabajo",
    );
  } catch {}
  try {
    cache.rangosSalariales = await bneFetch<BneCatalogRow[]>(
      tenantId,
      "/OfertasPublicas/v1/data/ofertas/rangos-salariales",
    );
  } catch {}
  try {
    cache.nivelesCargo = await bneFetch<BneCatalogRow[]>(
      tenantId,
      "/OfertasPublicas/v1/data/ofertas/niveles-cargo",
    );
  } catch {}
  cache.fetchedAt = new Date().toISOString();

  await prisma.bneIntegration.update({
    where: { tenantId },
    data: {
      catalogCache: cache as unknown as object,
      catalogCacheAt: new Date(),
    },
  });
  return cache;
}

async function getComunasForRegion(
  tenantId: string,
  regionId: number,
): Promise<BneCatalogRow[]> {
  const cache = await getCatalogCache(tenantId);
  const map = cache.comunasByRegion || {};
  if (map[String(regionId)]) return map[String(regionId)];
  try {
    const rows = await bneFetch<BneCatalogRow[]>(
      tenantId,
      `/OfertasPublicas/v1/data/regiones/${regionId}/comunas`,
    );
    map[String(regionId)] = rows;
    await prisma.bneIntegration.update({
      where: { tenantId },
      data: {
        catalogCache: { ...cache, comunasByRegion: map } as unknown as object,
      },
    });
    return rows;
  } catch (e) {
    console.warn(`[BNE] comunas region ${regionId} failed:`, e);
    return [];
  }
}

/** Valid `diasPublicacion` values per BNE catalog (periodos-publicacion). */
const BNE_PERIODOS_VALIDOS = [1, 3, 5, 7, 14, 21, 28, 35, 42, 49, 56, 63];
function snapDiasPublicacion(dias: number): number {
  if (BNE_PERIODOS_VALIDOS.includes(dias)) return dias;
  // Snap to the closest valid value, preferring shorter duration on ties.
  let best = BNE_PERIODOS_VALIDOS[0];
  let bestDiff = Math.abs(dias - best);
  for (const v of BNE_PERIODOS_VALIDOS) {
    const d = Math.abs(dias - v);
    if (d < bestDiff || (d === bestDiff && v < best)) {
      best = v;
      bestDiff = d;
    }
  }
  return best;
}

/** Loose name match: ignores case, accents, parentheses content. */
function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function findCatalogId(
  rows: BneCatalogRow[] | undefined,
  needle: string,
): number | null {
  if (!rows || !needle) return null;
  const target = normaliseName(needle);
  // exact first
  const exact = rows.find((r) => normaliseName(r.valor) === target);
  if (exact) return exact.id;
  // contains either way
  const partial = rows.find(
    (r) =>
      normaliseName(r.valor).includes(target) ||
      target.includes(normaliseName(r.valor)),
  );
  return partial?.id ?? null;
}

// ---------------------------------------------------------------------------
// Job mapping & publishing
// ---------------------------------------------------------------------------

/**
 * BNE oferta payload schema (subset of the manual section 4.3.2.1 used by us).
 *
 * All numeric IDs reference BNE catalogs:
 *   - jornadaTrabajo:    /data/ofertas/jornadas-trabajo
 *   - relacionContractual: /data/ofertas/relaciones-contractuales (1 = Contrato indefinido)
 *   - rangoSalarios:     /data/ofertas/rangos-salariales
 *   - ocupacion:         /data/ofertas/ocupaciones (8133 = "Guardia")
 *   - nivelCargo:        /data/ofertas/niveles-cargo (12 = "Operario")
 *   - region/comuna:     /data/regiones, /data/regiones/{id}/comunas
 */
interface BneOfertaPayload {
  idEmpleador: number;
  idUsuarioPublicador?: number;
  origen: "API";
  ofertaTercero: false;
  RutEmpleador: string;
  mostrarNombreEmpresa: boolean;
  duracionOferta: { fechaInicioPublicacion: string; diasPublicacion: number };
  lod: false;
  descripcionCargo: {
    puesto: string;
    ocupacion: number;
    descripcion: string;
    nivelCargo: number;
    experienciaRequerida: number;
    esPractica: false;
  };
  condicionesLaborales: {
    jornadaTrabajo: number;
    relacionContractual: number;
    rangoSalarios: number;
    mostrarSueldo: boolean;
    turnosTrabajo: {
      nocturno: boolean;
      soloManana: boolean;
      soloTarde: boolean;
      especiales: boolean;
      finDeSemana: boolean;
    };
  };
  vacantesRequeridas: {
    vacantesRequeridas: number;
    invitacionesAEnviar: number;
    fechaPrevistaIncorporacion: string;
  };
  ubicacion: { region: number; comuna: number };
}

interface BneIntegrationLite {
  idEmpleador: number | null;
  idUsuarioPublicador: number | null;
  rutEmpleador: string | null;
  mostrarNombreEmpresa: boolean;
  defaultJornadaTrabajo: number | null;
  defaultRelacionContractual: number | null;
  defaultRangoSalarios: number | null;
  defaultOcupacion: number | null;
  defaultNivelCargo: number | null;
  defaultDiasPublicacion: number;
}

interface JobLite {
  titulo: string;
  descripcion: string;
  funciones: string | null;
  turno: string;
  region: string;
  commune: string | null;
  vacantes: number;
  experienciaMinAnios: number | null;
  rentaMin: number | null;
  rentaMax: number | null;
}

/** Map our internal `turno` enum to BNE's turnosTrabajo flags. */
function mapTurnosTrabajo(turno: string) {
  const t = (turno || "").toLowerCase();
  return {
    nocturno: t.includes("noche") || t.includes("nocturno"),
    soloManana: t.includes("manana") || t.includes("mañana") || t.includes("dia"),
    soloTarde: t.includes("tarde"),
    especiales: t === "otro" || t.includes("especial"),
    finDeSemana: t.includes("fds") || t.includes("fin de semana"),
  };
}

/** Pick a salary range id from rentaMin/Max against the catalog. */
function pickRangoSalarios(
  rentaMin: number | null,
  rangos: BneCatalogRow[] | undefined,
): number | null {
  if (!rangos || rangos.length === 0) return null;
  if (rentaMin == null) return rangos[1]?.id ?? rangos[0]?.id ?? null;
  // Catalog rows are ordered low → high; pick the first whose floor >= rentaMin
  // OR fall back to the highest. We approximate by index since the API doesn't
  // expose explicit numeric thresholds.
  const idx = Math.min(
    Math.max(0, Math.floor((rentaMin - 539000) / 150000) + 1),
    rangos.length - 1,
  );
  return rangos[idx]?.id ?? rangos[0]?.id ?? null;
}

async function buildOfertaPayload(
  tenantId: string,
  job: JobLite,
  integration: BneIntegrationLite,
): Promise<BneOfertaPayload> {
  if (!integration.idEmpleador || !integration.rutEmpleador) {
    throw new Error(
      "BNE: faltan idEmpleador o rutEmpleador — completa la configuracion antes de publicar",
    );
  }

  const cache = await getCatalogCache(tenantId);

  // Resolve region by name against the BNE catalog. If we can't, throw early
  // with a helpful message instead of letting BNE 400 with a stack trace.
  const regionId =
    findCatalogId(cache.regiones, job.region) ??
    findCatalogId(cache.regiones, "Metropolitana");
  if (!regionId) {
    throw new Error(`BNE: no se pudo resolver region "${job.region}"`);
  }

  // Resolve comuna inside that region. If the job has no comuna, fall back to
  // a representative one (Santiago for Metropolitana, otherwise first).
  const comunas = await getComunasForRegion(tenantId, regionId);
  const comunaId =
    findCatalogId(comunas, job.commune || "") ??
    findCatalogId(comunas, "Santiago") ??
    comunas[0]?.id;
  if (!comunaId) {
    throw new Error(
      `BNE: no se pudo resolver comuna "${job.commune ?? "(vacia)"}" en region ${regionId}`,
    );
  }

  // Defaults — prefer per-tenant overrides, then sensible BNE catalog values.
  const ocupacion = integration.defaultOcupacion ?? 8133; // "Guardia"
  const nivelCargo = integration.defaultNivelCargo ?? 12; // "Operario"
  const jornada =
    integration.defaultJornadaTrabajo ??
    findCatalogId(cache.jornadas, "Jornada Completa") ??
    9;
  const relacion = integration.defaultRelacionContractual ?? 3; // 3 = "Contrato indefinido" (NO 1, que es "por obra o faena")
  const rango =
    integration.defaultRangoSalarios ??
    pickRangoSalarios(job.rentaMin, cache.rangosSalariales) ??
    2;

  const today = new Date();
  const fechaInicioPublicacion = today.toISOString().slice(0, 10);
  const fechaIncorp = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const descripcion = [job.descripcion, job.funciones]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2000);

  return {
    idEmpleador: integration.idEmpleador,
    ...(integration.idUsuarioPublicador
      ? { idUsuarioPublicador: integration.idUsuarioPublicador }
      : {}),
    origen: "API",
    ofertaTercero: false,
    RutEmpleador: integration.rutEmpleador.replace(/[.\-\s]/g, ""),
    mostrarNombreEmpresa: integration.mostrarNombreEmpresa,
    duracionOferta: {
      fechaInicioPublicacion,
      diasPublicacion: snapDiasPublicacion(integration.defaultDiasPublicacion),
    },
    lod: false,
    descripcionCargo: {
      puesto: job.titulo.slice(0, 100),
      ocupacion,
      descripcion,
      nivelCargo,
      experienciaRequerida: job.experienciaMinAnios ?? 0,
      esPractica: false,
    },
    condicionesLaborales: {
      jornadaTrabajo: jornada,
      relacionContractual: relacion,
      rangoSalarios: rango,
      mostrarSueldo: !!(job.rentaMin || job.rentaMax),
      turnosTrabajo: mapTurnosTrabajo(job.turno),
    },
    vacantesRequeridas: {
      vacantesRequeridas: job.vacantes,
      invitacionesAEnviar: Math.max(10, job.vacantes * 10),
      fechaPrevistaIncorporacion: fechaIncorp,
    },
    ubicacion: { region: regionId, comuna: comunaId },
  };
}

/**
 * Publish a job posting to BNE Ofertas Publicas API.
 *
 * Returns externalId = BNE oferta id when successful. Stores last error in the
 * integration row when failing for ops debugging.
 */
export async function syncJobToBne(
  jobPostingId: string,
  tenantId: string,
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  try {
    const [job, integration] = await Promise.all([
      prisma.atsJobPosting.findUnique({
        where: { id: jobPostingId },
        select: {
          titulo: true,
          descripcion: true,
          funciones: true,
          turno: true,
          region: true,
          commune: true,
          vacantes: true,
          experienciaMinAnios: true,
          rentaMin: true,
          rentaMax: true,
        },
      }),
      prisma.bneIntegration.findUnique({ where: { tenantId } }),
    ]);
    if (!job) return { success: false, error: "Aviso no encontrado" };
    if (!integration)
      return { success: false, error: "BNE no configurado para este tenant" };

    const payload = await buildOfertaPayload(tenantId, job, integration);
    if (process.env.BNE_DEBUG === "1") {
      console.log("[BNE] payload →", JSON.stringify(payload));
    }

    type OfertaResponse = { id?: number | string; idOferta?: number | string };
    const result = await bneFetch<OfertaResponse>(
      tenantId,
      "/OfertasPublicas/v1/ofertas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const externalId = String(result?.id ?? result?.idOferta ?? "");
    await prisma.bneIntegration.update({
      where: { tenantId },
      data: {
        status: "active",
        lastSyncAt: new Date(),
        lastError: null,
        lastErrorAt: null,
        jobCount: { increment: 1 },
      },
    });
    return { success: true, externalId: externalId || undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.bneIntegration
      .update({
        where: { tenantId },
        data: {
          status: "error",
          lastErrorAt: new Date(),
          lastError: message.slice(0, 1000),
        },
      })
      .catch(() => {});
    return { success: false, error: message };
  }
}
