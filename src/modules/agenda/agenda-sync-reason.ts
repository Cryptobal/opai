const GOOGLE_CONNECT_PATTERNS = [
  /desconectad/i,
  /sin cuenta/i,
  /no.*conect/i,
  /not connected/i,
  /no está active/i,
  /cuenta de google/i,
];

/** Detecta si el motivo de sync apunta a falta de cuenta Google. */
export function isGoogleConnectReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return GOOGLE_CONNECT_PATTERNS.some((re) => re.test(reason));
}

/**
 * Mapea lastError técnico a un mensaje controlado para el cliente.
 * Nunca expone correos ni payloads crudos de Google.
 */
export function sanitizeSyncReason(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Dueño de cuenta CRM (licitación): debe evaluarse antes de patrones Google
  // genéricos que podrían coincidir con "cuenta"/"no".
  if (/dueño|ownerId|asigná un responsable/i.test(trimmed)) {
    return "La cuenta del negocio no tiene dueño asignado: asigná un responsable";
  }
  if (isGoogleConnectReason(trimmed)) {
    return "Sin cuenta de Google Calendar conectada";
  }
  if (/rate.?limit|quota|429/i.test(trimmed)) {
    return "Google Calendar alcanzó el límite de solicitudes; se reintentará";
  }
  if (/token|revoked|invalid_grant|401|403/i.test(trimmed)) {
    return "Hay que volver a conectar Google Calendar";
  }
  if (/network|timeout|ECONN|ENOTFOUND/i.test(trimmed)) {
    return "Error de red al sincronizar; se reintentará";
  }
  return "No se pudo sincronizar con Google Calendar";
}
