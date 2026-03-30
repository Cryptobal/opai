/**
 * Alertas de Cobertura — Token Service
 *
 * Genera y verifica JWT tokens para guardias externos que aceptan alertas
 * sin necesidad de login (vía link directo con token en URL).
 */

import { SignJWT, jwtVerify } from "jose";

const ALERTA_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "opai-alertas-cobertura-fallback-secret",
);

export async function generarTokenExterno(
  alertaId: string,
  guardiaId: string,
): Promise<string> {
  return new SignJWT({ alertaId, guardiaId, tipo: "alerta_externa" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(ALERTA_SECRET);
}

export async function verificarTokenExterno(
  token: string,
): Promise<{ alertaId: string; guardiaId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, ALERTA_SECRET);
    if (payload.tipo !== "alerta_externa") return null;
    return {
      alertaId: payload.alertaId as string,
      guardiaId: payload.guardiaId as string,
    };
  } catch {
    return null;
  }
}
