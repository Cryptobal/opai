/**
 * Revocación upstream del grant OAuth en Google.
 *
 * Best-effort: nunca lanza. Si Google rechaza la llamada (token ya inválido,
 * red caída), se registra y el caller continúa con la desconexión local.
 */

export const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Corte duro de la llamada a Google: un fetch colgado no debe impedir que el
 * caller complete la desconexión local antes del límite de la plataforma. */
const REVOKE_TIMEOUT_MS = 10_000;

/**
 * Revoca un token OAuth (refresh o access) contra Google. Revocar el refresh
 * token invalida el grant completo, incluidos los access tokens vigentes.
 * @returns true si Google confirmó la revocación.
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(GOOGLE_OAUTH_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("[gmail] revocación upstream rechazada por Google", {
        status: res.status,
      });
    }
    return res.ok;
  } catch (error) {
    console.warn("[gmail] revocación upstream falló", error);
    return false;
  }
}
