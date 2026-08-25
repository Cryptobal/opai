const AFC_TOKEN = "labor_event.afcDeductionAmount";
const TOTAL_TOKEN = "labor_event.totalSettlementAmount";

type TipTapNode = {
  type?: string;
  attrs?: { tokenKey?: string; label?: string };
  content?: TipTapNode[];
  text?: string;
  marks?: unknown[];
};

function hasToken(node: unknown, tokenKey: string): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((child) => hasToken(child, tokenKey));
  const n = node as TipTapNode;
  if (n.type === "contractToken" && n.attrs?.tokenKey === tokenKey) return true;
  if (Array.isArray(n.content)) return n.content.some((child) => hasToken(child, tokenKey));
  return false;
}

function tokenNode(tokenKey: string): TipTapNode {
  return { type: "contractToken", attrs: { tokenKey, label: tokenKey } };
}

function textNode(text: string, marks?: unknown[]): TipTapNode {
  return marks ? { type: "text", text, marks } : { type: "text", text };
}

function afcParagraph(): TipTapNode {
  return {
    type: "paragraph",
    content: [
      textNode("5. Descuento AFC (Ley 19.728): "),
      tokenNode(AFC_TOKEN),
    ],
  };
}

export function patchFiniquitoTemplateContent(content: unknown): {
  changed: boolean;
  content: unknown;
} {
  if (!content || typeof content !== "object") {
    return { changed: false, content };
  }
  if (hasToken(content, AFC_TOKEN)) {
    return { changed: false, content };
  }
  if (!hasToken(content, TOTAL_TOKEN)) {
    return { changed: false, content };
  }

  const doc = JSON.parse(JSON.stringify(content)) as TipTapNode;
  const children = Array.isArray(doc.content) ? doc.content : [];
  const totalIndex = children.findIndex((child) => hasToken(child, TOTAL_TOKEN));
  if (totalIndex < 0) {
    return { changed: false, content };
  }

  children.splice(totalIndex, 0, afcParagraph());
  doc.content = children;
  return { changed: true, content: doc };
}

export function ensureAfcTokenListed(tokensUsed: unknown): string[] {
  const list = Array.isArray(tokensUsed)
    ? tokensUsed.filter((t): t is string => typeof t === "string")
    : [];
  if (!list.includes(AFC_TOKEN)) list.push(AFC_TOKEN);
  return list;
}
