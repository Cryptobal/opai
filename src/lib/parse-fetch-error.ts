/**
 * Lee el cuerpo de una Response fallida y extrae mensaje usable (JSON error / texto corto).
 * Solo usar cuando res.ok === false (consume el body).
 */
export async function getErrorMessageFromResponse(
  res: Response,
  fallback: string
): Promise<string> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return `${fallback} (${res.status})`;
  }
  if (!text?.trim()) return `${fallback} (${res.status})`;
  try {
    const j = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof j.error === "string" && j.error.trim()) return j.error.trim();
    if (typeof j.message === "string" && j.message.trim()) return j.message.trim();
  } catch {
    /* no es JSON */
  }
  const trimmed = text.trim();
  if (trimmed.length > 0 && trimmed.length < 400 && !trimmed.startsWith("<")) {
    return trimmed;
  }
  return `${fallback} (${res.status})`;
}
