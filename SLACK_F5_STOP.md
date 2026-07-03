# Fase 5 — Acciones nativas en Slack + imágenes en el puente · Checkpoint

Stop file de la fase. Si necesitas detener la implementación, avísalo aquí.

## Paso manual previo (Carlos)
- Manifest: scopes `files:read` + `files:write`; shortcuts `opai_crear_ticket` (message) y
  `opai_nueva_rendicion` (global). Re-autorizar desde el panel.

## Invariantes de seguridad (no romper)
- Tenant SOLO vía `getTenantForTeam(team_id del payload)`. El `private_metadata` es contexto, no autoridad.
- Identidad SOLO vía `resolveLinkedAdmin` + permisos vía `resolvePermissionsById`.
- Sin capability (tickets/rendiciones) → el modal ni se abre: mensaje efímero claro.
- ACK <3s: `views.open` primero (trigger_id perece en 3s); trabajo pesado en `after()`.

## Hallazgos clave del audit (deciden implementación)

- **Adjuntos chat = URL pública+estable** `https://files.gard.cl/<key>` (`src/lib/storage.ts:109`), sin firma/expiración.
  `ChatAttachment = { id, fileName, fileUrl, fileType(MIME), fileSize }` (`src/lib/chat-types.ts:50`).
  → OPAI→Slack: image blocks directos (sin re-subir). Slack→OPAI: descargar `url_private` (Bearer) →
  `uploadFile(buf, name, mime, "chat", tenantId)` → mismo shape de attachments (UI intacta).
- **api.ts**: `callSlack(method, body, token)` **lanza** `SlackApiError`. views via callSlack;
  `slackFilesUpload`/`slackDownloadFile` fuera de callSlack (multipart/binario).
- **interactivity**: hoy solo `block_actions`. `view_submission` exige ACK **síncrono** (`response_action`)
  en la ruta; trabajo pesado en `after()`. `shortcut`/`message_action` → `views.open` inmediato (trigger_id 3s).
- **Tickets**: NO hay servicio; lógica inline en `POST /api/ops/tickets` (tx ~536-601). Permiso: módulo `ops`
  (`hasModuleAccess`). Tipos = tabla `OpsTicketType` (dinámica, filtrar origin internal/both). Folio `code`
  `TK-YYYYMM-NNNN`. Prioridad p1-p4. View `/ops/tickets/{id}`. → **extraer `createOpsTicket` y reusar en ambos**.
- **Rendiciones**: NO hay servicio; inline en `POST /api/finance/rendiciones` (tx 144-185). Requeridos
  `type(PURCHASE|MILEAGE)`, `amount(int CLP)`, `date(YYYY-MM-DD)`. Categoría = `FinanceRendicionItem` (dinámica,
  `GET /api/finance/items`). Permiso `canEdit(perms,"finance","rendiciones")` + cap `rendicion_submit`. Estado
  inicial `DRAFT`. Boleta = `FinanceAttachment` (storageKey+publicUrl) vía `uploadFile(...,"finance",tenantId)`.
  View `/finanzas/rendiciones/{id}`. → **extraer `createRendicion` y reusar en ambos**.

## Estado (PAUSADO tras Bloque 4 — se priorizó Fase 6)

Bloques 1-4 hechos y en `main`. Bloques 5-8 PENDIENTES. Importante: el registro de
modales (`modals/registry.ts`) está **vacío** — la infraestructura de shortcuts/
view_submission existe y enruta, pero aún no hay modales registrados, así que un
shortcut hoy abre un modal "Esta acción no está disponible". Al retomar: registrar
`ticketModal`/`rendicionModal` en `registry.ts` (blocks 5/6).

Contexto para retomar Bloque 5 (crear ticket): NO existe servicio de creación de
tickets; la lógica está inline en `POST /api/ops/tickets` (tx ~536-601 + notifs
604-698). Hay que **extraer `createOpsTicket`** (type-resolution + tx + audit +
notify) a `src/lib/tickets-create.ts` y reusarlo en la ruta web y en Slack. Ojo:
`ticketListIncludes`/`mapTicket` viven en la ruta (líneas 70/85); el mapper usa
`t: any`, así que el retype es de bajo riesgo. Bloque 6 (rendición): idem con
`POST /api/finance/rendiciones` (tx 144-185) → extraer `createRendicion`.

## Bloques
- [x] BLOQUE 1 — cliente Slack: `slackOpenView`, `slackUpdateView`, `slackFilesUpload`, `slackDownloadFile`
- [x] BLOQUE 2 — imágenes puente saliente (OPAI→Slack)
- [x] BLOQUE 3 — imágenes puente entrante (Slack→OPAI)
- [x] BLOQUE 4 — infraestructura de modales (shortcut/message_action/view_submission)
- [ ] BLOQUE 5 — crear ticket desde mensaje
- [ ] BLOQUE 6 — rendición desde Slack
- [ ] BLOQUE 7 — registro de subcomandos + `/opai ayuda`
- [ ] BLOQUE 8 — QA + docs
