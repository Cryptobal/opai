# Auditoría — Google Workspace · Agenda · Licitaciones

Fecha: 2026-07-20  
Rama: `feat/google-workspace-agenda` (desde `main` @ `04bede0b3`)  
Gate pre-cambio: `npx prisma generate` OK; `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` OK  
Mockup `mockup-google-drive-calendar-visitas.html`: **no encontrado** en el repo ni bajo Desktop/Cursor.

---

## 1. Hub

| Ítem | Ruta |
|------|------|
| Redirect `/opai` | `src/app/(app)/opai/page.tsx` → `redirect('/hub')` |
| Page hub | `src/app/(app)/hub/page.tsx` |
| Orquestador | `src/app/(app)/hub/_components/HubClientWrapper.tsx` |
| Registry secciones | `src/app/(app)/hub/_lib/hub-sections-registry.ts` |
| Queries | `src/app/(app)/hub/_lib/hub-queries.ts` |

Widget Agenda → insertar en `HubClientWrapper` / registry respetando grid existente (Bloque 10).

---

## 2. Persistencia PDF → R2 (espejo Drive)

| Tipo | ¿Persiste PDF en R2 hoy? | Punto de enganche | Carpeta Drive (mockup) |
|------|--------------------------|-------------------|------------------------|
| **Factura / NC** | **NO** — `billing-document-send.service.ts` genera buffer y adjunta al email; no hay `pdfR2Key` ni `uploadFile` | Tras generar buffer en send → `uploadFile` + enqueue | `Clientes/{Cuenta}/{Instalación}/Facturas` |
| **Cotización CPQ** | **NO** — `send-quote-to-portal.ts` + `/api/pdf/generate-pricing*` stream/email | Al enviar: generar PDF, `uploadFile`, enqueue | `Clientes/{Cuenta}/{Instalación}/Cotizaciones` (+ `Licitaciones/{Año}/{NombreDeal}` si `isLicitacion`) |
| **EEPP / Estado de pago** | **NO** — preview/email on-the-fly | Sin persistencia → **ocultar toggle**; `// TODO(drive-mirror)` | — |
| **Liquidaciones** | **NO** | Sin persistencia → **ocultar toggle**; TODO | — |
| **Informe supervisión** | **NO** (solo fotos) | Sin persistencia → **ocultar toggle**; TODO | — |
| DTE inbound / portal reportes / VRA | Sí (`uploadFile`) | Fuera del scope del espejo documental v1 | — |

**Implicación Bloque 3:** tipos soportados v1 = `cotizacion` + `factura` (+ `licitacion` como path extra). Hay que subir a R2 en el momento del enqueue porque hoy no existen keys.

---

## 3. CrmDeal — owner / responsable

`CrmDeal` **no tiene** campo `ownerId` ni `assignedTo`.

- Responsable comercial efectivo: **`CrmAccount.ownerId`** (cuenta del deal).
- Fecha visita legacy (solo lectura): `CrmDeal.technicalVisitDate` — **no escribir** (decisión cerrada).
- `dealType` ya admite string libre (ej. "Licitación") pero la feature nueva usa flags `isLicitacion` + `fechaEntrega`.

Para eventos Calendar de licitación → calendario del Admin cuyo `id === account.ownerId` (si conectado).

---

## 4. UI deals — create/edit

| Acción | Ruta |
|--------|------|
| Detail client | `src/components/crm/CrmDealDetailClient.tsx` |
| List/create | `POST/GET` `src/app/api/crm/deals/route.ts` |
| Update/delete | `PATCH/DELETE` `src/app/api/crm/deals/[id]/route.ts` |
| Notas timeline | `NotesSection` → `entityType="deal"` → `/api/crm/notes` |

---

## 5. OpsVisitaTecnica

| Ítem | Hallazgo |
|------|----------|
| Create con `scheduledAt` | `POST /api/cpq/quotes/[id]/solicitar-visita-tecnica` |
| Completar | `PATCH /api/crm/visitas-tecnicas/[id]` (`complete: true`) — **no** edita `scheduledAt` |
| Campos obligatorios | `tenantId, userId, installationId, accountId` (+ opcionales `dealId, quoteId, scheduledAt`) |
| Deep-link GCal actual | URL TEMPLATE post-CPQ (no OAuth Calendar API) |
| Portal supervisor CRUD | UI llama rutas inexistentes — **no tocar** |

Hook Calendar: al setear/cambiar `scheduledAt` en CPQ (+ creación desde agenda `type=tecnica`).

---

## 6. Patrones a reutilizar

### Tokens Gmail (copiar exactamente)

```ts
const tokenSecret = process.env.GMAIL_TOKEN_SECRET || "dev-secret";
encryptText(accessToken, tokenSecret);
decryptText(emailAccount.accessTokenEncrypted, tokenSecret);
```

State OAuth: `{ userId, tenantId, ts }` → base64url + HMAC-SHA256 con el mismo secret.

### Slack outbox / cron

- Enqueue: `src/lib/integrations/slack/outbox.ts`
- DM: `dispatchPersonalSlackDm` en `personal-dm.ts`
- Cron auth: `Authorization: Bearer ${CRON_SECRET}`
- Schedule flush: `*/2 * * * *` en `vercel.json`

### Storage

```ts
uploadFile(buffer, fileName, mimeType, prefix?, tenantId?)
getFileBuffer(storageKey, maxBytes?)
```

### Config integraciones

`src/app/(app)/opai/configuracion/integraciones/page.tsx` — cards Gmail / Slack / MCP.  
Nav: `config-integraciones` en `src/lib/nav/registry.ts`.

### AI

- Tools: `getToolDefinitionsV2` + `executeToolCallV2` en `help-chat-tools-v2.ts`
- Resumen: `aiService.generateText(prompt, opts, { tenantId })`

### Schema Prisma

- Slack / MCP: `@@schema("public")`, `@map` snake_case
- CRM emails/deals: `@@schema("crm")`
- **Nuevos modelos Google/Agenda → `public`** (como Slack), ADD COLUMN en `crm.deals` / `crm.email_messages`

---

## 7. Env vars nuevas (degradación elegante)

```
GOOGLE_DRIVE_REDIRECT_URI
GOOGLE_CALENDAR_REDIRECT_URI
GOOGLE_CALENDAR_WEBHOOK_URL
```

Reutilizan `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Tokens con `GMAIL_TOKEN_SECRET` (mismo patrón).

---

## 8. Decisiones de implementación derivadas del audit

1. Responsable licitación = `CrmAccount.ownerId` (documentar en UI como “owner de la cuenta”).
2. Drive mirror v1: solo toggles `cotizacion`, `factura`, `licitacion` visibles; resto ocultos con TODO.
3. Al encolar factura/cotización: generar PDF + `uploadFile` en el hook (no hay `pdfR2Key` previo).
4. `AgendaVisita` es modelo nuevo; técnicas siguen en `OpsVisitaTecnica`.
5. Crear visitas técnicas desde agenda: wrapper fino sobre create de `OpsVisitaTecnica` (requiere account + installation + assignedUserId).

---

## QA (Bloque 11 — checklist para Carlos)

Preview: desplegar rama `feat/google-workspace-agenda` (Vercel Preview).  
Migración: `prisma/migrations/20261018000000_google_workspace_agenda/migration.sql` (solo aditiva; aplicar en preview/staging con el flujo habitual del equipo — **no** `migrate deploy` desde este agente).

### Env vars a cargar en Vercel (Preview + Prod)

| Variable | Ejemplo |
|----------|---------|
| `GOOGLE_DRIVE_REDIRECT_URI` | `https://<host>/api/integrations/google-drive/oauth/callback` |
| `GOOGLE_CALENDAR_REDIRECT_URI` | `https://<host>/api/integrations/google-calendar/oauth/callback` |
| `GOOGLE_CALENDAR_WEBHOOK_URL` | `https://<host>/api/webhook/google-calendar` |

Ya existentes: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_SECRET`, `CRON_SECRET`.

### Crons nuevos (`vercel.json`)

| Schedule | Path |
|----------|------|
| `*/2 * * * *` | `/api/cron/flush-drive-outbox` |
| `0 11 * * *` | `/api/cron/licitacion-reminders` |
| `0 11 * * 1` | `/api/cron/agenda-digest` |
| `*/10 * * * *` | `/api/cron/gmail-sync-all` |
| `0 5 * * *` | `/api/cron/calendar-channel-renew` |

### Flujos a validar en Preview

1. **Drive:** Config → Integraciones → Google Drive → conectar cuenta tenant → activar toggles `cotizacion`/`factura`/`licitacion` → emitir/enviar factura o cotización → verificar fila en “Actividad reciente” (`DriveExportOutbox`) y archivo en Drive bajo `Clientes/...` (y `Licitaciones/...` si aplica).
2. **Calendar:** Config → Google Calendar → conectar usuario → crear visita en `/opai/agenda` → evento en calendario del asignado con ubicación/notas; badge sync SYNCED o PENDING si el asignado no tiene Calendar.
3. **Licitación:** Deal → toggle Licitación + `fechaEntrega` → evento all-day del owner de cuenta; aparece en Agenda + widget Hub; T-7/T-3/T-1 vía cron Slack (si Slack activo).
4. **Sync inverso:** reprogramar/cancelar el evento en Google → webhook/incremental actualiza `startAt`/`status` en OPAI (no borra registros).
5. **Correos / IA:** cron `gmail-sync-all` atribuye `emailAccountId`; tool chat `get_deal_communications`; drawer licitación → “Generar” resumen (≤3 frases; “Sin comunicaciones…” si vacío).
6. **Hub:** card Agenda con hoy + 3 días; “Ampliar” a 7; “Abrir agenda” → `/opai/agenda`.

### Notas

- Mockup HTML de referencia **no** estaba en el repo; UI alineada a DS v3 + copy del prompt.
- Tipos Drive ocultos (EEPP/liquidación/informe): sin persistencia PDF → TODO en código.
- `CrmDeal.technicalVisitDate` no se escribe; visitas 1:N vía `DealVisitasCard`.

---

## QA v2 — Auditoría dirigida (fix post-QA de Carlos)

Fecha: 2026-07-20 · Rama: `claude/google-workspace-qa-fixes-v2-akvx4o` (desde `main` @ `ecbe700`)
Gate pre-cambio: `npx prisma generate` OK · `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` OK (0 errores).
Crons confirmados en `vercel.json`: `flush-drive-outbox` (`*/2`), `licitacion-reminders` (`0 11`), `agenda-digest` (`0 11 * * 1`), `gmail-sync-all` (`*/10`), `calendar-channel-renew` (`0 5`). ✅

### H1 · OAuth — `oauth/start` correcto, errores invisibles en callback/config

- **`oauth/start` (Drive + Calendar):** ambos usan `client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope, state })`. `access_type`, `prompt`, `scope` y `state` **presentes y correctos** (confirma H1). **Faltan** `include_granted_scopes: true` y `login_hint` en ambos.
  Evidencia: `src/app/api/integrations/google-drive/oauth/start/route.ts:32-37`, `src/app/api/integrations/google-calendar/oauth/start/route.ts:29-34`. `state` = HMAC firmado stateless en `src/lib/google-workspace/oauth.ts:17-22` (`buildState`).
- **`oauth/callback` (ambos):** **nunca** leen `searchParams.get("error")` de Google → un `access_denied` (sin `code`) cae en el guard `if (!code || !state)` y redirige a `?drive=error`/`?cal=error`, indistinguible de un fallo interno. Logs con `console.warn` (no `console.error`), **sin paso** (state|exchange|userinfo|db) — todo colapsa a `error` genérico. **No** hay validación de `tokens.scope` → no existe la razón `missing_scope`. Redirects hoy: `error`, `invalid_state`, `missing_env`, `missing_tokens`, `connected`.
  Evidencia: `google-drive/oauth/callback/route.ts:20-31,39-41,86-90`; `google-calendar/oauth/callback/route.ts:26-36,44-46,76-84`.
- **Config clients:** `GoogleDriveConfigClient.tsx` (127 líneas) y `GoogleCalendarConfigClient.tsx` (196 líneas) **no** usan `useSearchParams` ni leen `cal=`/`drive=`; el estado conectado sale solo del fetch de estado on-mount. **No** hay banner ni toast de resultado. Botón conectar = `<a href>` crudo con `bg-primary` (no usa el `<Button>` DS). → éxito y fallo invisibles (confirma H1b/H6).

### H2 · Modal "Nueva visita" incompleto

`src/components/agenda/NuevaVisitaModal.tsx` (163 líneas). Acepta props `{dealId, accountId, installationId, onCreated}` y calcula `tecnicaBlocked` (L58), pero **solo renderiza** type-pills, título, `datetime-local` (startAt), asignado y notas. **Falta**: buscador de cuenta, select de instalación + dirección/Maps, dirección libre, contactos multiselect, duración, toggles. El POST a `/api/agenda/visitas` **no envía `endAt`** (L68-77) → el server fija +60 min (`visitas/route.ts:38-41`). Overlay `fixed inset-0` presente pero **sin** Escape / click-fuera / focus-trap / blur. Confirma H2.

### H3 · Toggle "Marcar como licitación" sin datepicker

`src/components/crm/DealLicitacionCard.tsx`: el toggle llama `save(!enabled, fecha)` de inmediato (L68); `save` valida `nextEnabled && !nextFecha` → error "La fecha de entrega es obligatoria" y `return` **antes** de setear `enabled=true` (L20-23). Como el `<input type="date">` está bajo `{enabled && …}` (L80-91), el datepicker **nunca** aparece. **Causa raíz confirmada.** El server ya está listo: `PATCH /api/crm/deals/[id]` dispara `syncLicitacionToCalendar` (route.ts:189-195) y el hook hace upsert all-day en el calendario del `account.ownerId` con `syncStatus=PENDING` si no hay Calendar (`agenda-sync.ts:141-197`).

### H4 · "Agendar visita" desde el negocio no abre modal

`src/components/crm/DealVisitasCard.tsx` (110 líneas): el botón es un `<Link href={agendaHref}>` a `/opai/agenda?…&nueva=1` (L55-70) → navega fuera perdiendo contexto. La card **sí** lista la unión `AgendaVisita` + `OpsVisitaTecnica` (+ licitación) vía `/api/agenda` filtrado client-side por `dealId` (L33-40; `agenda-list.ts` mergea 3 modelos). `accountId`/`installationId` ya llegan como props desde `CrmDealDetailClient.tsx:2071-2075` (nullable). Confirma H4; el criterio 4.3 (unión) ya se cumple.
Nota: el deep-link `/opai/agenda?nueva=1&dealId=…&accountId=…` **ya funciona** en `AgendaPageClient.tsx:36-70,160-167` (Bloque 4.1b ya implementado).

### H5 · Correos del negocio sin `dealId` (IA sin contexto)

`src/modules/crm/email/gmail-sync.service.ts` matchea el thread **solo por `subject`** dentro del tenant (L117-127); **nunca** resuelve contacto/cuenta ni setea `thread.dealId`/`contactId`/`accountId` → todo synced queda con FKs null. Consumidores:
- (a) Tab "Correos" del deal = `EmailHistoryList` → `/api/crm/emails?dealId=` que **ya** rescata por match de email-address contra contactos del deal (`emails/route.ts:167-213`), ignora `thread.dealId`.
- (b) `get_deal_communications` (`help-chat-tools-v2.ts:7395`) y (c) resumen/comunicaciones IA (`agenda/licitaciones/[dealId]/{resumen,comunicaciones}/route.ts`) usan `getDealCommunications` con filtro **estricto** `where:{ tenantId, dealId }` (`deal-communications.ts:12-15`) → **vacío** para correos synced. Confirma H5.

### H6 · UI fuera de estándar DS · H7 · Hub

- Config Drive/Calendar: botones `<a>` crudos, sin banner de error, sin toast (ver H1). DS ref: Slack config usa `<Button>` (`@/components/ui/button`), `<Badge variant="success">`, `sonner` toast, banners `bg-status-ok-soft`/`bg-status-danger-soft` (tokens `--ds-ok-soft`/`--ds-danger-soft` mapeados a `status-*` en `tailwind.config.js:111-123`).
- **H7:** `AgendaHubCard` **sí** está montada (`HubClientWrapper.tsx:175`, gated `hubPerms.hasCrm`). Contenido: hoy destacado + 3 días compactos + Ampliar(7) + Abrir agenda ✅. **Falta**: los ítems all-day/licitación se pintan como prefijo `"◆ "` (L117) en vez de chips.

### Schema — campos ausentes (migraciones aditivas necesarias)

| Necesita | Modelo (schema/tabla) | ¿Existe? |
|---|---|---|
| `customAddress` | `AgendaVisita` (`public` / `agenda_visitas`) | **NO** → add `custom_address` |
| `htmlLink` | `AgendaEventLink` (`public` / `agenda_event_links`) | **NO** → add `html_link` (Bloque 7.4) |
| dirección/comuna/geo instalación | `CrmInstallation` | `address`, `city`, `commune`, `lat Float?`, `lng Float?` (nombres en inglés; sin PostGIS) |
| `dealId`/`accountId`/`contactId` thread | `CrmEmailThread` (`crm`/`email_threads`) | **SÍ** (los tres, `@db.Uuid`) |
| responsable licitación | `CrmDeal` | `ownerId`/`responsable` **NO** → se usa `CrmAccount.ownerId` |

Nombrado de migraciones: `YYYYMMDDHHMMSS_add_<campo>` con prefijo numérico > `20261018000000` (la última migración de la feature). Se usarán prefijos `20261019…`.

---

## QA v2 · resultado — fixes aplicados y checklist de validación

Gate por bloque (`npx prisma generate && npx tsc --noEmit`) verde en los 6 bloques.
Commits atómicos por bloque, rama `claude/google-workspace-qa-fixes-v2-akvx4o`.

### Causa raíz del error OAuth (para Carlos)

El `?cal=error` del QA **no** era un bug de código: era `access_denied`, porque la
pantalla "Google no ha verificado esta aplicación" no se completó. Se resuelve en
Cloud Console → Pantalla de consentimiento → **Audience = Interna** (todos @gard.cl).
Mientras tanto: Configuración avanzada → "Ir a Opai". El código **no** hace
workarounds; ahora simplemente **hace visible** el motivo real (banner "Cancelaste
la autorización en Google…") en vez de un error genérico silencioso.

### Fixes por bloque

| Bloque | Commit | Qué cambió |
|---|---|---|
| B1 OAuth | `fix(google): scopes…` | `include_granted_scopes:true` en start; callback lee `error` de Google → `?cal=/drive=google_<error>`, valida `tokens.scope` → `missing_scope`, `console.error` con paso; banner DS + toast + Reintentar en config; botones a `<Button>` DS. |
| B2 Modal | `fix(agenda): modal…` | Modal completo (buscador de cuenta, instalación+dirección+Maps, dirección libre, contactos, duración→endAt, toggles) sobre Dialog DS (Escape/click-fuera/focus-trap). |
| B3 Licitación | `fix(crm): datepicker…` | Toggle solo cambia estado local → datepicker aparece; persistencia al elegir fecha; badge tint-violet en card y header. |
| B4 Visitas | `fix(crm): agendar…` | "Agendar visita" abre el modal in-place con prefill; refresh de la card. |
| B5 Correos | `fix(crm): correos…` | Vinculación thread→deal en sync + criterio ampliado (deal + cuenta) en los 3 consumidores; etiqueta "Correo de la cuenta". |
| B6 UI/Hub | `docs(agenda): qa v2…` | Chips de licitación día-completo en `AgendaHubCard`; botones DS; este doc. |

### Checklist de validación (preview / prod)

> Requiere OAuth + DB reales (no ejecutable desde el agente). Verificar en preview:

- [ ] **Drive:** Config → Google Drive → Conectar → volver → **banner verde** + badge "Conectado" + email. Toast "Conexión completada".
- [ ] **Calendar:** ídem en Google Calendar.
- [ ] **Cancelar en Google:** en la pantalla de consentimiento, "Cancelar" → **banner rojo** "Cancelaste la autorización en Google — reintentá y aceptá los permisos" + botón **Reintentar**. (Ya no es un error genérico.)
- [ ] **Permisos parciales:** destildar un scope → banner "Faltan permisos…" (`missing_scope`).
- [ ] **Nueva visita:** modal → buscar cuenta (debounce), elegir instalación (ver dirección + link Maps), o dirección libre en "Otra", duración, contactos, toggles → "Agendar visita" → toast según sync (evento creado / PENDING sin Calendar / sin evento si toggle off).
- [ ] **Prefill:** desde un negocio → "Agendar visita" abre el modal con cuenta/instalación bloqueadas ("Cambiar"); la visita queda vinculada y la card se refresca.
- [ ] **Licitación:** deal → toggle → **aparece el datepicker** → elegir fecha → badge violet "Licitación · entrega {fecha}" en header + card; la licitación aparece como **chip día-completo** en `/opai/agenda` y en el widget del hub; evento all-day en el calendario del responsable (o PENDING si no tiene Calendar).
- [ ] **Correos:** en un deal cuya cuenta tiene contactos con correos sincronizados, la pestaña "Correos" muestra el hilo (con "· por {usuario}" en salientes y "Correo de la cuenta" en los ampliados); `get_deal_communications` y el resumen IA de licitación devuelven contenido.
- [ ] **Cron:** `GET /api/cron/gmail-sync-all` con `Authorization: Bearer $CRON_SECRET` sincroniza las casillas activas (revisar logs `[gmail-sync-all]`).

### Notas de configuración (Vercel)

Env ya existentes: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_SECRET`,
`CRON_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI`, `GOOGLE_CALENDAR_REDIRECT_URI`.
Migración nueva **aditiva**: `20261019000000_add_agenda_custom_address` (ALTER TABLE
ADD COLUMN nullable; aplicar con el flujo habitual del equipo — **no** `migrate
deploy` desde el agente).

---

## QA v3 — Auditoría dirigida (Correos con IA · Agenda Google · Espejo Drive total)

Base: rama sobre `main` con toda la feature GW (v1 + v2). Gate limpio (`prisma
generate && tsc --noEmit`, exit 0) antes de tocar código.

### A1 · Switches rotos (Drive "Tipos a espejar" + Calendar "Preferencias")

- `src/components/configuracion/google-drive/DriveMirrorToggles.tsx:26-41` y
  `src/components/configuracion/google-calendar/CalendarPrefsList.tsx:29-43`
  implementan un toggle custom `<button role="switch">` con thumb
  `absolute top-0.5` (sin `left`, se apoya sólo en `translate-x`) que se sale del
  track. **Fix:** usar `src/components/ui/switch.tsx` (DS). El Switch DS es `h-5 w-9`;
  los toggles custom eran `h-7 w-12` → extender el Switch con prop `size` (`sm|md`).

### A2 · Brand-mark verde móvil + saludo/fecha

- El "cuadro verde con cuadraditos" NO es un elemento del header (`AppShell.tsx`
  sólo tiene `ThemeLogo` + "OPAI" + Search/Chat/Bell). Es el **icon tile de
  `HubGreeting`**: `HubGreeting.tsx:28-35` pasa `icon={<LayoutDashboard/>}` +
  `iconTone="primary"` a `PageHero`, que en móvil lo renderiza como `IconTile`
  `sm:hidden` (`PageHero.tsx:84-92`) con `bg-primary/15` (`IconBubble.tsx:41`) →
  caja verde con el ícono grid-de-cuadrados. **Eliminar `HubGreeting` resuelve A2
  completo** (saludo + fecha + brand-mark). Render en
  `hub/_components/HubClientWrapper.tsx:172`. Orden actual del hub:
  HubGreeting(172) → HubQuickActions(173) → HubAlertsBanner(174) → AgendaHubCard(175).
- Selector "Propietario" = `RoleSwitcher` (`TopbarActions.tsx:58` desktop /
  `BottomNav.tsx:389` móvil, dentro del sheet "Más"). **Se mantiene intacto.**

### A3 · Sync Gmail insuficiente

- `src/modules/crm/email/gmail-sync.service.ts`: `messages.list` de máx. 20
  (`maxResults` clamp 1-100, cron pasa 30) de INBOX + 20 de SENT por corrida, sin
  paginación (`pageToken`), sin backfill histórico, sin `historyId`.
- Matching por **subject** (`thread-linking.ts:upsertLinkedThread`) — NO por Gmail
  threadId; el thread NO guarda `emailAccountId` ni `providerThreadId`. El auto-link
  thread→deal (cuenta con 1 deal abierto) del fix v2 SÍ corre
  (`thread-linking.ts:36-43`).
- Fix v2 del criterio ampliado (`deal-thread-scope.ts:getDealEmailScope` +
  `buildDealThreadWhere`) ya operativo en `/api/crm/emails`.
- Endpoint manual: `GET /api/crm/gmail/sync` (existe; sólo GET, wrapper fino).
- Cuerpos/adjuntos: `src/lib/gmail-message-content.ts` (extrae html/text; **no**
  expone `filename`/`attachmentId` → extender para B7). Token refresh Gmail: el
  cliente `getGmailClient` (`src/lib/gmail.ts`) usa el refresh_token nativo de
  googleapis; `tokens.ts` (`withFreshToken`) es sólo para Drive/Calendar.

### A4 · Agenda no lee eventos de Google

- `listAgenda(tenantId, from, to)` (`agenda-list.ts`) sólo lee visitas, técnicas y
  licitaciones — cero `events.list`. La ruta `/api/agenda` tiene `session.user.id`.
- Cliente reutilizable listo: `getCalendarClientForUser(tenantId, userId)`
  (`clients.ts:35`) → `{ calendar, accountId, calendarId }`. Dedup por
  `AgendaEventLink.googleEventId` (`schema:11711`).

### A5 · Espejo Drive limitado a 3 tipos

- Modelo de archivos CRM: **`CrmFile`** (`schema:2747`) + **`CrmFileLink`**
  (`schema:2767`, `entityType`/`entityId`), R2 key en `storageKey`. Puntos de
  attach: `src/app/api/crm/files/upload/route.ts:84-105` (UI),
  `help-chat-tools-v2.ts:7120-7133` (tool `attach_staged_file`),
  `webhook/inbound-email/route.ts` y `leads/[id]/approve/route.ts`.
- Hooks Drive: `drive-enqueue-hooks.ts` (`enqueueBillingPdfToDrive`,
  `enqueueQuotePdfToDrive`) → `enqueueDriveExport` → `DriveExportOutbox`. El worker
  `flushDriveOutbox` sube vía `uploadR2ToDrive` (cualquier mime). `mirrorConfig`
  chequea `config[docType] === false` → nuevos tipos `negocios`/`personas` default
  true. Config: `drive-mirror-config.ts` (`SUPPORTED_DOC_TYPES`, `DEFAULT_MIRROR_CONFIG`).

### A6 · Presión DB (mitigación en código)

- `/api/badge/count` (`route.ts`, `dynamic="force-dynamic"`, sin cache) corre 3-4
  queries por request. Cliente ya poll a **60s** (`hooks/useBadgeSync.ts:38`) pero
  también re-sincroniza en `visibilitychange` y mensajes SW → **cachear el endpoint
  60s/usuario** dedupe esas ráfagas.
- Ensure-column: NO está en `/hub`, vive en `src/lib/prisma.ts:24-49`
  (`$executeRawUnsafe('ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS
  active_quotation_id …')`, memoizado 1×/proceso vía `$extends` en cada op de
  `crmDeal`). La columna ya existe en el schema (`schema:2505`) pero **no hay
  migración** que la cree → borrar el ensure y agregar migración idempotente.

### A7 · Login Google (`CallbackRouteError`)

- Corrección de consola (redirect `/api/auth/callback/google` en el cliente OAuth).
  Sólo verificar/loguear; acción de Carlos.

### Cambios de schema previstos (todos aditivos, ALTER ADD COLUMN)

- `crm.email_accounts.sync_state jsonb` (B3).
- `crm.email_threads.email_account_id uuid` + `provider_thread_id text` (B3/B6).
- `crm.email_threads.lead_id uuid` + índice (B7 → adelantado a B6 porque el badge
  y el filtro de la bandeja lo leen).
- Migración idempotente para `crm.deals.active_quotation_id` (B8).

---

## QA v3 · resultado — fixes aplicados y checklist de validación

Gate limpio en cada bloque (`prisma generate && tsc --noEmit`, exit 0). Tests
tocados en verde: nav registry (50) + AI agent-evals/intents (19).

### Migraciones nuevas (todas aditivas — aplicar con el flujo del equipo, no `migrate deploy` desde el agente)

- `20261020000000_gmail_sync_state` — `email_accounts.sync_state`,
  `email_threads.email_account_id` + `provider_thread_id` + índice.
- `20261020000100_drive_outbox_mimetype` — `drive_export_outbox.mime_type`.
- `20261020000200_email_thread_attachment_count` — `email_threads.attachment_count`
  + `email_threads.lead_id` + índice.
- `20261020000300_ensure_deal_active_quotation_id` — `deals.active_quotation_id`
  (idempotente; reemplaza el ensure de runtime).

### Fixes por bloque

- **B1 — Switches DS:** `DriveMirrorToggles` y `CalendarPrefsList` usan el `Switch`
  del DS (prop `size` nueva: `sm|md|lg`; `md` intacto para el resto de la app).
  Thumb siempre dentro del track.
- **B2 — Hub:** eliminado `HubGreeting` (saludo + fecha + el icon-tile verde con
  `LayoutDashboard` que en móvil se veía como "cuadro verde con cuadraditos").
  Primer bloque del hub = Acciones rápidas → AgendaHubCard. `RoleSwitcher`
  ("Propietario") intacto.
- **B3 — Sync Gmail:** backfill 120d INBOX+SENT paginado (budget/deadline,
  reanudable) + incremental por `historyId` (fallback a 404). Guarda TODOS los
  threads con `emailAccountId` + `providerThreadId`; matching a contacto/cuenta/deal
  como enriquecimiento. `POST /api/crm/gmail/sync`. `rematchThreadsForContact`.
- **B4 — Agenda Google:** `/api/agenda` mergea `events.list(primary)` del usuario
  (cache 5 min, dedup por `AgendaEventLink.googleEventId`), chip neutro
  `GoogleEventChip` → abre en Google. Aparece en semana, día y `AgendaHubCard`.
  Degradación silenciosa + hint "Reconectar Calendar".
- **B5 — Espejo Drive total:** toggles `negocios` + `personas`; `enqueueCrmFileToDrive`
  engancha la subida UI y la tool `attach_staged_file` → `Negocios/{Año}/{Deal}`,
  `Clientes/{Cuenta}/Personas/{Contacto}`, `.../Documentos`. Worker sube cualquier
  mime (mime_type).
- **B6 — Bandeja Correos:** `/crm/correos` (nav bajo Comercial), lista con badges +
  filtros + buscador + "Sincronizar ahora" + paginación; drawer con cuerpo/adjuntos,
  "Asociar a cuenta" y "Abrir en Gmail".
- **B7 — Lead con IA:** `POST /extract` (propuesta) + `POST /create-lead` (crea lead
  + adjuntos + contacto/negocio licitación + `syncLicitacionToCalendar`, read-after-
  write); card violeta editable en el drawer; tool `create_lead_from_email`.
- **B8 — Presión DB:** badge count cacheado 60s/usuario; ensure-column de runtime
  removido → migración idempotente.

### Checklist de validación (preview / prod — requiere OAuth + DB reales)

- [ ] **Switches:** Drive "Tipos a espejar" y Calendar "Preferencias" con el thumb
  dentro del track en on/off; foco visible.
- [ ] **Hub móvil (390px):** sin saludo/fecha ni cuadro verde; primer contenido =
  Acciones rápidas + AgendaHubCard; selector Propietario sigue en el sheet "Más".
- [ ] **Correos P&G:** tras 2-3 corridas del cron, el deal P&G muestra el hilo con
  `martinez.d.2@pg.com` y `get_deal_communications` lo devuelve.
- [ ] **Agenda Google:** los eventos del Gmail de Carlos aparecen en `/opai/agenda`
  y el hub deja de decir "no hay agenda". Token revocado → hint "Reconectar Calendar".
- [ ] **Drive negocios:** adjuntar un archivo a un negocio (chat IA o UI) → aparece en
  `Negocios/2026/{deal}/` y en "Actividad reciente" de la config.
- [ ] **Bandeja Correos:** filtros Todos/Con cuenta/Sin asociar/Con adjuntos/Leads,
  buscador, drawer con adjuntos y "Asociar a cuenta".
- [ ] **Lead con IA:** correo con PDF de bases → "Crear lead con IA" → extracción
  editable con % de confianza → confirmar → lead con contacto + adjuntos y (si
  licitación + cuenta) negocio con fecha en la agenda. Igual desde el chatbot con
  `create_lead_from_email`.

### A7 · Login Google (acción de consola — Carlos)

`CallbackRouteError` (provider google) para 2 usuarios: falta el redirect
`/api/auth/callback/google` en el cliente OAuth nuevo de Google Cloud Console.
No hay corrección de código — verificar/agregar el redirect autorizado.

### 2 acciones de consola pendientes (Carlos)

1. **Neon compute** — subir el compute del proyecto Neon (palanca principal del
   `out of memory`; el código de B8 sólo baja presión).
2. **Redirect login Google** — agregar `/api/auth/callback/google` a los Authorized
   redirect URIs del cliente OAuth (A7).
