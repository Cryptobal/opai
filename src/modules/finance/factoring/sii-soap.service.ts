/**
 * Service para integración SOAP con wsRPETCConsulta del SII.
 * Bloque 9 v3 — usa el helper validado en producción (B0).
 *
 * Cachea tokens del SII en memoria del proceso (TTL 8min, conservador
 * vs los ~10min de validez oficial). Cada cert digital tiene su propia
 * entry en el cache, indexada por env + rutTitular.
 *
 * Multi-tenant: cada llamada a checkAecStatus carga el TenantDteCertificate
 * del tenant y lo descifra in-memory (jamás se loguea).
 */

import { prisma } from "@/lib/prisma";
import { decryptBuffer, decryptString } from "@/lib/dte-encryption";
import {
  extractCertFromPfx,
  getEstEnvioAec,
  getSiiSeed,
  getSiiToken,
  signSeedXml,
  type SiiEnvironment,
} from "@/lib/sii/soap-client";

interface CachedToken {
  token: string;
  expAt: number;
}

const tokenCache = new Map<string, CachedToken>();
const TOKEN_TTL_MS = 8 * 60 * 1000;

/**
 * Devuelve un token válido del SII para el cert dado, usando cache si
 * está disponible y no expiró.
 */
export async function getOrCreateSiiToken(
  rutTitular: string,
  pfxBuffer: Buffer,
  pfxPassword: string,
  env: SiiEnvironment,
): Promise<string> {
  const cacheKey = `${env}:${rutTitular}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expAt > Date.now()) return cached.token;

  const cert = extractCertFromPfx(pfxBuffer, pfxPassword);
  const seed = await getSiiSeed(env);
  const signedXml = signSeedXml(seed, cert);
  const token = await getSiiToken(env, signedXml);
  tokenCache.set(cacheKey, { token, expAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

export interface CheckAecStatusResult {
  estadoEnvio: string;
  descEstado: string;
  isAccepted: boolean;
  isRejected: boolean;
  isInProgress: boolean;
  rawXml: string;
}

/**
 * Consulta estado de un AEC en RPETC. Carga cert del tenant, obtiene
 * token (cacheado), llama getEstEnvio. Si token inválido (codes 3/4/5),
 * invalida cache y reintenta una vez.
 *
 * Codes mapeados según ws_consulta_estado_aec.pdf v1.2 SII:
 *   - EOK/EPR                    → APPROVED (terminal aceptado)
 *   - UPL/RCP/SOK/FSO/COK/VDC/VCS → en proceso (no terminal)
 *   - RSC/RFS/RCR/RDC/RCS/EAN    → rechazado (terminal)
 */
export async function checkAecStatus(
  tenantId: string,
  trackId: string,
): Promise<CheckAecStatusResult> {
  const [dteCfg, cert] = await Promise.all([
    prisma.tenantDteConfig.findUnique({ where: { tenantId } }),
    prisma.tenantDteCertificate.findUnique({ where: { tenantId } }),
  ]);
  if (!dteCfg || !cert) {
    throw new Error(`Tenant ${tenantId} sin config DTE o cert`);
  }

  const env: SiiEnvironment =
    dteCfg.environment === "PRODUCTION" ? "PRODUCTION" : "CERTIFICATION";
  const pfxBuffer = decryptBuffer(Buffer.from(cert.pfxDataEnc));
  const pfxPassword = decryptString(cert.passwordEnc);

  let token = await getOrCreateSiiToken(
    cert.rutTitular,
    pfxBuffer,
    pfxPassword,
    env,
  );
  let result = await getEstEnvioAec(env, token, trackId);

  // Reintentar 1 vez si token inválido (códigos típicos del SII).
  if (!result.ok && ["3", "4", "5"].includes(result.estado)) {
    tokenCache.delete(`${env}:${cert.rutTitular}`);
    token = await getOrCreateSiiToken(cert.rutTitular, pfxBuffer, pfxPassword, env);
    result = await getEstEnvioAec(env, token, trackId);
  }

  const ee = result.estadoEnvio ?? "";
  return {
    estadoEnvio: ee,
    descEstado: result.descEstado ?? result.glosa ?? "",
    isAccepted: ["EOK", "EPR"].includes(ee),
    isRejected: ["RSC", "RFS", "RCR", "RDC", "RCS", "EAN"].includes(ee),
    isInProgress: ["UPL", "RCP", "SOK", "FSO", "COK", "VDC", "VCS"].includes(ee),
    rawXml: result.rawXml,
  };
}
