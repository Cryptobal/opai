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
    throw new Error(`BNE ${res.status} ${path}: ${text.slice(0, 300)}`);
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
// Job mapping & publishing
// ---------------------------------------------------------------------------

/**
 * Build the BNE oferta payload from an AtsJobPosting + integration defaults.
 * Field mapping is intentionally conservative — when in doubt we use the
 * tenant's default catalog IDs (configured in ATS settings) so that publishing
 * never fails for missing optional fields. The advanced fields (region,
 * comuna numeric IDs) require name->id resolution against the BNE catalogs;
 * for now we send what we have and any missing IDs default to the integration
 * defaults.
 */
interface BneOfertaPayload {
  idEmpleador: number;
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
  };
  vacantesRequeridas: {
    vacantesRequeridas: number;
    fechaPrevistaIncorporacion?: string;
  };
  ubicacion?: { region?: number; comuna?: number };
}

interface BneIntegrationLite {
  idEmpleador: number | null;
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
  vacantes: number;
  experienciaMinAnios: number | null;
  rentaMin: number | null;
  rentaMax: number | null;
}

function buildOfertaPayload(
  job: JobLite,
  integration: BneIntegrationLite,
): BneOfertaPayload {
  if (!integration.idEmpleador || !integration.rutEmpleador) {
    throw new Error(
      "BNE: faltan idEmpleador o rutEmpleador — completa la configuracion antes de publicar",
    );
  }
  // Sensible defaults if the tenant hasn't customised them yet. These are
  // placeholders aligned with the manual examples — admins can override per
  // tenant from the UI later (or via the catalogs lookup endpoints).
  const ocupacion = integration.defaultOcupacion ?? 7543;
  const nivelCargo = integration.defaultNivelCargo ?? 28;
  const jornada = integration.defaultJornadaTrabajo ?? 9;
  const relacion = integration.defaultRelacionContractual ?? 1;
  const rango = integration.defaultRangoSalarios ?? 8;

  const today = new Date().toISOString().slice(0, 10);
  const descripcion = [job.descripcion, job.funciones]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2000);

  return {
    idEmpleador: integration.idEmpleador,
    origen: "API",
    ofertaTercero: false,
    RutEmpleador: integration.rutEmpleador.replace(/[.\-\s]/g, ""),
    mostrarNombreEmpresa: integration.mostrarNombreEmpresa,
    duracionOferta: {
      fechaInicioPublicacion: today,
      diasPublicacion: integration.defaultDiasPublicacion,
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
    },
    vacantesRequeridas: {
      vacantesRequeridas: job.vacantes,
    },
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

    const payload = buildOfertaPayload(job, integration);

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
