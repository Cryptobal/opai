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

## QA (rellenar en Bloque 11)

- [ ] Conectar Drive → toggle → factura de prueba encolada
- [ ] Conectar Calendar → crear visita → evento con ubicación y contactos
- [ ] Marcar deal licitación → all-day + aparece en agenda y hub
- [ ] Reprogramar desde Google → refleja en OPAI
- [ ] Tool IA `get_deal_communications` responde comunicaciones de un deal
