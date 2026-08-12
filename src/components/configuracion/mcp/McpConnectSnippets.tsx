"use client";

import { CopyField } from "./CopyField";

/**
 * Snippets copiables para conectar un cliente MCP a OPAI.
 * `apiKey` puede ser la key real (post-creación) o un placeholder.
 */
export function McpConnectSnippets({ apiKey, baseUrl }: { apiKey: string; baseUrl: string }) {
  const urlWithKey = `${baseUrl}/api/mcp/${apiKey}`;
  const claudeCode = `claude mcp add --transport http opai ${baseUrl}/api/mcp --header "Authorization: Bearer ${apiKey}"`;
  const cursorJson = JSON.stringify(
    {
      mcpServers: {
        opai: {
          url: `${baseUrl}/api/mcp`,
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2,
  );
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
        <p className="text-sm font-medium">Cursor / Claude Code / Grok Bot (HTTP remoto)</p>
        <p className="mb-1 text-xs text-muted-foreground">
          Transporte Streamable HTTP con Bearer. Grok Bot y Cursor no soportan stdio local — usa
          siempre la URL remota <code className="font-mono">{baseUrl}/api/mcp</code>.
        </p>
        <p className="mb-1 text-xs text-muted-foreground">
          Cursor: guarda en <code className="font-mono">.cursor/mcp.json</code> (proyecto) o{" "}
          <code className="font-mono">~/.cursor/mcp.json</code> (global). Reinicia o refresca MCP en
          Ajustes.
        </p>
        <CopyField value={cursorJson} />
      </div>
      <div>
        <p className="text-sm font-medium">claude.ai (custom connector — key en URL)</p>
        <p className="mb-1 text-xs text-muted-foreground">
          claude.ai no permite headers custom. Pega esta URL en Configuración → Conectores.
        </p>
        <CopyField value={urlWithKey} />
      </div>
      <div>
        <p className="text-sm font-medium">Claude Code (CLI)</p>
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
