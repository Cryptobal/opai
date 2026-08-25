export type ParsedApiJson = {
  success: boolean;
  error?: string;
  detail?: string;
  data?: unknown;
};

/**
 * Parsea el body de una API sin tirar. Body vacío o JSON truncado
 * devuelven `{ success: false, error, detail? }`.
 */
export function parseApiJsonText(text: string): ParsedApiJson {
  const raw = (text ?? "").trim();
  if (!raw) {
    return { success: false, error: "Respuesta vacía del servidor" };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { success: false, error: "Respuesta inválida del servidor" };
    }
    const obj = parsed as Record<string, unknown>;
    return {
      success: obj.success === true,
      error: typeof obj.error === "string" ? obj.error : undefined,
      detail: typeof obj.detail === "string" ? obj.detail : undefined,
      data: obj.data,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "JSON truncado";
    return {
      success: false,
      error: "No se pudo leer la respuesta del servidor",
      detail: `${reason}: ${raw.slice(0, 120)}`,
    };
  }
}
