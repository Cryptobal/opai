"use client";

import { CopyField } from "./CopyField";

const PLACEHOLDER_KEY = "TU_API_KEY";

/**
 * Snippets copiables para conectar un cliente MCP a OPAI.
 * `hasRealKey` (default true) distingue la key real (post-creación) de un
 * placeholder de referencia: sin key real los campos no se pueden copiar.
 */
export function McpConnectSnippets({
  apiKey,
  baseUrl,
  hasRealKey = true,
}: {
  apiKey: string;
  baseUrl: string;
  hasRealKey?: boolean;
}) {
  const key = hasRealKey ? apiKey : PLACEHOLDER_KEY;
  const urlWithKey = `${baseUrl}/api/mcp/${key}`;
  const claudeCode = `claude mcp add --transport http opai ${baseUrl}/api/mcp --header "Authorization: Bearer ${key}"`;
  const cursorJson = JSON.stringify(
    {
      mcpServers: {
        opai: {
          url: `${baseUrl}/api/mcp`,
          headers: { Authorization: `Bearer ${key}` },
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
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-3">
      {!hasRealKey && (
        <p className="text-[13px] text-ds-text-3">
          Pega tu API key para rellenar estos snippets. Mientras tanto son solo referencia y no se
          pueden copiar.
        </p>
      )}
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
        <CopyField value={cursorJson} disabled={!hasRealKey} />
      </div>
      <div>
        <p className="text-sm font-medium">claude.ai (custom connector — key en URL)</p>
        <p className="mb-1 text-xs text-muted-foreground">
          claude.ai no permite headers custom. Pega esta URL en Configuración → Conectores.
        </p>
        <CopyField value={urlWithKey} disabled={!hasRealKey} />
      </div>
      <div>
        <p className="text-sm font-medium">Claude Code (CLI)</p>
        <p className="mb-1 text-xs text-muted-foreground">Ejecuta este comando en tu terminal.</p>
        <CopyField value={claudeCode} disabled={!hasRealKey} />
      </div>
      <div>
        <p className="text-sm font-medium">Cliente MCP genérico (JSON)</p>
        <CopyField value={genericJson} disabled={!hasRealKey} />
      </div>
    </div>
  );
}
