/**
 * Test: verificar que los saltos de página se convierten correctamente a HTML para PDF
 */

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function tiptapNodeToHtml(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return esc(node);
  if (Array.isArray(node)) return node.map(tiptapNodeToHtml).join("");

  if (node.type === "text") {
    let text = esc(node.text ?? "");
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case "bold": text = `<strong>${text}</strong>`; break;
        case "italic": text = `<em>${text}</em>`; break;
        default: break;
      }
    }
    return text;
  }

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

describe("signed-pdf page break conversion", () => {
  it("debe envolver contenido después de pageBreak en div con page-break-before", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Página 1" }] },
        { type: "pageBreak" },
        { type: "paragraph", content: [{ type: "text", text: "Página 2" }] },
      ],
    };

    const html = tiptapNodeToHtml(doc);

    expect(html).toContain("<p>Página 1</p>");
    expect(html).toContain("page-break-before:always");
    expect(html).toContain("break-before:page");
    expect(html).toContain("<p>Página 2</p>");
    // El contenido de página 2 debe estar DENTRO del div con page-break
    expect(html).toContain("<div style=\"page-break-before:always;break-before:page;display:block\"><p>Página 2</p></div>");
  });

  it("debe manejar múltiples pageBreaks", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "P1" }] },
        { type: "pageBreak" },
        { type: "paragraph", content: [{ type: "text", text: "P2" }] },
        { type: "pageBreak" },
        { type: "paragraph", content: [{ type: "text", text: "P3" }] },
      ],
    };

    const html = tiptapNodeToHtml(doc);

    expect(html).toContain("<p>P1</p>");
    expect(html).toContain("<p>P2</p>");
    expect(html).toContain("<p>P3</p>");
    expect((html.match(/page-break-before:always/g) || []).length).toBe(2);
  });

  it("debe manejar doc sin pageBreaks", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Solo una página" }] },
      ],
    };

    const html = tiptapNodeToHtml(doc);

    expect(html).toContain("<p>Solo una página</p>");
    expect(html).not.toContain("page-break-before");
  });
});
