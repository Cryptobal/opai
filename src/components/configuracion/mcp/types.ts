export type McpScope = "READ" | "READ_WRITE";

export interface McpKey {
  id: string;
  name: string;
  keyPrefix: string;
  scope: McpScope;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}
