/** Tiptap node builders usados por los archivos de cláusulas. */

export function p(children: any[]): any {
  return { type: "paragraph", content: children };
}
export function t(content: string): any {
  return { type: "text", text: content };
}
export function bold(content: string): any {
  return { type: "text", text: content, marks: [{ type: "bold" }] };
}
export function tk(tokenKey: string): any {
  return { type: "contractToken", attrs: { tokenKey, label: tokenKey } };
}
export function h(level: number, children: any[]): any {
  return { type: "heading", attrs: { level }, content: children };
}
export function hClause(level: number, clauseId: string, children: any[]): any {
  return { type: "heading", attrs: { level, clauseId }, content: children };
}
export function hr(): any {
  return { type: "horizontalRule" };
}
