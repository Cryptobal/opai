"use client";

import { CopyField } from "./CopyField";

/**
 * Snippets copiables para conectar un cliente MCP a OPAI.
 * `apiKey` puede ser la key real (post-creación) o un placeholder.
 */
export function McpConnectSnippets({ apiKey, baseUrl }: { apiKey: string; baseUrl: string }) {
  const urlWithKey = `${baseUrl}/api/mcp/${apiKey}`;
  const claudeCode = `claude mcp add --transport http opai ${baseUrl}/api/mcp --header "Authorization: Bearer ${apiKey}"`;
  const genericJson = JSON.stringify(
    {
      mcpServers: {
        opai: {
          type: "http",
          url: `${baseUrl}/api/mcp`,
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">claude.ai (custom connector)</p>
        <p className="mb-1 text-xs text-muted-foreground">
          Pega esta URL en claude.ai → Configuración → Conectores → Agregar conector.
        </p>
        <CopyField value={urlWithKey} />
      </div>
      <div>
        <p className="text-sm font-medium">Claude Code</p>
        <p className="mb-1 text-xs text-muted-foreground">Ejecuta este comando en tu terminal.</p>
        <CopyField value={claudeCode} />
      </div>
      <div>
        <p className="text-sm font-medium">Cliente MCP genérico (JSON)</p>
        <CopyField value={genericJson} />
      </div>
    </div>
  );
}
