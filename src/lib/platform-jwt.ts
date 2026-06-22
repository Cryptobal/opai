/**
 * Verificación del JWT de Platform Admin — edge-safe.
 *
 * Solo depende de `jose` (compatible con el runtime edge del middleware).
 * NO importa `next/headers` ni `bcryptjs`, a diferencia de platform-auth.ts,
 * para poder usarse tanto en el middleware (proxy.ts) como en server
 * components sin inflar/romper el bundle edge.
 */
import { jwtVerify } from 'jose';

export interface PlatformTokenPayload {
  platformAdminId: string;
  email: string;
  name: string;
}

function getSecret(): Uint8Array {
  const secret =
    process.env.PLATFORM_JWT_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('PLATFORM_JWT_SECRET is not set');
  return new TextEncoder().encode(secret);
}

/**
 * Verifica firma y expiración del token. Devuelve el payload si es válido,
 * o `null` si falta, está expirado, mal firmado, o no hay secret configurado
 * (fail-closed: ante la duda, sesión inválida).
 */
export async function verifyPlatformToken(
  token: string | undefined,
): Promise<PlatformTokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      platformAdminId: payload.platformAdminId as string,
      email: payload.email as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}
