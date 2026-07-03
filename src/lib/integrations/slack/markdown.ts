/**
 * Conversión de Markdown (salida del asistente) a `mrkdwn` de Slack.
 *
 * Slack no usa Markdown estándar: negrita es `*` (no `**`), los links son
 * `<url|texto>` y no hay tablas. Convertimos lo esencial y degradamos tablas a
 * listas simples para que el mensaje se lea bien en Slack.
 */

const MAX_LEN = 2900;

/** ¿La fila de una tabla markdown es el separador `|---|:--:|`? */
function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

function tableRowToText(line: string): string {
  const cells = line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return cells.length ? `• ${cells.join(" · ")}` : "";
}

export function toSlackMarkdown(input: string): string {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  for (const raw of lines) {
    let line = raw;

    if (isTableSeparator(line)) continue; // fila separadora de tabla → fuera
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const text = tableRowToText(line);
      if (text) out.push(text);
      continue;
    }

    // Encabezados markdown (#, ##, ###) → negrita Slack.
    line = line.replace(/^\s{0,3}#{1,6}\s+(.*)$/, (_, t: string) => `*${t.trim()}*`);

    // Links [texto](url) → <url|texto>. Antes de tocar negritas.
    line = line.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_, text: string, url: string) => `<${url}|${text}>`,
    );

    // Negrita **x** o __x__ → *x*.
    line = line.replace(/\*\*([^*]+)\*\*/g, "*$1*");
    line = line.replace(/__([^_]+)__/g, "*$1*");

    // Viñetas markdown (- , * ) → • .
    line = line.replace(/^(\s*)[-*]\s+/, "$1• ");

    out.push(line);
  }

  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length <= MAX_LEN) return text;
  let cut = text.slice(0, MAX_LEN - 1);
  // No cortar dentro de un enlace mrkdwn `<url|texto>`: si quedó un `<` sin su
  // `>` de cierre, recorta antes del `<` para no dejar una entidad rota.
  if (cut.lastIndexOf("<") > cut.lastIndexOf(">")) cut = cut.slice(0, cut.lastIndexOf("<"));
  return `${cut.trimEnd()}…`;
}
