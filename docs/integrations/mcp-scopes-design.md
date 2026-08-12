# MCP — diseño de scopes granulares (futuro)

> **Estado:** diseño / scaffolding conceptual. **No implementado.** Hoy solo existen scopes `READ` y `READ_WRITE` a nivel de key (`McpApiKey.scope`).

## Problema

Un tenant como Gard conecta varios agentes (Grok Bot: Tesorero, Cobranzas, Comercial, Ops). Una key `READ_WRITE` del owner expone **106 tools** a todos — demasiado para principio de mínimo privilegio.

## Objetivo

Keys con **dominios permitidos** además del scope R/W, sin romper el modelo actual:

```
tenant + admin RBAC  →  qué puede hacer el usuario
key.scope            →  READ vs READ_WRITE (gate MCP)
key.domains[]        →  subconjunto de dominios (nuevo, opcional)
tenant.allowWrites   →  gate escritura global (existente)
```

## Dominios propuestos

| Slug | Tools aprox. | Caso de agente |
| --- | --- | --- |
| `system` | contexto, UF/UTM, rendiciones | Base transversal |
| `crm` | CRM read/write | Comercial |
| `cpq` | cotizaciones | Comercial CPQ |
| `finance_read` | reportes, DTE search, flujo caja | Tesorero, Cobranzas (lectura) |
| `finance_write` | borradores DTE, factoring | Facturación (acotado) |
| `ops` | guardias, rondas, tickets | Ops |
| `comms` | email, slack | Asistente correo |
| `docs` | read_document | Legal/docs |

Una key `READ` + `domains: ["finance_read", "comms"]` vería ~15 tools, no 53.

## Cambios de schema (borrador)

```prisma
model McpApiKey {
  // ... existente
  allowedDomains String[] @default([]) @map("allowed_domains")
  // [] = legacy: todos los dominios (comportamiento actual)
}
```

## Cambios de código (borrador)

1. `src/lib/integrations/mcp/tool-domains.ts` — mapa estático `toolName → domain`.
2. `getToolDefinitionsV2` sin cambios; filtrar **después** en handler:

```ts
function filterToolsByKeyDomains(tools, key: ResolvedMcpKey): Tool[] {
  if (!key.allowedDomains?.length) return tools;
  return tools.filter((t) => key.allowedDomains.includes(TOOL_DOMAINS[t.function.name]));
}
```

3. UI en `McpCreateKeyForm` — checkboxes de dominio (default: todos para compatibilidad).
4. Mensajes `-32602` incluyen dominio faltante.

## Cobranzas: filtro `non_ceded` (complemento)

Independiente de scopes de key, agregar parámetro opcional a `search_dtes`:

```ts
cedingStatus?: "all" | "non_ceded" | "ceded"
```

Implementación: join/filter sobre `factoringOps` vacío o status terminal. Documentar en descripción de tool.

## Migración

- Keys existentes: `allowedDomains = []` → sin filtro (100% compatible).
- Nuevas keys: UI sugiere presets ("Solo finanzas lectura", "Comercial CRM+CPQ read").

## Fuera de alcance (no half-implement)

- ACL por tool individual (demasiado fino para UI).
- OAuth scopes 1:1 con dominios (esperar OAuth 2.1 roadmap).
- Reemplazar RBAC del Admin — dominios MCP son **capa adicional**, no sustituto.

## Referencias

- Handler: `src/app/api/mcp/handler.ts`
- Keys: `src/lib/integrations/mcp/keys.ts`
- Tools: `src/lib/ai/help-chat-tools-v2.ts`
- Auditoría: `docs/integrations/mcp.md`
