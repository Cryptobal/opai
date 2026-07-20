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
