# Servidor MCP de OPAI

OPAI expone un **servidor MCP remoto** (Model Context Protocol) para que **Cursor**, **Claude Code**, **claude.ai**, **Grok Bot** y cualquier cliente MCP compatible operen OPAI con las herramientas del asistente (`help-chat-tools-v2`).

- **Endpoint producción:** `https://www.opai.cl/api/mcp`
- **Transporte:** Streamable HTTP **stateless** (JSON-RPC 2.0 sobre POST).
- **Versión de protocolo:** `2025-06-18` (también acepta `2025-03-26` y `2024-11-05`).
- **Implementación:** protocolo a mano, cero dependencias MCP en runtime.

## UI y documentación

| Recurso | Ruta |
| --- | --- |
| Panel de keys | **Configuración → Comunicación → Integraciones → Servidor MCP** (`/opai/configuracion/integraciones/mcp`) |
| Esta guía | `docs/integrations/mcp.md` |
| Diseño scopes futuros | `docs/integrations/mcp-scopes-design.md` |

> **Breadcrumb:** la categoría en Configuración es **Comunicación**, no un nivel suelto "Integraciones". Integraciones es la sección padre; Servidor MCP es subpágina (no aparece en el sub-sidebar; se accede desde la card en Integraciones).

## Qué es

Cada tenant genera **API keys** desde el panel anterior. La key resuelve el **tenant** y ejecuta herramientas con los permisos del **Admin que la creó** (`resolvePermissionsById`). No hay app externa: el servidor es la ruta Next `/api/mcp`.

**Conteo de tools (verificado en código):**

| Scope efectivo | Tools en `tools/list` |
| --- | --- |
| `READ` | **64** (solo lectura; incluye `search_leads` / `get_lead` / `list_cameras`) |
| `READ_WRITE` + `allowWrites` | **155** (64 lectura + 91 escritura; incluye emitir borrador DTE, deletes comerciales y cámaras IP) |

## Autenticación

Dos formas equivalentes → mismo handler:

| Cliente | Método | URL |
| --- | --- | --- |
| Cursor / Claude Code / Grok Bot / genérico | `Authorization: Bearer <KEY>` | `https://www.opai.cl/api/mcp` |
| claude.ai custom connector (sin headers) | key en la ruta | `https://www.opai.cl/api/mcp/<KEY>` |

Formato: `opai_mcp_` + 40 caracteres base62. Se muestra **una sola vez** al crearla; en BD solo `sha256` + prefijo visible (12 chars).

**Errores HTTP 401** (antes de JSON-RPC):

```json
{
  "error": "invalid_api_key",
  "message": "API key inválida o revocada. Crea una nueva en Configuración → Comunicación → Integraciones → Servidor MCP.",
  "hint": "docs/integrations/mcp.md"
}
```

Causas: key ausente, formato incorrecto, revocada, o Admin creador desactivado.

## Scopes: READ vs READ_WRITE y `allowWrites`

| Capa | Qué controla |
| --- | --- |
| **Scope de la key** (`READ` default, `READ_WRITE` opcional) | Si las tools de escritura existen en `tools/list` y pueden invocarse. |
| **`allowWrites` del tenant** (Configuración → Asistente IA) | Gate adicional: aunque la key sea `READ_WRITE`, si `allowWrites=false` el servidor expone solo las de lectura. |
| **Permisos RBAC del Admin creador** | Dentro de cada tool: `canView` / `canEdit` / `hasCapability` — respuesta `{ ok: false, error: "..." }` en el payload, no `-32602`. |

### Matriz de rechazo (`tools/call` → JSON-RPC **-32602**)

| Situación | Código | Mensaje típico |
| --- | --- | --- |
| Tool de escritura + key `READ` | `-32602` | Indica scope READ y sugiere key READ_WRITE |
| Tool de escritura + `allowWrites=false` | `-32602` | Indica flag en Asistente IA |
| Tool inexistente o sin permiso de módulo del Admin | `-32602` | No disponible para scope/permisos |
| Tool listada pero RBAC deniega la acción | `200` + `isError: true` | Texto en content: `"No tienes permiso..."` |

La lista blanca se calcula en servidor; **nunca** confíes en el nombre que envía el cliente.

### Annotations MCP (`tools/list`)

Cada tool incluye:

```json
"annotations": {
  "readOnlyHint": true,
  "destructiveHint": false,
  "openWorldHint": false
}
```

- `readOnlyHint`: false en tools de escritura.
- `destructiveHint`: true en `remove_quote_position`, `bulk_update_installations`, `delete_deal`, `delete_quote`, `delete_lead`.
- `openWorldHint`: false (datos acotados al tenant de la key).

---

## Conectar clientes (HTTP remoto)

> **Grok Bot y Cursor no usan stdio.** Siempre URL remota + Bearer (o key en ruta solo para claude.ai).

### Cursor

Archivo `.cursor/mcp.json` (proyecto) o `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "opai": {
      "url": "https://www.opai.cl/api/mcp",
      "headers": {
        "Authorization": "Bearer opai_mcp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
      }
    }
  }
}
```

Tip: usa `"Authorization": "Bearer ${env:OPAI_MCP_KEY}"` y exporta la variable en tu shell. Reinicia Cursor o refresca MCP en **Settings → MCP**.

**Marketplace:** no hay plugin oficial en Cursor Marketplace todavía. La config manual anterior es suficiente; un plugin sería conveniencia (snippets, validación de key) — ver PR para recomendación follow-up.

### Claude Code

```bash
claude mcp add --transport http opai https://www.opai.cl/api/mcp \
  --header "Authorization: Bearer opai_mcp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

### Grok Bot (xAI / agentes remotos)

Usa el mismo patrón HTTP que Cursor: URL `https://www.opai.cl/api/mcp` + header `Authorization: Bearer <KEY>`. No hay transporte stdio.

### claude.ai (custom connector)

```
https://www.opai.cl/api/mcp/opai_mcp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Cliente genérico

```json
{
  "mcpServers": {
    "opai": {
      "type": "http",
      "url": "https://www.opai.cl/api/mcp",
      "headers": { "Authorization": "Bearer opai_mcp_..." }
    }
  }
}
```

---

## Prueba manual con curl

```bash
KEY="opai_mcp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
BASE="https://www.opai.cl"

curl -sS -X POST "$BASE/api/mcp" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'

curl -sS -X POST "$BASE/api/mcp" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

curl -sS -X POST "$BASE/api/mcp" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_tenant_summary","arguments":{}}}'
```

---

## Matriz de auditoría por dominio

Leyenda: **R** = lectura (scope READ), **W** = escritura (requiere READ_WRITE + allowWrites + permiso RBAC). **Guard** = control principal además del scope MCP.

### Sistema / contexto (4 R)

| Tool | R/W | Guard / notas |
| --- | --- | --- |
| `get_user_context` | R | Sesión del Admin creador |
| `get_tenant_summary` | R | tenantId de la key |
| `get_uf_utm` | R | Indicadores globales |
| `get_pending_rendiciones` | R | `scope=all` requiere capability `rendicion_view_all` |

### Comercial / CRM (20 R, 31 W)

| Tool | R/W | Guard |
| --- | --- | --- |
| `search_accounts`, `get_account_detail`, `list_account_documents` | R | `canView(crm, accounts)` |
| `search_contacts` | R | CRM contactos |
| `search_deals`, `get_deal_pipeline`, `get_deal_notes`, `get_deal_communications`, `list_deal_tasks` | R | CRM deals |
| `search_leads`, `get_lead` | R | `canView(crm, leads)`. `get_lead` no marca `firstViewedAt` (eso lo hace la ficha UI). |
| `search_installations` | R | CRM instalaciones |
| `search_all`, `resolve_entity` | R | Búsqueda cross-módulo. `search_all` consulta `crmLead` en paralelo (antes omitía leads). No aplica `canView` por tipo, igual que cuentas/deals; para filtrar por permiso usa `search_leads`. |
| `create_lead`, `update_lead`, `create_lead_from_email` | W | `canEdit(crm, leads)`. `update_lead` no aprueba/rechaza/elimina. |
| `preview_approve_lead`, `approve_lead`, `convert_lead` | W | `canEdit(crm, leads)`. Mismo POST `/api/crm/leads/[id]/approve` (crea cuenta+contacto+deal+CPQ+instalaciones). `convert_lead` es alias de `approve_lead`; ambos exigen `confirm=true` + `previewToken` de `preview_approve_lead`. |
| `preview_reject_lead`, `reject_lead` | W | `canEdit(crm, leads)`. Mismo POST `/api/crm/leads/[id]/reject`. |
| `preview_delete_lead`, `delete_lead` | W | `canDelete(crm, leads)` (nivel **full**). No borra leads `approved`. Exige `confirm=true` + `previewToken`. |
| `create_account`, `update_account` | W | `canEdit(crm, accounts)` |
| `create_contact`, `update_contact` | W | `canEdit(crm, contacts)` |
| `create_deal`, `update_deal`, `add_deal_note`, `create_deal_checklist` | W | `canEdit(crm, deals)` |
| `preview_delete_deal`, `delete_deal` | W | `canDelete(crm, deals)`. Mismo DELETE `/api/crm/deals/[id]` (cotizaciones a papelera). Exige `confirm=true` + `previewToken`. |
| `create_installation`, `update_installation`, `preview_bulk_update_installations`, `bulk_update_installations` | W | `canEdit(crm, installations)` |
| `create_crm_from_email`, `attach_file_to_entity` | W | Permisos CRM mixtos + staging chat |

**Gap Grok Comercial:** pipeline y ciclo de lead (buscar/ver/aprobar/rechazar/eliminar) cubiertos. No hay tool dedicada Apollo/prospección (solo UI). Email→CRM requiere contexto de hilo o `threadId`. No borrar en prod Gard (Seúl/Tempus) desde MCP salvo instrucción explícita.

### CPQ / cotizaciones (4 R, 20 W)

| Tool | R/W | Guard |
| --- | --- | --- |
| `search_quotes`, `get_quote_detail`, `get_quote_share_link` | R | `canView(cpq)` o `canView(crm, quotes)` |
| `create_quote`, `clone_quote`, `update_quote`, `update_quote_margin`, `update_quote_status` | W | CPQ/CRM quotes edit |
| `add_quote_position`, `update_quote_position`, `remove_quote_position`, previews | W | CPQ edit; remove requiere nivel full CPQ |
| `preview_delete_quote`, `delete_quote` | W | `canDelete(cpq)` o `canDelete(crm, quotes)`. Mismo camino UI: impacto + blockers + `deleteQuoteToTrash` (no wipe SQL). Exige `confirm=true` + `previewToken`. |
| `manage_quote_extras`, `manage_quote_includes`, `get_quote_proposal`, `preview_send_quote_proposal`, `send_quote_proposal` | W | CPQ + envío propuesta |

### Finanzas — reportes y flujo (9 R, 1 W)

| Tool | R/W | Guard |
| --- | --- | --- |
| `get_finance_summary` | R | Módulo finance. DTEs separados: `dtes.issued` (ventas) y `dtes.received` (compras). |
| `flow_cashflow_overview` | R | Planilla v3: `bancoHoy` / `saldoAcumulado` = mismas cifras que `/finanzas/flujo-caja/planilla` (horizonte hoy−4sem→+12m). Opc. breaks / cuentas |
| `get_sales_report`, `get_income_statement`, `get_balance_sheet`, `get_finance_dashboard_kpis`, `get_profitability` | R | Reportes finance + capabilities |
| `search_dtes` | R | `facturacion_view`. `direction`: `issued` (default, retrocompatible), `received`, `all`. Filtros folio/RUT/nombre/monto/período/`installationId`. |
| `get_dte_detail` | R | `facturacion_view`. Resuelve emitidos y recibidos; folio duplicado entre direcciones pide `direction`. Incluye `paymentStatus`, `factoring[]`. |
| `search_received_dtes` | R | `facturacion_view`. Libro de compras: proveedor, cliente CRM, instalación, período, recepción/pago, `onlyWithoutCostCenter`. |
| `update_dte_cost_center` | W | `facturacion_manage` + scope `READ_WRITE`. Asigna/desasigna `crmAccountId` / `installationId` (emitidos y recibidos). |

**Gap Cobranzas:** no existe filtro `non_ceded` / `sin_cesión` en `search_dtes`. El agente debe filtrar client-side con `factoring[]` vacío en `get_dte_detail` o post-procesar resultados.

### Finanzas — banca / cartola (4 R, 4 W)

| Tool | R/W | Guard |
| --- | --- | --- |
| `list_bank_movements` | R | `banking_view` — filtros cuenta/fechas/status/dirección/search + conteos |
| `get_bank_movement` | R | `banking_view` — detalle + links (`flowRowId`, DTE, factoring) |
| `get_bank_triage_summary` | R | `banking_view` — Sin reconocer / Por autorizar / top unmatched |
| `list_flow_rows` | R | `banking_view` o `cashflow_view` — filas para clasificar |
| `preview_classify_bank_to_flow_row` → `classify_bank_to_flow_row` | W | `banking_manage` — **persiste `flow_row_id`** (no solo accountPlanId) |
| `preview_authorize_bank_movements` → `authorize_bank_movements` | W | `banking_manage` — dry-run obligatorio; Autorizar TE/bandeja |

**Gap factoring 1 depósito→N facturas:** no hay endpoint dedicado MCP; existe link `FACTORING_OPERATION` vía UI/API de links y `bulk-reconcile-dte(s)` para DTEs. Cesión masiva sigue en UI Factoring. **Gap RCV / conciliación de período:** sin tools MCP.

### Finanzas — facturación / DTE borradores (2 R, 16 W)

| Tool | R/W | Guard |
| --- | --- | --- |
| `search_invoice_drafts`, `search_recurring_invoices` | R | `hasFacturacionCapability` |
| `preview_*` / `create_invoice_draft`, NC, ND, recurrente | W | Facturación + preview tokens |
| `preview_update_invoice_draft_refs`, `update_invoice_draft_refs`, refs recurrente | W | HES/OC en programación |
| `preview_emit_invoice_draft` → `emit_invoice_draft` | W | `facturacion_issue` o `facturacion_credit_note` — timbra SII + email PDF/XML (mismo path que la UI; exige previewToken + `confirm=true`) |
| `create_factoring_company` | W | `facturacion_configure` |

**Gap Cesiones:** lectura de operaciones de factoring en `get_dte_detail`; no hay tools de cesión DTE ni listado "solo no cedidos".

### Operaciones (16 R, 15 W)

| Tool | R/W | Guard |
| --- | --- | --- |
| `search_guardias`, `get_guardias_metrics`, `get_guardia_detail`, `list_guardia_documents` | R | Personas/ops |
| `get_daily_attendance`, `get_daily_absences`, `get_extra_shifts` | R | Ops asistencia |
| `get_supervision_visits`, `get_rondas_status`, `get_panic_alerts` | R | Ops supervisión/rondas |
| `get_tickets_summary`, `get_my_tickets` | R | Ops tickets |
| `create_ticket`, `transition_ticket`, `take_ticket`, `comment_ticket`, `reassign_ticket`, `change_ticket_priority` | W | `hasModuleAccess(ops)` |
| `list_cameras`, `get_camera`, `list_camera_brands`, `list_camera_layouts` | R | add-on `ops_camaras` + `ops.camaras` view |
| `create_camera`, `update_camera`, `delete_camera` | W | `camaras_configure` — mismo path que `/api/ops/camaras` |
| `test_camera_connection`, `ptz_camera` | W | view (igual que la UI: prueba de stream y PTZ) |
| `create_camera_layout`, `update_camera_layout`, `delete_camera_layout` | W | view — páginas del video wall del operador |

**Gap Ops:** no hay tools de pauta mensual/diaria, PPC, inventario ni ATS en MCP (existen en UI ERP). **Gap cámaras:** el JWT WHEP (`relay-token`) es solo para el visor del navegador; MCP no reproduce video. `test_camera_connection` no devuelve el JPEG (sí `snapshotAvailable` + `status`).

### Documentos (3 R, 0 W)

| Tool | R/W | Guard |
| --- | --- | --- |
| `get_entity_documents`, `read_document` | R | Docs por entidad |
| `attach_file_to_entity` | W | CRM (ver arriba) |

**Gap:** MCP `resources` (PDF/adjuntos nativos) en roadmap; hoy vía `read_document` / `read_email_attachments`.

### Correo / comunicaciones (8 R, 0 W)

| Tool | R/W | Guard |
| --- | --- | --- |
| `get_email_thread`, `summarize_email_thread`, `read_email_attachments` | R | Bandeja CRM / contexto |
| `search_emails`, `count_emails`, `search_emails_semantic`, `mailbox_coverage` | R | Índice correos |
| `slack_channel_context` | R | Slack integrado |

Escritura desde correo va por tools CRM (`create_*_from_email`).

### Recordatorios (1 R, 2 W)

| Tool | R/W | Guard |
| --- | --- | --- |
| `get_my_reminders` | R | Usuario creador |
| `create_reminder`, `complete_reminder` | W | Usuario creador |

---

## Agentes Grok Bot — fit summary

| Agente | Tools útiles | Gaps principales |
| --- | --- | --- |
| **Tesorero** | `search_received_dtes({search:"5144"})` o `{search:"11.111.111-1"}`; `search_dtes({search:"5144"})` (con search cubre compras); `get_dte_detail({folio:5144})`; `flow_cashflow_overview`, banca, KPIs/balance/EERR | RCV período, proyección multi-escenario, factoring 1→N deposit |
| **Cobranzas** | `search_dtes` (`direction`), `get_dte_detail` (`paymentStatus`, `factoring`) | Sin filtro server-side DTEs no cedidos; sin registrar cobros |
| **Comercial** | Pipeline CRM + CPQ + email; `search_leads` / `get_lead`; approve/reject/delete lead; `delete_deal` / `delete_quote` (papelera) | Sin Apollo; deletes destructivos — solo tenant de prueba y `confirm=true` |
| **Ops** | Guardias, rondas, tickets, asistencia, cámaras IP | Sin pautas, inventario, marcación; video live solo en el visor web |

Recomendación multi-agente: **keys READ separadas por agente** hoy; **READ_WRITE solo para agentes de confianza** con Admin de mínimo privilegio. Scopes por dominio → ver `mcp-scopes-design.md`.

---

## Modelo de identidad

- La **key ES el tenant** — nunca se acepta `tenantId` por parámetro.
- Identidad de ejecución = Admin creador de la key.
- Key `READ` → `getToolDefinitionsV2(true, false)` y bloqueo runtime de escrituras.

## Auditoría

Escrituras vía MCP → `AuditLog` con `details.source = "mcp"`, nombre de tool y prefijo de key. `lastUsedAt` best-effort.

## Límites

- Rate limit: **120 req/min** por key → HTTP 429.
- Timeout: **60 s** (Vercel `maxDuration`).
- Batch JSON-RPC: no soportado (`-32600`).
- Stateless: sin `Mcp-Session-Id`. `GET` → 405. `OPTIONS` → 204 CORS.

## Revocar

Panel → Revocar. Efecto inmediato. Irreversible; crear nueva key.

## Roadmap

- OAuth 2.1 (Authorization Code + PKCE).
- MCP `resources` (documentos/adjuntos).
- **Scopes por dominio** (finance-only, crm-read, etc.) — diseño en `mcp-scopes-design.md`.
- Rate limit distribuido (Upstash) si el volumen lo justifica.
- Plugin Cursor Marketplace (conveniencia, no bloqueante).
