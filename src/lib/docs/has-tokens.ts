/**
 * Recursively checks whether a Tiptap JSON document contains any contractToken nodes.
 * Used to decide whether to show the "Resolver Tokens" button in the document editor.
 */
export function hasContractTokens(content: unknown): boolean {
  if (!content || typeof content !== "object") return false;
  if (Array.isArray(content)) {
    return content.some((c) => hasContractTokens(c));
  }
  const node = content as { type?: string; content?: unknown[] };
  if (node.type === "contractToken") return true;
  if (Array.isArray(node.content)) {
    return node.content.some((c) => hasContractTokens(c));
  }
  return false;
}
