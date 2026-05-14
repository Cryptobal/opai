/**
 * Fetch helper para el Portal Acceso (kiosko del guardia).
 * Adjunta automáticamente el header Authorization: Bearer <deviceToken>
 * cuando se le pasa uno. Mantiene la firma de fetch para ser drop-in.
 *
 * NOTA: el deviceToken se obtiene del estado de AccessPortalApp; no se
 * lee de storage acá para evitar acoplar componentes al storage layer.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  deviceToken: string | null | undefined,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (deviceToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${deviceToken}`);
  }
  return fetch(input, { ...init, headers });
}
