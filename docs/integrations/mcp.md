# Servidor MCP de OPAI

OPAI expone un **servidor MCP remoto** (Model Context Protocol) para que Claude
(claude.ai custom connectors, Claude Code) y cualquier cliente MCP operen OPAI
con las ~70 herramientas del asistente (`help-chat-tools-v2`): CRM, operaciones,
finanzas, cotizaciones (CPQ), facturación, etc.

- **Transporte:** Streamable HTTP **stateless** (JSON-RPC 2.0 sobre POST).
- **Versión de protocolo:** `2025-06-18` (también acepta `2025-03-26` y
  `2024-11-05` si el cliente las propone).
- **Cero dependencias:** el protocolo está implementado a mano.

## Qué es

Cada tenant genera **API keys** desde
`Configuración → Integraciones → Servidor MCP`. La key resuelve el tenant y
corre las herramientas con los permisos del **Admin que la creó**. No hay app
externa: el "servidor" es la ruta Next `/api/mcp`.

## Autenticación

Dos formas equivalentes que convergen en el mismo handler:

| Cliente | Método | URL |
| --- | --- | --- |
| Claude Code / clientes con headers | `Authorization: Bearer <KEY>` | `https://www.opai.cl/api/mcp` |
| claude.ai custom connector (sin headers) | key embebida en la ruta | `https://www.opai.cl/api/mcp/<KEY>` |

Formato de la key: `opai_mcp_` + 40 caracteres base62. Se muestra **una sola
vez** al crearla; en la base solo se guarda su `sha256` + el prefijo visible
(primeros 12 chars). Si la pierdes, revócala y crea otra.

## Scopes

| Scope | Herramientas |
| --- | --- |
| `READ` (default) | Solo lectura (`getToolDefinitionsV2(true, false)`). Cualquier herramienta de escritura se rechaza en runtime con `-32602`, aunque el cliente la invoque. |
| `READ_WRITE` | Lectura + escritura, **si además** el tenant tiene `allowWrites` habilitado en la config del asistente. |

La lista blanca de herramientas se calcula en el servidor según el scope
efectivo; el nombre enviado por el cliente nunca se ejecuta si no está en ella.

## Cómo conectar

### claude.ai (custom connector)

En claude.ai → Configuración → Conectores → Agregar conector, pega:

```
https://www.opai.cl/api/mcp/<KEY>
```

### Claude Code

```bash
claude mcp add --transport http opai https://www.opai.cl/api/mcp \
  --header "Authorization: Bearer <KEY>"
```

### Cliente MCP genérico (JSON)

```json
{
  "mcpServers": {
    "opai": {
      "type": "http",
      "url": "https://www.opai.cl/api/mcp",
      "headers": { "Authorization": "Bearer <KEY>" }
    }
  }
}
```

## Prueba manual con curl

```bash
KEY="opai_mcp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
BASE="https://www.opai.cl"

# 1. initialize
curl -sS -X POST "$BASE/api/mcp" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'

# 2. tools/list (devuelve las ~70 herramientas del scope de la key)
curl -sS -X POST "$BASE/api/mcp" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. tools/call — resumen del tenant
curl -sS -X POST "$BASE/api/mcp" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_tenant_summary","arguments":{}}}'
```

La variante en ruta (`$BASE/api/mcp/$KEY`, sin header) funciona idéntico y es la
que usa claude.ai.

## Modelo de identidad

- La **key ES el tenant**: nunca se acepta un `tenantId` por parámetro.
- Cada key pertenece a un **Admin** (su creador). Las herramientas corren con
  `resolvePermissionsById(adminId)` — es decir, con los permisos exactos de esa
  persona. Si el Admin se desactiva, la key se trata como inválida (401).
- Una key `READ` fuerza `getToolDefinitionsV2(true, false)` y bloquea cualquier
  escritura en runtime.

## Auditoría

Toda ejecución de una herramienta de **escritura** vía MCP se registra en el
audit log con `details.source = "mcp"`, el nombre de la tool y el prefijo de la
key. Además se actualiza `lastUsedAt` de la key (best-effort, no bloqueante).

## Límites

- **Rate limit:** 120 requests/min por key → HTTP 429.
- **Timeout:** 60 s por request (Vercel `maxDuration`).
- **Batch JSON-RPC:** no soportado (`-32600`).
- **Sesiones:** stateless (sin `Mcp-Session-Id`). `GET` → 405.

## Revocar

Desde el panel, botón "Revocar". El acceso se corta de inmediato (la resolución
de la key ignora las revocadas). No se puede deshacer; crea una nueva key.

## Roadmap

- OAuth 2.1 (Authorization Code + PKCE) como alternativa a las API keys en ruta,
  para conectores que lo soporten.
- MCP `resources` (documentos, adjuntos) además de `tools`.
- Rate limit distribuido (Upstash) si el volumen lo justifica.
