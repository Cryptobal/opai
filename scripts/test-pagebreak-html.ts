/**
 * Script para verificar que el HTML generado con saltos de página es correcto.
 * Ejecutar: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/test-pagebreak-html.ts
 *
 * Abre el archivo output en el navegador y usa Ctrl+P (Imprimir) para ver si los saltos funcionan.
 */

import * as fs from "fs";
import * as path from "path";

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "CONTRATO DE TRABAJO" }] },
    { type: "paragraph", content: [{ type: "text", text: "Página 1 - Contenido inicial del contrato." }] },
    { type: "paragraph", content: [{ type: "text", text: "Más texto en la primera página..." }] },
    { type: "pageBreak" },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "SEGUNDO" }] },
    { type: "paragraph", content: [{ type: "text", text: "Página 2 - Este contenido debe aparecer en una nueva página al imprimir/PDF." }] },
    { type: "pageBreak" },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "TERCERO" }] },
    { type: "paragraph", content: [{ type: "text", text: "Página 3 - Otra página más." }] },
  ],
};

function esc(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tiptapNodeToHtml(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return esc(node);
  if (Array.isArray(node)) return node.map(tiptapNodeToHtml).join("");

  if (node.type === "text") return esc(node.text ?? "");
  if (node.type === "contractToken") return "";

  const children = (node.content ?? []).map(tiptapNodeToHtml).join("");

  switch (node.type) {
    case "doc": return tiptapDocToHtmlWithPageBreaks(node);
    case "paragraph": return `<p>${children || "&nbsp;"}</p>`;
    case "heading": {
      const level = node.attrs?.level ?? 2;
      return `<h${level}>${children}</h${level}>`;
    }
    case "pageBreak": return "";
    default: return children;
  }
}

function tiptapDocToHtmlWithPageBreaks(doc: any): string {
  const nodes = Array.isArray(doc) ? doc : (doc?.content ?? []);
  const pages: string[] = [];
  let currentPageNodes: any[] = [];

  for (const node of nodes) {
    if (node.type === "pageBreak") {
      if (currentPageNodes.length > 0) {
        pages.push(currentPageNodes.map((n: any) => tiptapNodeToHtml(n)).join(""));
        currentPageNodes = [];
      }
      pages.push("__PAGE_BREAK__");
    } else {
      currentPageNodes.push(node);
    }
  }
  if (currentPageNodes.length > 0) {
    pages.push(currentPageNodes.map((n: any) => tiptapNodeToHtml(n)).join(""));
  }

  let html = "";
  let needBreakBefore = false;
  for (const p of pages) {
    if (p === "__PAGE_BREAK__") {
      needBreakBefore = true;
      continue;
    }
    if (needBreakBefore) {
      html += `<div style="page-break-before:always;break-before:page;display:block">${p}</div>`;
      needBreakBefore = false;
    } else {
      html += p;
    }
  }
  return html;
}

const documentHtml = tiptapNodeToHtml(doc);

const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Test saltos de página</title>
  <style>
    body { font-family: Georgia, serif; padding: 24px; max-width: 210mm; margin: 0 auto; }
    .doc-content p { margin: 0 0 10px; }
    .doc-content h1 { font-size: 20px; margin: 20px 0 8px; }
    .doc-content h2 { font-size: 17px; margin: 18px 0 6px; }
    @media print {
      div[style*="page-break-before:always"] { page-break-before: always !important; }
    }
  </style>
</head>
<body>
  <div class="doc-content">${documentHtml}</div>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">
    Instrucciones: Ctrl+P (Imprimir) o Guardar como PDF. Deberías ver 3 páginas separadas.
  </p>
</body>
</html>`;

const outPath = path.join(process.cwd(), "pagebreak-test-output.html");
fs.writeFileSync(outPath, fullHtml, "utf-8");
console.log("✓ HTML generado en:", outPath);
console.log("  Abre el archivo en el navegador y usa Ctrl+P para verificar los saltos de página.");
console.log("");
console.log("Contenido del div con page-break:", documentHtml.includes("page-break-before:always") ? "✓ Presente" : "✗ Ausente");
