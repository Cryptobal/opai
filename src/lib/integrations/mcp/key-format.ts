/**
 * Formato de API keys MCP. Módulo sin dependencias de servidor: lo pueden
 * importar tanto el handler como componentes cliente.
 *
 * Formato: `opai_mcp_` + 40 chars base62 (`A-Za-z0-9`).
 */

export const MCP_KEY_PREFIX = "opai_mcp_";
export const MCP_KEY_RANDOM_LEN = 40;

const MCP_KEY_FORMAT = new RegExp(
  `^${MCP_KEY_PREFIX}[A-Za-z0-9]{${MCP_KEY_RANDOM_LEN}}$`,
);

export function isValidMcpKeyFormat(v: string): boolean {
  return MCP_KEY_FORMAT.test(v);
}
