/**
 * Matching modelo ↔ proveedor. Varios features piden un override económico
 * (ej. "gpt-4o-mini"), pero el proveedor activo puede ser otro (Anthropic,
 * Google). Enviar un modelo ajeno a la API del proveedor activo devuelve
 * "model not found" y el feature falla silenciosamente.
 */
export function modelBelongsToProvider(modelId: string, providerType: string): boolean {
  const m = modelId.trim().toLowerCase();
  if (providerType === "openai") return m.startsWith("gpt") || /^o\d/.test(m) || m.startsWith("chatgpt");
  if (providerType === "anthropic") return m.startsWith("claude");
  if (providerType === "google") return m.startsWith("gemini");
  return false;
}
