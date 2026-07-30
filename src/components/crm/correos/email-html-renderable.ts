/**
 * Detecta si un HTML ya sanitizado tiene algo que mostrar en el iframe:
 * texto visible (tras quitar etiquetas/entidades) o al menos un `<img`.
 * Sesgo hacia `true` ante duda — mejor montar el iframe que ocultar contenido.
 */
export function emailHtmlIsRenderable(safeHtml: string): boolean {
  if (!safeHtml || !safeHtml.trim()) return false;
  if (/<img\b/i.test(safeHtml)) return true;

  const text = safeHtml
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_m, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : " ";
    })
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > 0;
}
