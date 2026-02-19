/**
 * Convierte documento Tiptap JSON a HTML para emails.
 */

export function tiptapToEmailHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const d = doc as { content?: unknown[] };
  if (!d.content || !Array.isArray(d.content)) return "";

  const renderNode = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as Record<string, unknown>;
    const type = n.type as string;
    const content = (n.content as unknown[]) || [];

    switch (type) {
      case "doc":
        return content.map(renderNode).join("");
      case "paragraph": {
        const style = (n.attrs as Record<string, string>)?.textAlign ? `text-align:${(n.attrs as Record<string, string>).textAlign};` : "";
        const inner = content.map(renderNode).join("");
        return inner ? `<p style="margin:0 0 8px;${style}">${inner}</p>` : `<p style="margin:0 0 8px;">&nbsp;</p>`;
      }
      case "heading": {
        const lvl = ((n.attrs as Record<string, number>)?.level) || 2;
        const inner = content.map(renderNode).join("");
        return `<h${lvl} style="margin:0 0 8px;">${inner}</h${lvl}>`;
      }
      case "bulletList":
        return `<ul style="margin:0 0 8px;padding-left:24px;">${content.map(renderNode).join("")}</ul>`;
      case "orderedList":
        return `<ol style="margin:0 0 8px;padding-left:24px;">${content.map(renderNode).join("")}</ol>`;
      case "listItem":
        return `<li style="margin:0 0 4px;">${content.map(renderNode).join("")}</li>`;
      case "text": {
        let text = String((n.text as string) || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        for (const mark of (n.marks as Array<{ type: string; attrs?: Record<string, string> }>) || []) {
          switch (mark.type) {
            case "bold": text = `<strong>${text}</strong>`; break;
            case "italic": text = `<em>${text}</em>`; break;
            case "underline": text = `<u>${text}</u>`; break;
            case "strike": text = `<s>${text}</s>`; break;
            case "link": text = `<a href="${mark.attrs?.href || "#"}" style="color:#0059A3;text-decoration:underline;">${text}</a>`; break;
            case "textStyle": if (mark.attrs?.color) text = `<span style="color:${mark.attrs.color}">${text}</span>`; break;
          }
        }
        return text;
      }
      case "hardBreak": return "<br/>";
      case "horizontalRule": return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;"/>`;
      case "pageBreak": return `<div style="page-break-before:always"></div>`;
      case "blockquote": return `<blockquote style="border-left:3px solid #e5e7eb;padding-left:12px;margin:8px 0;color:#666;">${content.map(renderNode).join("")}</blockquote>`;
      default:
        return content.map(renderNode).join("");
    }
  };

  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">${renderNode(doc)}</div>`;
}

/** Escapa HTML para preview/PDF */
function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Convierte TipTap JSON a HTML para vista previa/PDF.
 * Maneja todos los nodos del editor incluyendo tablas, pageBreak, etc.
 */
export function tiptapToPreviewHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const d = doc as { type?: string; content?: unknown[] };
  let content = d.content;
  if (!content || !Array.isArray(content)) {
    const inner = (doc as Record<string, unknown>).content as { type?: string; content?: unknown[] } | undefined;
    if (inner?.type === "doc" && Array.isArray(inner.content)) {
      content = inner.content;
    }
    if (!content || !Array.isArray(content)) return "";
  }
  const docToRender: { type: string; content: unknown[] } = { type: "doc", content };

  const renderNode = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as Record<string, unknown>;
    const type = n.type as string;
    const content = (n.content as unknown[]) || [];

    if (type === "text") {
      let text = esc(String((n.text as string) || ""));
      for (const mark of (n.marks as Array<{ type: string; attrs?: Record<string, string> }>) || []) {
        switch (mark.type) {
          case "bold": text = `<strong>${text}</strong>`; break;
          case "italic": text = `<em>${text}</em>`; break;
          case "underline": text = `<u>${text}</u>`; break;
          case "strike": text = `<s>${text}</s>`; break;
          case "code": text = `<code>${text}</code>`; break;
          case "link": text = `<a href="${esc(mark.attrs?.href || "#")}" style="color:#0059A3;text-decoration:underline">${text}</a>`; break;
          case "textStyle": if (mark.attrs?.color) text = `<span style="color:${mark.attrs.color}">${text}</span>`; break;
          case "highlight": text = `<mark style="background:${mark.attrs?.color || "#fef08a"};padding:1px 2px;border-radius:2px">${text}</mark>`; break;
        }
      }
      return text;
    }

    if (type === "contractToken") return `<span style="background:#e5e7eb;padding:2px 6px;border-radius:4px;font-size:0.9em">[Token]</span>`;

    if (type === "image" && (n.attrs as Record<string, string>)?.src) {
      const src = (n.attrs as Record<string, string>).src;
      const alt = (n.attrs as Record<string, string>)?.alt || "Imagen";
      return `<img src="${src.replace(/"/g, "&quot;")}" alt="${alt.replace(/"/g, "&quot;")}" style="max-height:80px;max-width:240px;object-fit:contain;vertical-align:middle"/>`;
    }

    const children = content.map(renderNode).join("");

    switch (type) {
      case "doc": return children;
      case "paragraph": {
        const align = (n.attrs as Record<string, string>)?.textAlign;
        const style = align && align !== "left" ? ` style="text-align:${align}"` : "";
        return `<p${style} style="margin:0 0 8px;">${children || "&nbsp;"}</p>`;
      }
      case "heading": {
        const lvl = ((n.attrs as Record<string, number>)?.level) || 2;
        const align = (n.attrs as Record<string, string>)?.textAlign;
        const style = align && align !== "left" ? ` style="text-align:${align}"` : "";
        return `<h${lvl}${style} style="margin:12px 0 8px;">${children}</h${lvl}>`;
      }
      case "bulletList": return `<ul style="margin:0 0 8px;padding-left:24px;">${children}</ul>`;
      case "orderedList": return `<ol style="margin:0 0 8px;padding-left:24px;">${children}</ol>`;
      case "listItem": return `<li style="margin:0 0 4px;">${children}</li>`;
      case "blockquote": return `<blockquote style="border-left:3px solid #e5e7eb;padding-left:12px;margin:8px 0;color:#666;">${children}</blockquote>`;
      case "codeBlock": return `<pre style="background:#1e293b;color:#e2e8f0;padding:12px;border-radius:6px;overflow-x:auto;margin:8px 0;"><code>${children}</code></pre>`;
      case "hardBreak": return "<br/>";
      case "horizontalRule": return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;"/>`;
      case "pageBreak": return `<div class="page-break" style="page-break-before:always;margin:32px 0;padding:12px 0;border-top:2px dashed #475569;border-bottom:2px dashed #475569;background:#f8fafc;font-size:12px;color:#334155;text-align:center;font-weight:500">— Salto de página —</div>`;
      case "table": return `<table style="border-collapse:collapse;width:100%;margin:12px 0">${children}</table>`;
      case "tableRow": return `<tr>${children}</tr>`;
      case "tableHeader": return `<th style="border:1px solid #e2e8f0;padding:8px 12px;background:#f1f5f9;font-weight:600;text-align:left">${children}</th>`;
      case "tableCell": return `<td style="border:1px solid #e2e8f0;padding:8px 12px">${children}</td>`;
      case "columns": return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin:12px 0">${children}</div>`;
      case "column": return `<div style="overflow:hidden">${children}</div>`;
      default: return children;
    }
  };

  return renderNode(docToRender);
}

/**
 * Convierte TipTap JSON a texto plano para búsqueda o contexto de IA.
 * Los tokens se representan como {{module.tokenKey}} para que la IA entienda los placeholders.
 */
export function tiptapToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const d = doc as { content?: unknown[] };
  if (!d.content || !Array.isArray(d.content)) return "";

  const renderNode = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as Record<string, unknown>;
    const type = n.type as string;
    const content = (n.content as unknown[]) || [];

    if (type === "text") {
      return String((n.text as string) || "");
    }
    if (type === "contractToken") {
      const key = (n.attrs as Record<string, string>)?.tokenKey;
      return key ? `{{${key}}}` : "";
    }
    if (type === "hardBreak") return "\n";
    if (type === "pageBreak") return "\n\n--- Salto de página ---\n\n";
    if (type === "image") return "[Imagen]";

    const children = content.map(renderNode).join("");
    if (type === "paragraph" || type === "heading" || type === "listItem" || type === "tableCell" || type === "tableHeader") {
      return children + "\n";
    }
    if (type === "bulletList" || type === "orderedList") {
      return children;
    }
    if (type === "tableRow") return children + "\n";
    return children;
  };

  return renderNode(doc).trim();
}
