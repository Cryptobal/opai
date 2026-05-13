# Auditoría — DTE Emitidos (Fase 0)

> **Tipo:** READ-ONLY. No se modificó código.
> **Branch:** `claude/dte-emitidos-refactor-okHvy`
> **Fecha:** 2026-05-13
> **Scope:** módulo de facturación electrónica emitida (Next.js 15, Prisma, Resend, SimpleAPI/SII, R2).

Este reporte mapea el estado actual del módulo y **levanta supuestos del PR brief que no coinciden con la realidad del código**. Es input obligatorio para Carlos antes de aprobar Fase 1.

---

## 0. Diferencias importantes con el brief del PR

El brief asume convenciones que no calzan con esta codebase. Antes de avanzar a Fase 1 hay que decidir cómo se alinea:

| Supuesto del brief | Realidad | Impacto |
|---|---|---|
| Ruta `app/(dashboard)/finanzas/dte-emitidos/` | El módulo vive en `src/app/(app)/finanzas/facturacion/dtes/page.tsx` (groupe `(app)`, no `(dashboard)`; nombre `dtes` no `dte-emitidos`). | Decidir si renombrar la ruta o mantener `dtes` y solo migrar internamente. |
| Modelo `Cliente.email` con string único | **No existe** modelo `Cliente`. El equivalente es `CrmAccount` (`prisma/schema.prisma:2072`) y **no tiene `email`** — los emails viven en `CrmContact.email` (`prisma/schema.prisma:2303`). | La "migración de `Cliente.email` → `ClienteContacto[]`" descrita en Fase 1 no aplica como está. Hay que migrar/extender `CrmContact`, no crear `ClienteContacto`. |
| Tenant con `dteSettings Json?` | Existe `TenantDteConfig` (`prisma/schema.prisma:10424`) como **modelo separado con columnas tipadas** (`emailTemplateSubject`, `emailTemplateBody`, `alertEmails`, `defaultXmlRecipientEmails`, `proformaEmailSubject`, etc.). | Hay que decidir: ¿añadir `alwaysBcc String[]` y nuevos templates a `TenantDteConfig`, o introducir un `Json` adicional? Decisión clara: extender `TenantDteConfig` (no duplicar). |
| "`RESEND_WEBHOOK_SECRET` no existe aún" | **Ya existe** y está documentado (`.env.example:63`). El webhook está activo (`src/app/api/webhook/resend/route.ts`) con verificación svix. | No hay que agregarlo. Lo que sí falta es que el webhook conozca a `FinanceDteEmailLog` (hoy mira 3 tablas, ninguna de DTE). |
| Almacenamiento R2 para XML/PDF firmados | El **XML firmado se persiste en BD** (`FinanceDte.dteXml Bytes`, `prisma/schema.prisma:6507`) por decisión explícita: SimpleAPI/SII no expone re-descarga histórica. El PDF se **regenera on-demand** desde el XML con `pdf-lib` + `bwip-js`. | El requisito "PDF adjunto = XML firmado original, no se re-firma ni regenera" se cumple para XML; **pero el PDF sí se re-renderiza cada vez**. Hay que aclarar si eso es aceptable o si hay que persistir el PDF también (impacta storage). |
| Reglas globales del proyecto | El proyecto usa **App Router groups `(app)`** (no `(dashboard)`), **Prisma multi-schema** (`public`, `crm`, `finance`), y **Tailwind con tokens `ds-*`** (no clases crudas). | Cualquier UI nueva debe usar `text-ds-text-*`, `bg-ds-surface-*`, `border-ds-border-*` y respetar el schema multi-namespace en queries. |

**Recomendación antes de Fase 1:** confirmar con Carlos los seis puntos de arriba. El más crítico es **CrmContact vs ClienteContacto** — duplicar contactos sería un error grave de modelado (hoy ya hay `proformaRecipientContactIds` y `estadoPagoRecipientContactIds` apuntando a `CrmContact` desde `FinanceDte`).

---

## 1. Schema actual

### 1.1 `Cliente` no existe; se usa `CrmAccount`

`prisma/schema.prisma:2072-2143` — `CrmAccount` (mapeado a `crm.accounts`).

- No tiene campo `email`. Los datos del receptor SII (`giro`, `address`, `commune`, `city`) están en este modelo (lines 2091-2102) y se autocopian al `FinanceDte` en `receiverGiro/Direccion/Comuna/Ciudad`.
- Ya tiene relación `contacts CrmContact[]` (`prisma/schema.prisma:2125`).
- Ya tiene un puntero a contacto preferido para documento de cobro: `contactoEstadoPagoId String? → CrmContact` (`prisma/schema.prisma:2117-2118`).

### 1.2 `CrmContact` — la "tabla de contactos" que ya existe

`prisma/schema.prisma:2297-2334` — mapeado a `crm.contacts`.

Campos relevantes:
- `email String?` (line 2303)
- `firstName / lastName / phone / roleTitle` (2301-2305)
- `isPrimary Boolean @default(false)` (line 2306) — equivalente al `esPrincipal` del brief.
- Campos del portal cliente (portalPin, portalEnabled, etc.) — no son del scope DTE pero ya están.

**Lo que falta** para la nueva funcionalidad del brief:
- Flags por tipo de documento: `recibeFacturacion`, `recibeNotasCredito`, `recibeCobranza`, `recibeOperacional`.
- Estos NO existen hoy. La selección actual se hace por `contactoEstadoPagoId` (un solo contacto) o por arrays opacos `proformaRecipientContactIds` / `estadoPagoRecipientContactIds` en `FinanceDte`.

**Recomendación:** agregar columnas booleanas a `CrmContact` (no crear `ClienteContacto`). Index ya cubierto por `idx_crm_contacts_account` (line 2330).

### 1.3 `FinanceDte` — modelo DTE actual

`prisma/schema.prisma:6408-6574` — mapeado a `finance.finance_dtes`.

Campos relevantes para envío de email:
- `receiverEmail String?` (line 6422) — un solo email primario (el que va en `<CorreoRecep>` del XML SII).
- `receiverEmailCc String[] @default([])` (line 6426) — array CC adicional (sólo OPAI, no en XML).
- `emailSentAt DateTime?` (line 6510) — timestamp último envío exitoso.
- `emailStatus String?` (line 6511) — `"SENT"` | `"FAILED"` | null. **No es enum**, es texto libre.
- `proformaRecipientContactIds String[] @db.Uuid` (line 6527) y `estadoPagoRecipientContactIds String[]` (line 6540) — IDs de `CrmContact` para documentos de cobro.
- `proformaStatus / estadoPagoStatus` enum `FinanceProformaStatus` (lines 6528, 6541) — `NONE | SENT | BOUNCED`.

Persistencia del XML/PDF:
- `dteXml Bytes?` (line 6507) — XML firmado + timbrado guardado en BD. Comentario en código explica que SII no expone re-descarga.
- `xmlUrl String?` / `pdfUrl String?` (lines 6501-6502) — campos legacy/opcionales para URLs externas (no se usan en el flujo actual).

Enums asociados (`prisma/schema.prisma:6229-6260`):
- `FinanceDteDirection { ISSUED, RECEIVED }`
- `FinanceSiiStatus { DRAFT, PENDING, SENT, ACCEPTED, REJECTED, WITH_OBJECTIONS, ANNULLED }`

### 1.4 `FinanceDteEmailLog` — el histórico de envíos ya existe (parcial)

`prisma/schema.prisma:6826-6857`. **El brief asume que no existe; sí existe** pero le faltan campos para tracking asíncrono.

Lo que ya tiene:
- `kind String` (line 6834) — `"auto_receiver" | "auto_backoffice" | "manual_resend" | "manual_override_recipient" | "manual_backoffice"`. **No es enum** — es texto comentado.
- `to / cc / bcc String[]` (lines 6835-6840).
- `subject` (line 6841).
- `attachments String` (line 6843) — `"pdf_xml" | "xml_only" | "pdf_only"` (texto, no enum).
- `status String` (line 6845) — `"sent" | "failed"` (texto, no enum).
- `resendId String?` (line 6846) — **no es `@unique`**.
- `errorMessage String?` (line 6847).
- `sentAt DateTime @default(now())` (line 6849).
- `sentBy String?` (line 6851) — userId.

Lo que **falta** vs `DTEEnvio` del brief:
- `reason` (hoy se mezcla con `kind`).
- `idempotencyKey String? @unique` — **no existe**. Doble click duplica.
- `attemptNumber Int` — no existe.
- `deliveredAt / openedAt / bouncedAt` — no existen.
- `status` con valores `QUEUED / SENT / DELIVERED / OPENED / BOUNCED / FAILED` — hoy es booleano práctico (sent/failed).
- `resendId` no es unique, no permite lookup directo desde webhook.

**Recomendación:** extender `FinanceDteEmailLog` con estos campos en lugar de crear `DTEEnvio` paralelo. Convertir los strings (`kind`, `status`, `attachments`) a enums explícitos.

### 1.5 `Tenant` — sin `dteSettings`; usa `TenantDteConfig`

`prisma/schema.prisma:12-106`. El `Tenant` solo tiene `billingEmail` (line 17) y `supportEmail` (line 18) a nivel raíz. **No** tiene `dteSettings Json?` ni `mailDomain`.

`TenantDteConfig` (`prisma/schema.prisma:10424-10529`) cubre 100% de la configuración de facturación:
- Datos del emisor (`emisorRut`, `emisorRazonSocial`, `emisorGiro`, etc., lines 10455-10463).
- Resolución SII (`resolNumero`, `resolFecha`, lines 10466-10467).
- Logo (`logoBase64`, line 10472).
- **Alertas operativas:** `alertEmails String[]` (line 10477) — para fallos SII, NO para BCC en cada envío.
- **Backoffice XML:** `defaultXmlRecipientEmails String[]` (line 10482) — contador externo, recibe SOLO el XML, no el PDF.
- **Templates de DTE:** `emailTemplateSubject / emailTemplateBody` (lines 10491-10492).
- **Templates de Proforma:** `proformaEmailSubject / proformaEmailIntro` (lines 10498-10499).
- **Templates de Estado de Pago:** `estadoPagoEmailSubject / estadoPagoEmailIntro / estadoPagoFooterLegal` (lines 10500-10502).
- **Branding doc cobro:** `billingDocBrandPrimary / Secondary` (lines 10508-10509).

Lo que **falta** vs `TenantDTESettings` del brief:
- `alwaysBcc String[]` — BCC permanente en cada envío DTE. Hoy se usa el `replyTo` del tenant (env `EMAIL_REPLY_TO`) como BCC implícito; ver §2.2.
- `fromName` — override del nombre del remitente (hoy es `EMAIL_FROM` global o `emisorRazonSocial`).
- `replyTo` — está como env var global, no per-tenant en BD.
- `bodyTemplate` con sintaxis `{{tipoDTE}}` Markdown — hoy es HTML/texto con tokens `{{razonSocial}} {{folio}} {{tipo}} {{total}} {{fecha}} {{receiverName}}`. La sintaxis difiere; hay que migrar tokens.

### 1.6 Otros modelos relacionados (inventario)

Todos en `prisma/schema.prisma`:

| Modelo | Línea | Propósito |
|---|---|---|
| `FinanceDte` | 6408 | DTE emitido/recibido. |
| `FinanceDteLine` | 6576 | Líneas de un DTE. |
| `FinanceDteAttachment` | 6644 | Adjuntos del usuario (OC, contrato) que viajan con el DTE. |
| `FinanceDteRecurringTemplate` | 6706 | Plantilla para DTEs recurrentes. |
| `FinanceDteRecurringTemplateAttachment` | 6680 | Adjuntos de plantilla recurrente. |
| `FinanceDteRecurringRun` | 6806 | Ejecuciones de plantilla recurrente. |
| `FinanceDteEmailLog` | 6826 | Histórico de envíos (parcial — ver §1.4). |
| `TenantDteConfig` | 10424 | Config facturación del tenant. |
| `TenantDteCertificate` | 10531 | Cert digital .pfx encriptado. |
| `TenantDteCaf` | 10572 | Archivos CAF (rangos de folios SII). |
| `TenantDteFolioTracker` | 10592 | Tracker del último folio usado por tipo. |
| `TenantBillingSigner` | 10556 | Firmantes para PDF de estado de pago. |

### 1.7 Migraciones recientes relevantes

`prisma/migrations/` (últimas con cambios DTE, por nombre de carpeta):

```bash
ls -1 prisma/migrations | grep -iE 'dte|finance|email|caf' | tail -10
```

Hay que correrlo para listar. El schema actual es resultado de muchas migraciones; **no hay** una migración pendiente bloqueante para Fase 1 (ya hay varios `migrate resolve --rolled-back` en `package.json:6`, lo que indica historia compleja — cuidado al agregar migraciones).

---

## 2. Flujo de envío actual

### 2.1 Único path: `sendDteEmail()`

`src/modules/finance/billing/dte-email.service.ts:83-266`.

Una sola función para emisión inicial **y** reenvío. **No hay duplicación**.

Firma:
```ts
export async function sendDteEmail(
  tenantId: string,
  dteId: string,
  recipientEmail?: string,
  ccOverride?: string[],
  kind: DteEmailKind = "manual_resend",
  triggeredBy?: string,
  bccOverride?: string[],
  excludeAttachmentIds?: string[],
): Promise<SendDteEmailResult>
```

Callers (verificado con `grep -rn "sendDteEmail\b"`):
- `src/modules/finance/billing/dte-issuer.service.ts:438` — **emisión inicial**, llama con `kind="auto_receiver"` después de que SII acepta el DTE.
- `src/app/api/finance/billing/issued/[id]/send-email/route.ts:50` — **reenvío manual** desde UI, kind variable.
- `src/app/api/finance/billing/issued/bulk-resend-email/route.ts:67` — **reenvío bulk**.

Variante hermana: `sendDteXmlToBackoffice()` (`dte-email.service.ts:274-...`) — envía solo XML al contador externo (configurado en `TenantDteConfig.defaultXmlRecipientEmails`). Llamada en `dte-issuer.service.ts:468`.

**Conclusión:** el criterio "DTEDispatchService es el único path" **ya se cumple** para DTE. Lo que falta es:
1. Mejorar la firma (hoy es posicional con 7 args opcionales — propensa a errores).
2. Sumar idempotencia.
3. Sumar tracking async (webhook → log).
4. Eventualmente unificar también `sendBillingDocument` (proforma/estadoPago) y `dte-rejected-alert` bajo un servicio común.

### 2.2 BCC al tenant — ya existe (vía env, no per-tenant)

`dte-email.service.ts:114-129`:

```ts
const tenantConfig = await prisma.tenantDteConfig.findUnique({ where: { tenantId } });
// ...
const emailCfg = await getTenantEmailConfig(tenantId);
const adminBcc = (emailCfg.replyTo ?? "").trim();
const rawBcc = [...(bccOverride ?? [])];
if (adminBcc && EMAIL_RE.test(adminBcc)) rawBcc.push(adminBcc);

const bccList = rawBcc.filter(
  (e, idx, arr) =>
    typeof e === "string" &&
    e.trim() &&
    e !== primary &&
    !ccList.includes(e) &&
    arr.indexOf(e) === idx, // dedupe interno
);
```

El "BCC al tenant" se toma del **replyTo configurado** (env `EMAIL_REPLY_TO`, `.env.example:58`) y se agrega siempre que sea válido y no esté duplicado. **No es per-tenant en BD** — es global por instancia. Para multi-tenant real hay que migrar a `TenantDteConfig.alwaysBcc String[]` (o equivalente) y leerlo aquí.

### 2.3 Adjuntos

`dte-email.service.ts:131-175`:

1. **XML + PDF firmados** (líneas 134-138): se leen vía `provider.getXml(dteType, folio)` y `provider.getPdf(...)`. El provider activo es SimpleAPI (`src/modules/finance/shared/adapters/simpleapi.provider.ts`), pero:
   - `getXml` lee de `FinanceDte.dteXml` directo en BD (no llama a SimpleAPI).
   - `getPdf` regenera el PDF localmente con `pdf-lib` + `bwip-js` desde el XML guardado (no llama a SimpleAPI).
2. **Adjuntos de usuario** (líneas 148-175): query a `FinanceDteAttachment` con `kind="USER_UPLOAD"`. Lee `storageKey` (R2) o `data` (BD) y los anexa en base64. Excluibles con `excludeAttachmentIds`.

Filename: `buildDteAttachmentBaseName(tenantId, dte)` arma algo identificable (folio + cliente + instalación). Definido en `src/modules/finance/billing/dte-filename.ts`.

### 2.4 Templates de email

`src/modules/finance/billing/dte-email-template.ts`:
- `renderDteEmailSubject(template, vars)` y `renderDteEmailHtml(template, vars)`.
- Tokens: `{{razonSocial}} {{folio}} {{tipo}} {{total}} {{fecha}} {{receiverName}}`.
- HTML, no Markdown.
- Templates editables por tenant en `TenantDteConfig.emailTemplateSubject / emailTemplateBody`.

### 2.5 Idempotencia — **NO existe**

Búsqueda explícita:
```bash
rg -n "idempotencyKey|idempotency_key|deduplicate" src/modules/finance src/app/api/finance
```
Sin matches relevantes. Doble click en el botón "Reenviar" genera **dos `FinanceDteEmailLog` rows** y dos envíos en Resend. Hay que agregar `idempotencyKey @unique` y short-circuit antes de llamar a Resend.

### 2.6 Llamadas directas a `resend.emails.send` en módulos finance

`grep -rn "resend\.emails\.send" src/modules/finance src/app/api/finance`:

- `src/modules/finance/billing/dte-email.service.ts:197` — `sendDteEmail` (correcto).
- `src/modules/finance/billing/dte-email.service.ts:341` — `sendDteXmlToBackoffice` (correcto, mismo servicio).
- `src/modules/finance/billing/billing-document-send.service.ts:308` — Proforma / Estado de Pago. **Fuera del servicio DTE**.
- `src/modules/finance/billing/dte-rejected-alert.service.ts:127` — alerta operativa de DTE rechazado (no es envío del DTE en sí).
- `src/modules/finance/factoring/cession.service.ts:648` — Cesión a factoring.

**Conclusión para el criterio "único path":** se cumple **para DTE emitido al receptor + backoffice XML**. Para alcanzar el espíritu del brief (un solo servicio) habría que también englobar proforma/estado de pago y la alerta de rechazos, pero eso amplía el scope. Recomiendo dejarlo fuera de este PR y trackear como follow-up.

### 2.7 Webhook de Resend — **NO toca `FinanceDteEmailLog`**

`src/app/api/webhook/resend/route.ts` (467 líneas).

Verificación svix con `RESEND_WEBHOOK_SECRET` (líneas 30-50). Eventos manejados: `email.delivered / opened / clicked / bounced / complained`.

El webhook hace lookup en **3 tablas** (líneas 66-139):

1. `prisma.presentation.findFirst({ emailMessageId })` — presentaciones CPQ.
2. `prisma.crmEmailMessage.findFirst({ resendId })` — emails CRM.
3. `prisma.opsEmailLog.findFirst({ resendId })` — onboarding/guardias.

**Falta el 4to lookup:** `prisma.financeDteEmailLog.findFirst({ resendId })`. Hoy un bounce de un DTE no actualiza nada en finance. La UI muestra "SENT" para siempre aunque haya rebotado.

**Hay que extender el webhook** (no crear uno nuevo) y, en paralelo, **agregar `resendId @unique`** a `FinanceDteEmailLog` (hoy no lo es) para que el lookup sea barato.

---

## 3. UI actual del módulo

### 3.1 Estructura de archivos

Server entry: `src/app/(app)/finanzas/facturacion/dtes/page.tsx` (250 líneas).

Componentes en `src/components/finance/dtes/`:

| Archivo | Líneas | Rol |
|---|---:|---|
| `DtesEmitidosClient.tsx` | 1173 | Orquestador client-side (filtros, selección, modals, KPIs). |
| `IssuedDtesTable.tsx` | 388 | Tabla desktop. |
| `IssuedDtesMobileList.tsx` | 259 | Lista de cards mobile. |
| `FiltersDrawer.tsx` | 404 | Drawer de filtros avanzados. |
| `KpiStrip.tsx` | 214 | 5 KPIs con sparklines. |
| `KpiStripReceived.tsx` | 200 | KPIs versión recibidos. |
| `BulkActionBar.tsx` | 147 | Barra de acciones masivas. |
| `DtePaymentTag.tsx` | 136 | Tag estado pago. |
| `ActiveFilterChips.tsx` | 133 | Chips de filtros activos. |
| `DtesToolbar.tsx` | 115 | Búsqueda + ordenamiento. |
| `RelationRow.tsx` | 62 | Referencias a folio original (NC/ND). |
| `SiiStatusPill.tsx` | 55 | Badge estado SII. |
| `LinkedNoteBadge.tsx` | 46 | Badge nota crédito vinculada. |
| `CessionBadge.tsx` | 34 | Badge cesión factoring. |
| `DocumentTag.tsx` | 25 | Tag tipo DTE. |
| `IssuedDteSlideOver.tsx` | 24 | Wrapper sheet del detail dialog. |
| `shared/types.ts`, `shared/constants.ts`, `hooks/useDteFilters.ts` | — | Tipos y filtros compartidos. |

Detalle principal (fuera de `dtes/`): `src/components/finance/IssuedDteDetailDialog.tsx` (**1377 líneas** — monolito), `src/components/finance/SendEmailDialog.tsx` (531 líneas).

### 3.2 Listado

`src/app/(app)/finanzas/facturacion/dtes/page.tsx:44-60`: carga inicial **50 DTEs** (`INITIAL_PAGE_SIZE`) con `take: 50` Prisma. **No es cursor pagination** — usa offset implícito y client-side filtering.

Desktop: `IssuedDtesTable` (388 líneas) — tabla shadcn con columnas (tipo+folio, status SII, receptor, monto, fecha, pago, aging, menú).

Mobile: `IssuedDtesMobileList` (259 líneas) — **ya usa cards**, no tabla. Pero:
- **No tiene swipe actions** (no se encontró `touchstart` ni libs swipe).
- **No tiene pull-to-refresh** (no se encontró `react-pull-to-refresh` ni handlers).
- **No tiene FAB sticky para "Nuevo"** — el botón vive en el toolbar.
- **Skeleton loader** no es claro a nivel mobile (hay que verificar manualmente).
- Selección múltiple existe (checkbox aparece si `selectedIds.size > 0`) pero no es bottom-sheet ni mobile-optimized.
- Long-press no implementado.

### 3.3 Detalle: `IssuedDteDetailDialog.tsx` — 1377 líneas

`presentation` prop alterna entre `dialog` (modal centrado) y `sheet` (slide-over).

Dimensiones (lines 488-502):
- Sheet mobile (cuando `isMobileViewport`): `max-h-[92vh] rounded-t-2xl` — sí respeta mobile.
- Sheet desktop: `sm:max-w-xl`.
- Dialog fallback: `sm:max-w-3xl max-h-[90vh] overflow-y-auto`.

`IssuedDteSlideOver.tsx` (24 líneas) es solo un wrapper que fuerza `presentation="sheet"`.

**No tiene tabs** (`Detalle / Envíos / SII / Adjuntos`) — todo está en una vista vertical larga. La timeline de envíos vive embebida; refactorizar en tabs es trabajo nuevo.

### 3.4 Reenvío de email: `SendEmailDialog.tsx` (531 líneas)

`src/components/finance/SendEmailDialog.tsx:294-295`:
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-2xl">
```

Es un **Dialog modal** (centrado, max-w-2xl), **no es un bottom sheet mobile**. En iPhone SE (375px) queda comprimido y mal usable. Es el componente principal a sustituir por el **Sender Sheet** del brief.

Faltan:
- Lista de contactos del cliente con checkboxes (hoy es solo input de email).
- Pre-marcado por flags del tipo de DTE.
- Bloque "Copia interna (BCC)" expandible.
- localStorage de emails ad-hoc.

### 3.5 Problemas mobile encontrados

| Problema | Archivo | Detalle |
|---|---|---|
| `SendEmailDialog` es `Dialog`, no `Sheet` | `SendEmailDialog.tsx:294-295` | Mal usable en 375px. |
| `IssuedDteDetailDialog` no tiene tabs | `IssuedDteDetailDialog.tsx` (1377 líneas) | Scroll vertical extenso; difícil llegar a "Envíos" o "Adjuntos". |
| No hay swipe-actions en cards | `IssuedDtesMobileList.tsx` | Spec pide swipe-left "Reenviar" y swipe-right "Ver PDF". |
| No hay pull-to-refresh | `dtes/page.tsx` + lista mobile | El usuario necesita refresh manual (¿hard refresh?). |
| No hay FAB sticky | n/a | Spec pide "Nuevo" como FAB con safe-area. Hoy es botón normal. |
| No safe-area-inset explícito | grep `safe-area` → 0 matches en `src/components/finance/dtes/` | iPhone 14+ con notch puede tener problemas en bottom actions. |
| Pagination no es cursor | `page.tsx:44,60` | Si hay 500+ DTEs, el offset pagination puede deteriorar performance. |

### 3.6 Configuración del tenant ya existe

`src/app/(app)/opai/configuracion/finanzas/dte/page.tsx` y `src/components/finance/DteConfigClient.tsx` (1+ archivos) — hub de configuración DTE existente. Ahí viven los datos del emisor, cert, CAF, templates. **Hay que aprovechar esta página** para sumar la sección "Email" del brief (alwaysBcc, fromName, replyTo). NO crear `/configuracion/facturacion` aparte (duplicaría flujo).

---

## 4. Integración SII / SimpleAPI

### 4.1 Wrapper

`src/modules/finance/shared/adapters/simpleapi.provider.ts` (~1005 líneas).

Implementa la interfaz `DteProviderAdapter` definida en `src/modules/finance/shared/adapters/dte-provider.adapter.ts`:
- `issue(req)` — emisión completa (genera + envía sobre).
- `getStatus(trackId)` — consulta estado al SII.
- `getXml(dteType, folio)` — lee de BD (`FinanceDte.dteXml`).
- `getPdf(dteType, folio)` — regenera localmente con `pdf-lib` + `bwip-js` (PDF417 timbre).
- `cede(req)` — cesión a factoring (delega a SimpleAPI o SII directo según `cessionProvider`).

Flujo de emisión (3 pasos):
1. `POST api.simpleapi.cl/api/v1/dte/generar` → XML firmado + timbrado.
2. `POST api.simpleapi.cl/api/v1/envio/generar` → sobre firmado.
3. Upload al SII: directo vía SOAP (default) o vía SimpleAPI (legacy) según env `SIMPLEAPI_ENVIO_ENVIAR`.

Preflight: `src/modules/finance/billing/dte-preflight.ts` valida cert vigente, password OK, CAF disponible, RUT consistente.

Tests: `src/modules/finance/billing/__tests__/dte-preflight.test.ts` (existe).

### 4.2 Storage del XML/PDF firmados

- **XML firmado:** `FinanceDte.dteXml Bytes?` en BD. **No en R2.** Verificado en `dte-email.service.ts:135-137` (lectura vía provider que lee BD) y en `src/modules/finance/shared/adapters/simpleapi.provider.ts:140` (comentario explícito).
- **PDF firmado:** **no se persiste**. Se regenera on-demand desde el XML cada vez que se necesita. Decisión razonable (PDF pesa y se puede reconstruir), pero impacta:
  - El brief dice "PDF adjunto = XML firmado original (no se re-firma ni regenera)". El XML cumple; **el PDF sí se re-renderiza** cada envío. **Carlos debe confirmar si esto es aceptable** o si hay que persistir el PDF también (impacta R2/BD).
- **Adjuntos de usuario:** en R2 con `storageKey` (formato `${tenantId}/finance/...`). Ver `FinanceDteAttachment.storageKey` y `src/lib/storage.ts:88-119` (`uploadFile`).

R2 client: `src/lib/storage.ts:17-42`. Workaround para R2 checksum CRC32 (`requestChecksumCalculation: "WHEN_REQUIRED"`).

---

## 5. Dependencias externas

`package.json`:

| Dependencia | Versión |
|---|---|
| `next` | ^16.0.0 (App Router) |
| `react` | ^19.0.0 |
| `@prisma/client` | ^6.19.2 |
| `prisma` | ^6.19.2 |
| `resend` | ^6.9.1 |
| `@react-email/components` | ^1.0.7 |
| `@react-email/render` | ^2.0.4 |
| `svix` | ^1.88.0 (webhooks) |
| `zod` | ^4.3.6 |
| `tailwindcss` | ^3.4.17 |
| `@radix-ui/react-dialog` | ^1.1.15 |
| `lucide-react` | ^0.563.0 |
| `date-fns` | ^4.1.0 |
| `nanoid` | ^5.1.6 (UUIDs) |
| `pdf-lib`, `bwip-js`, `xml-crypto` | (presentes, para PDF DTE) |
| `@aws-sdk/client-s3` | ^3.1007.0 (R2) |
| `@aws-sdk/s3-request-presigner` | ^3.1045.0 |

**Comentarios:**

- **Next 16 + React 19**: el brief habla de "Next 15"; estamos en 16. La diferencia es mínima para Server Actions y App Router, pero hay que confirmar que las APIs usadas en el plan siguen vigentes.
- **shadcn `sheet`** disponible en `src/components/ui/sheet.tsx` (verificado). Se usa por ejemplo en `src/components/access-control/AccessControlRecordDetailSheet.tsx:9`.
- **No hay drawer (vaul)** — `sheet` cumple el rol de bottom sheet en mobile.
- **`react-pull-to-refresh`** **no está instalada**. Si se quiere PTR hay que decidir entre agregarla o implementación nativa con touchstart/touchmove (más liviano).
- **`crypto.randomUUID`** (browser) o `nanoid` ya disponibles para idempotencyKey en el cliente.

### 5.1 Variables de entorno (`.env.example`)

| Variable | Línea | Estado |
|---|---:|---|
| `RESEND_API_KEY` | 54 | ✅ Documentada. |
| `EMAIL_FROM` | 57 | ✅ Documentada (fallback `OPAI <opai@gard.cl>`). |
| `EMAIL_REPLY_TO` | 58 | ✅ Documentada (redactada). Usada como BCC implícito en DTE. |
| `RESEND_WEBHOOK_SECRET` | 63 | ✅ **Ya existe** — el brief asume que no. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | 136-140 | ✅ Documentadas. |
| `DTE_PROVIDER`, `DTE_API_KEY`, `DTE_API_SECRET`, `DTE_API_URL`, `DTE_CERTIFICATE_PASSWORD` | 163-167 | ✅ Documentadas. Provider abstracto, no `SIMPLEAPI_*` hard-coded. |
| `OCTAVA_INTEGRADOR_RUT`, `OCTAVA_INTEGRADOR_PASSWORD` | 176-178 | ✅ Cesión factoring. |
| `SIMPLEAPI_ENVIO_ENVIAR` | — | ❌ No documentada explícitamente en `.env.example`, aunque se usa en código (`simpleapi.provider.ts`). Hay que sumarla. |

---

## 6. Hallazgos críticos (ranked)

### P0 — Hay que decidir antes de Fase 1

1. **`CrmContact` vs `ClienteContacto`**: ¿extender `CrmContact` con los 4 flags `recibe*` o crear `ClienteContacto` paralelo? Recomiendo extender (no duplicar).
2. **`Tenant.dteSettings Json` vs columnas en `TenantDteConfig`**: ¿añadir `alwaysBcc`/`fromName`/`replyTo` a `TenantDteConfig` o adoptar un campo `Json` en `Tenant`? Recomiendo extender `TenantDteConfig` (consistencia con el resto del modelo).
3. **`FinanceDteEmailLog` vs `DTEEnvio`**: ¿extender o crear modelo nuevo? Recomiendo extender (agregar `idempotencyKey @unique`, `attemptNumber`, `deliveredAt/openedAt/bouncedAt`, convertir strings a enums). El nombre `DTEEnvio` rompe el namespace `Finance*` actual.
4. **PDF on-demand vs persistido**: hoy el PDF se regenera cada envío. ¿Aceptable? Si no, hay que sumar persistencia (R2 o BD) y la migración correspondiente.

### P1 — Bugs / gaps reales en el flujo actual

5. **No hay idempotencia.** Doble click reenvía. Hay que sumar `idempotencyKey @unique` y short-circuit.
6. **Webhook de Resend ignora DTE.** Bounces y opens de DTEs no actualizan el log. Hay que extender `src/app/api/webhook/resend/route.ts` con un 4to lookup en `financeDteEmailLog` por `resendId` (y hacer ese campo `@unique`).
7. **BCC al tenant es global (env), no per-tenant.** Hay que migrarlo a `TenantDteConfig.alwaysBcc String[]` y leerlo en `sendDteEmail`.
8. **`SendEmailDialog` no es mobile-first.** Es un `Dialog` modal con `sm:max-w-2xl`. Hay que reemplazarlo por un `Sheet` bottom con la estructura del brief.
9. **Selector de contactos no usa `CrmContact`.** Hoy es un input libre de emails; el brief pide checkboxes pre-marcados por flag. Hay que cargar contactos del cliente al abrir el sheet.

### P2 — Mejoras del listado mobile

10. Sin swipe-actions, sin pull-to-refresh, sin FAB sticky, sin safe-area-inset explícito.
11. Pagination es offset (50 inicial), no cursor. Con 500+ DTEs degrada.
12. `IssuedDteDetailDialog.tsx` es un monolito de 1377 líneas sin tabs; refactor a tabs (Detalle / Envíos / SII / Adjuntos) es trabajo de scope sizeable.

### P3 — Limpieza

13. `kind` (`finance_dte_email_logs`), `status`, `attachments` son strings en BD pero deberían ser enums.
14. `emailStatus` en `FinanceDte` es `String?` libre — debería ser enum.
15. Templates usan tokens `{{razonSocial}}` HTML; el brief habla de tokens `{{tipoDTE}} {{tenant.razonSocial}}` Markdown. Hay que mapear o migrar.

---

## 7. Próximos pasos

Esta auditoría queda como **draft** para Carlos.

**Antes de Fase 1 hay que confirmar:**

- [ ] Punto 1 (CrmContact vs ClienteContacto) y los demás 4 P0.
- [ ] Si la ruta del módulo se mantiene en `(app)/finanzas/facturacion/dtes` o se renombra a `dte-emitidos`.
- [ ] Si extendemos `FinanceDteEmailLog` o creamos `DTEEnvio` paralelo.
- [ ] Si persistimos el PDF firmado o asumimos regeneración on-demand.
- [ ] Si el scope de "unificar envíos" incluye proforma/estadoPago/alertas o solo DTE.

**Una vez aprobado**, Fase 1 toca:
- Migración Prisma extendiendo `CrmContact` (+ flags), `TenantDteConfig` (+ alwaysBcc/fromName/replyTo) y `FinanceDteEmailLog` (+ idempotencyKey/attempt/deliveredAt/openedAt/bouncedAt/enums).
- Script de migración de datos (si hay flags por defecto a setear para contactos existentes).
- UI de configuración: extender la página actual `(app)/opai/configuracion/finanzas/dte` con la sección "Email" — no crear `/configuracion/facturacion`.

---

**Fin del reporte.**
