/**
 * Parsea el cuerpo de un fetch como JSON sin lanzar SyntaxError si el servidor
 * devolvió HTML o texto plano (timeouts, 502, páginas de error de Vercel/Next).
 */
export async function parseResponseJson<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 200);
    const looksHtml = preview.startsWith("<") || preview.toLowerCase().includes("<!doctype");
    if (!response.ok) {
      if (looksHtml) {
        throw new Error(
          `El servidor respondió con error (${response.status}). Si persiste, revisa logs o el tiempo de ejecución del envío.`
        );
      }
      throw new Error(preview || `Error ${response.status}`);
    }
    throw new Error(
      preview ? `Respuesta inesperada del servidor: ${preview}` : "Respuesta inválida del servidor"
    );
  }
}
