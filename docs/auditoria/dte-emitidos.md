# Auditoría — DTE Emitidos (Fase 0 del PR de tracking async + mobile-first + sender sheet)

> **Tipo:** READ-ONLY. No se modificó código.
> **Branch:** `claude/dte-emitidos-mobile-tracking-UuChG`
> **HEAD auditado:** `45b9946` (main al momento de auditar)
> **Fecha:** 2026-05-13
> **Scope:** verifica cada hallazgo del brief antes de avanzar a Fase 1 (4 migraciones Prisma).

Este documento confirma — con cita de archivo y línea — que el estado real del repo coincide con lo que el brief asume. Cualquier desviación queda anotada explícitamente para que Carlos decida cómo seguir.

---

## 0. Resumen de verificación

| Área | Hallazgo del brief | Estado | Nota |
|---|---|---|---|
| Schema | `CrmContact` sin flags `recibe*` | ✅ Confirmado | `prisma/schema.prisma:2297-2334`. |
| Schema | `TenantDteConfig` sin `alwaysBcc`/`fromName`/`replyTo` | ✅ Confirmado | `prisma/schema.prisma:10424-10529`. |
| Schema | `FinanceDteEmailLog`: `kind/status/attachments` como `String`, `resendId` sin `@unique`, sin `idempotencyKey`/`attemptNumber`/`deliveredAt`/`openedAt`/`bouncedAt`/`complainedAt` | ✅ Confirmado | `prisma/schema.prisma:6826-6857`. |
| Schema | `FinanceDte` sin `pdfR2Key` | ✅ Confirmado | `grep pdfR2Key/pdf_r2_key src/ prisma/` → 0 matches. |
| Servicio | `sendDteEmail` único path | ✅ Confirmado | `src/modules/finance/billing/dte-email.service.ts` (393 líneas). |
| Servicio | Firma posicional | ⚠️ Confirmado con matiz | Brief dice "7 args"; reales son **8** (`tenantId, dteId, recipientEmail?, ccOverride?, kind?, triggeredBy?, bccOverride?, excludeAttachmentIds?`). |
| Servicio | 3 callers en `dte-issuer:438`, `send-email/route:50`, `bulk-resend-email/route` | ✅ Confirmado | Bulk-resend está en línea 67 (no en :50). |
| Servicio | BCC actual viene del env `EMAIL_REPLY_TO` (no per-tenant) | ✅ Confirmado | `dte-email.service.ts:114-129`. |
| Servicio | PDF se regenera (sin persistencia) | ✅ Confirmado | `dte-email.service.ts:135-138` + comentario del provider. |
| Webhook | 3 lookups actuales (Presentation, CrmEmailMessage, OpsEmailLog), sin `financeDteEmailLog` | ✅ Confirmado | `src/app/api/webhook/resend/route.ts:65-143`. |
| UI | `page.tsx` con `take: 50` offset, sin cursor | ✅ Confirmado | `src/app/(app)/finanzas/facturacion/dtes/page.tsx:44,55-61`. |
| UI | `IssuedDtesMobileList`: cards SÍ, sin swipe/PTR/FAB/safe-area | ✅ Confirmado | `src/components/finance/dtes/IssuedDtesMobileList.tsx` (259 líneas). |
| UI | `IssuedDteDetailDialog`: sin Tabs | ✅ Confirmado | 1377 líneas, `grep Tabs/TabsTrigger/TabsContent/TabsList` → 0 matches. |
| UI | `SendEmailDialog`: `Dialog` con `sm:max-w-2xl` | ✅ Confirmado | `src/components/finance/SendEmailDialog.tsx:294-295`. |
| UI | `DteEmailTimeline` existe, status solo `sent`/`failed` | ✅ Confirmado | 126 líneas. |
| Env | `.env.example` ya tiene `RESEND_WEBHOOK_SECRET` | ✅ Confirmado | `.env.example:63`. |

**No hay hallazgos nuevos que invaliden el plan.** El único matiz es la cantidad de args (8 vs 7) del refactor de `sendDteEmail`, sin impacto en la firma object-input propuesta.

---

## 1. Schema — `prisma/schema.prisma`

### 1.1 `CrmContact` (línea **2297**)

```prisma
model CrmContact {
  id                     String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId               String    @map("tenant_id")
  accountId              String    @map("account_id") @db.Uuid
  firstName              String    @map("first_name")
  lastName               String    @map("last_name")
  email                  String?
  phone                  String?
  roleTitle              String?   @map("role_title")
  isPrimary              Boolean   @default(false) @map("is_primary")
  // ...portal/google fields
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt              DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  // ...relations
  @@map("contacts")
  @@schema("crm")
}
```

**Ausencias confirmadas** (necesarias en Migración 1.A):
- `recibeFacturacion Boolean @default(false)` — no existe.
- `recibeNotasCredito Boolean @default(false)` — no existe.
- `recibeCobranza Boolean @default(false)` — no existe.
- `recibeOperacional Boolean @default(false)` — no existe.

**Datos para la data migration:**
- Hoy la primacía se modela vía `isPrimary` (línea 2306) — el brief lo usa como criterio para marcar `recibeFacturacion = true` + `recibeNotasCredito = true`. Verificable.
- `contactoEstadoPagoId` en `CrmAccount` (relación `accountsEstadoPago CrmAccount[] @relation("AccountEstadoPagoContact")`, línea 2323) — referenciable como receptor de Cobranza.
- `FinanceDte.proformaRecipientContactIds String[] @db.Uuid` y `estadoPagoRecipientContactIds` — existen y son citables para la UPDATE del brief.

### 1.2 `TenantDteConfig` (línea **10424**)

Modelo presente con campos relevantes:
- `emisorRut`, `emisorRazonSocial`, `emisorGiro` (lines 10455-10463)
- `alertEmails String[] @default([])` (line 10477) — alertas operativas, **no** BCC de cada envío.
- `defaultXmlRecipientEmails String[]` + `defaultXmlRecipientAlwaysSend Boolean` (lines 10482-10486) — backoffice XML (solo XML al contador), **diferente** del concepto `alwaysBcc`.
- `emailTemplateSubject` / `emailTemplateBody` (lines 10491-10492) — templates de DTE.
- `proformaEmailSubject` / `proformaEmailIntro` / `estadoPagoEmail*` (lines 10498-10502) — templates doc cobro.

**Ausencias confirmadas** (necesarias en Migración 1.B):
- `alwaysBcc String[] @default([]) @map("always_bcc")` — no existe.
- `fromName String? @map("from_name")` — no existe.
- `replyTo String? @map("reply_to")` — no existe.

### 1.3 `FinanceDteEmailLog` (línea **6826**)

```prisma
model FinanceDteEmailLog {
  id       String     @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId String     @map("tenant_id")
  dteId    String     @map("dte_id") @db.Uuid
  dte      FinanceDte @relation(fields: [dteId], references: [id], onDelete: Cascade)

  /// "auto_receiver" | "auto_backoffice" | "manual_resend" |
  /// "manual_override_recipient" | "manual_backoffice"
  kind        String          // ← String, NO enum
  to          String[]
  cc          String[] @default([])
  bcc         String[] @default([]) @map("bcc")
  subject     String
  /// "pdf_xml" | "xml_only" | "pdf_only"
  attachments String          // ← String, NO enum

  status       String /// "sent" | "failed"   // ← String, NO enum
  resendId     String? @map("resend_id")      // ← NO @unique
  errorMessage String? @map("error_message")

  sentAt DateTime @default(now()) @map("sent_at") @db.Timestamptz(6)
  sentBy String?  @map("sent_by")

  @@index([tenantId, dteId], map: "idx_dte_email_log_dte")
  @@index([tenantId, sentAt], map: "idx_dte_email_log_sent")
  @@map("finance_dte_email_logs")
  @@schema("finance")
}
```

**Confirmaciones del brief:**
- `kind`, `status`, `attachments` son `String` con valores documentados solo en comentario — necesitan migrar a enums `FinanceDteEmailKind` / `FinanceDteEmailStatus` / `FinanceDteEmailAttachments` (Migración 1.C).
- `resendId` NO tiene `@unique` — sin lookup directo eficiente desde el webhook.
- Campos ausentes (todos necesarios en Migración 1.C):
  - `idempotencyKey String? @unique`
  - `attemptNumber Int @default(1)`
  - `deliveredAt DateTime?`
  - `openedAt DateTime?`
  - `bouncedAt DateTime?`
  - `complainedAt DateTime?`

**Valores reales en BD** (según comentarios y `dte-email.service.ts:35-71`):
- `kind` ∈ `auto_receiver | auto_backoffice | manual_resend | manual_override_recipient | manual_backoffice` — coinciden 1:1 con el enum propuesto (`AUTO_RECEIVER`, etc.). La data migration del brief mapea bien.
- `status` ∈ `sent | failed` — el brief mapea `sent → SENT`, `failed → FAILED`, y todo lo demás (no aplica hoy) `→ QUEUED`. Correcto.
- `attachments` ∈ `pdf_xml | xml_only | pdf_only` — mapeo directo.

⚠️ **Riesgo a anotar para Carlos:** el `CASE ... END` de migración para `attachments` y `kind` no tiene rama `ELSE`. Si en producción existe un valor fuera de los esperados (legacy), el `UPDATE` deja `NULL` y luego `ALTER ... SET NOT NULL` falla. Recomiendo agregar `ELSE 'PDF_XML'::finance."FinanceDteEmailAttachments"` y `ELSE 'MANUAL_RESEND'::finance."FinanceDteEmailKind"` defensivos antes de aplicar.

### 1.4 `FinanceDte` (línea **6408**)

`pdfR2Key` confirmadamente ausente — `grep pdfR2Key|pdf_r2_key prisma/ src/` devuelve 0 matches.

Campos relacionados al PDF actual:
- `dteXml Bytes?` (line 6507) — XML firmado + timbrado en BD. Se mantiene; no se mueve a R2.
- `pdfUrl String?` (line 6501) — legacy / sin uso en el flujo actual.
- `xmlUrl String?` (line 6502) — idem.

La nueva columna `pdfR2Key String? @map("pdf_r2_key")` (Migración 1.D) es coherente con el patrón ya usado en `FinanceDteAttachment.storageKey` (R2 con clave `${tenantId}/finance/...`).

---

## 2. Servicio de envío

### 2.1 `dte-email.service.ts` (393 líneas)

`src/modules/finance/billing/dte-email.service.ts` — único path para envío de DTE. Firma actual (líneas 83-92):

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
): Promise<SendDteEmailResult>;
```

> **Matiz vs brief:** son **8 args posicionales**, no 7 (el brief dice "firma posicional de 7 args"). El refactor a `SendDteEmailInput` propuesto sigue siendo correcto y necesario; solo hay que asegurarse de que todos los callers cubran `excludeAttachmentIds` como parámetro del nuevo objeto (el `send-email/route.ts:50` ya lo pasa hoy).

### 2.2 Callers de `sendDteEmail`

`grep -rn "sendDteEmail" src/`:

| Caller | Línea | Kind | Notas |
|---|---:|---|---|
| `src/modules/finance/billing/dte-issuer.service.ts` | **438** | `auto_receiver` | Emisión inicial tras `siiStatus = ACCEPTED`. Pasa solo `tenantId, dte.id, undefined, undefined, "auto_receiver", createdBy`. |
| `src/app/api/finance/billing/issued/[id]/send-email/route.ts` | **50** | `manual_resend` o `manual_override_recipient` | Reenvío manual desde modal. Pasa los 8 args (con `bccOverride` y `excludeAttachmentIds`). |
| `src/app/api/finance/billing/issued/bulk-resend-email/route.ts` | **67** | `manual_resend` | Reenvío bulk en batches. Brief anotaba "revisar línea exacta": es línea 67. |

Variante hermana **fuera** del scope del refactor pero relacionada: `sendDteXmlToBackoffice()` (`dte-email.service.ts:274+`), llamada desde `dte-issuer.service.ts:468`. No comparte firma con `sendDteEmail` y el brief no la toca.

### 2.3 BCC actual viene del env (no per-tenant)

`dte-email.service.ts:114-129`:

```ts
const tenantConfig = await prisma.tenantDteConfig.findUnique({ where: { tenantId } });
// ...
const emailCfg = await getTenantEmailConfig(tenantId);
const adminBcc = (emailCfg.replyTo ?? "").trim();
const rawBcc = [...(bccOverride ?? [])];
if (adminBcc && EMAIL_RE.test(adminBcc)) rawBcc.push(adminBcc);
```

`getTenantEmailConfig` lee de env (`EMAIL_REPLY_TO`, `.env.example:58`) — confirma que el BCC es **global de instancia**, no per-tenant. La estrategia del brief (fallback al env cuando `alwaysBcc` está vacío) es retro-compatible y no requiere data migration adicional.

### 2.4 PDF se regenera sin persistencia

`dte-email.service.ts:131-138`:

```ts
let xmlBuffer: Buffer;
let pdfBuffer: Buffer;
try {
  const provider = await getDteProvider(tenantId);
  [xmlBuffer, pdfBuffer] = await Promise.all([
    provider.getXml(dte.dteType, dte.folio),
    provider.getPdf(dte.dteType, dte.folio),     // ← regenera cada vez
  ]);
}
```

Firma del provider: `provider.getPdf(dteType, folio)` (sin `dteId/tenantId/options`). En el adapter SimpleAPI (`src/modules/finance/shared/adapters/simpleapi.provider.ts`) la implementación regenera localmente con `pdf-lib` + `bwip-js` desde `FinanceDte.dteXml`. **No hay persistencia en R2 hoy.**

Cambio propuesto en Fase 2.B (extender firma a `getPdf(dteType, folio, options?: { dteId, tenantId, forceRegenerate })`) es retro-compatible: el `?` mantiene la firma actual.

⚠️ **Anotación para Carlos:** la migración lazy (poblar `pdfR2Key` solo en el próximo envío) significa que para DTEs antiguos el primer reenvío post-deploy hace un round-trip extra (regen + upload). El brief lo asume y propone un hook proactivo en emisión nueva (`dte-issuer.service.ts` antes de `sendDteEmail`); para los históricos queda implícito en demanda. Aceptable.

---

## 3. Webhook Resend — `src/app/api/webhook/resend/route.ts` (467 líneas)

Header del archivo (líneas 13-17):

```
 * Busca en tres entidades:
 * 1. Presentation (emailMessageId) - presentaciones CPQ
 * 2. CrmEmailMessage (resendId) - correos CRM / follow-ups
 * 3. OpsEmailLog (resendId) - onboarding y comunicaciones a guardias
```

Verificación svix con `RESEND_WEBHOOK_SECRET` confirmada (líneas 30-50). Los 3 lookups están en:
- Línea **66**: `prisma.presentation.findFirst({ where: { emailMessageId: emailId } })`
- Línea **93**: `prisma.crmEmailMessage.findFirst({ where: { resendId: emailId } })`
- Línea **120**: `prisma.opsEmailLog.findFirst({ where: { resendId: emailId } })`

Y el fallback (línea **141**):
```ts
if (!presentation && !crmMessage && !opsEmailLog) {
  console.warn('⚠️ Ninguna entidad encontrada para emailId:', emailId);
}
```

**Ausencia confirmada:** `grep -n "financeDteEmailLog" src/app/api/webhook/resend/route.ts` → 0 matches. Sin 4to lookup. Bounces/opens de DTE se loguean en el `console.warn` y se pierden.

El plan de Fase 2.C (sumar lookup en `financeDteEmailLog` antes del fallback) es no-disruptivo: solo agrega una rama; no cambia las 3 existentes.

> **Recordar en Fase 2.C:** el webhook usa `data.email_id` (campo plano del payload Resend). El brief propone también un header `X-Entity-Ref-ID: log.id` en `resend.emails.send.headers` como alternativa al lookup por `resendId`. Cualquiera de los dos sirve — `resendId @unique` después de la migración 1.C ya lo deja barato.

---

## 4. UI

### 4.1 Listado server — `src/app/(app)/finanzas/facturacion/dtes/page.tsx` (250 líneas)

```ts
// línea 44
const INITIAL_PAGE_SIZE = 50;
// línea 50-53
const initialWhere = {
  tenantId,
  direction: "ISSUED" as const,
};
// línea 55-68
const [dtes, issuedTotal, suppliers] = await Promise.all([
  prisma.financeDte.findMany({
    where: initialWhere,
    include: { lines: true },
    orderBy: [{ siiStatus: "asc" }, { date: "desc" }, { folio: "desc" }],
    take: INITIAL_PAGE_SIZE,     // ← offset implícito, sin cursor
  }),
  prisma.financeDte.count({ where: initialWhere }),
  // ...
]);
```

**Confirmado:** `take: 50` puro, sin `cursor` ni `take: PAGE_SIZE + 1`. Pagination de Fase 2.G (cursor con `{ id: cursor }`, `skip: cursor ? 1 : 0`, response `{ items, nextCursor, hasNextPage }`) es greenfield para este endpoint.

⚠️ **Nota:** el `orderBy` actual mezcla `siiStatus: "asc"` con `date desc, folio desc`. Para cursor estable hay que mantener ese orden compuesto y agregar el cursor sobre el `id` (último tiebreaker). El brief simplifica a `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` — Carlos: confirmar si está OK perder el "pendientes arriba" o si mantenemos el ordenamiento actual y el cursor incluye los 4 keys. Recomiendo conservar el orden actual y usar un cursor compuesto.

### 4.2 Lista mobile — `src/components/finance/dtes/IssuedDtesMobileList.tsx` (259 líneas)

Las cards SÍ existen (`<Card key={d.id} ...>`, línea 78). Lo que **falta**, verificado con `grep`:

| Capacidad | Verificación | Resultado |
|---|---|---|
| Swipe-actions | `grep -E "onTouchStart\|TouchEvent\|swipe" IssuedDtesMobileList.tsx` | 0 matches |
| Pull-to-refresh | `grep -E "pull.*refresh\|PullToRefresh" IssuedDtesMobileList.tsx` | 0 matches |
| FAB sticky | grep `fixed bottom-` en `IssuedDtesMobileList.tsx` + `DtesEmitidosClient.tsx` | 0 matches en mobile list; en client tampoco hay FAB |
| `safe-area-inset` | `grep -r "safe-area\|env(safe-area" src/components/finance/dtes/` | 0 matches |

Selección múltiple sí existe (`selectionMode = selectedIds.size > 0` línea 67) pero no es mobile-optimized (checkbox plano dentro de la card, no bottom-sheet).

El layout usa tokens DS parcialmente (`bg-ds-surface-2`, `text-ds-text-2`, `border-ds-border-subtle`) pero tipografía mezcla `text-sm`/`text-xs` con tokens — para la Fase 4 conviene alinear a `[12px]`/`[13px]` que pide AGENTS.md.

### 4.3 Detalle — `src/components/finance/IssuedDteDetailDialog.tsx` (1377 líneas)

`grep -nE "Tabs|TabsTrigger|TabsContent|TabsList" IssuedDteDetailDialog.tsx` → **0 matches.**

Confirmado: NO usa tabs. Sí tiene presentación adaptativa Dialog/Sheet (importa ambos desde `@/components/ui/dialog` y `@/components/ui/sheet`, líneas 21-37) y un `presentation` prop que alterna entre dialog centrado y sheet lateral. El refactor a `dtes/detail/` con 4 tabs (Detalle / Envíos / SII / Adjuntos) es trabajo nuevo.

`IssuedDteSlideOver.tsx` (24 líneas) es solo wrapper que fuerza `presentation="sheet"`.

### 4.4 Modal de reenvío — `src/components/finance/SendEmailDialog.tsx` (531 líneas)

Líneas 294-295:

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-2xl">
```

Confirmado: es `Dialog`, no `Sheet`. En 375px queda comprimido (modal centrado). El reemplazo por `SenderSheet` mobile-first de Fase 4.A es necesario.

`grep -rn "SendEmailDialog" src/` (excluyendo el archivo mismo) — usos del componente:
- `src/components/finance/IssuedDteDetailDialog.tsx` (importado línea ~62: `import { SendEmailDialog } from "./SendEmailDialog"`)

Solo 1 call site fuera del propio archivo → la eliminación post-migración es de bajo riesgo.

### 4.5 Timeline — `src/components/finance/DteEmailTimeline.tsx` (126 líneas)

Confirmado:
- Existe.
- Define `type EmailLog` con `status: "sent" | "failed" | string` (línea 18) — sin estados async.
- Renderiza icono ok/fail según `log.status === "sent"` (línea 71-79).
- Llama `/api/finance/billing/issued/{dteId}/email-log` (línea 39).
- Sin badges de delivered/opened/bounced; sin timestamps de tracking.

La estrategia del brief de **no editar este archivo y crear `EnviosTabContent.tsx` nuevo** dentro de `dtes/detail/` es correcta y limpia. Después de la migración se puede borrar `DteEmailTimeline.tsx` si no queda ningún caller (revisar al final del PR con `grep`).

---

## 5. Env vars — `.env.example`

| Variable | Línea | Estado |
|---|---:|---|
| `EMAIL_REPLY_TO` | 58 | ✅ Documentada (usada como BCC implícito por `dte-email.service.ts:118`). |
| `RESEND_WEBHOOK_SECRET` | 63 | ✅ **Ya existe** (`whsec_xxxxxxxxxxxxxxxxxxxx`). El brief lo confirma. |

No hay env vars nuevas a sumar en este PR; toda la configuración nueva vive en `TenantDteConfig` (per-tenant).

---

## 6. Notas para Fase 1 (decisiones a confirmar antes de migrar)

1. **Defensive `ELSE` en los `CASE WHEN` de Migración 1.C.** Si hay rows de `kind`/`status`/`attachments` con valores fuera de la lista documentada (legacy), el `ALTER ... SET NOT NULL` falla. Recomiendo añadir `ELSE` defensivos antes de aplicar en producción. Ver §1.3.

2. **Ordenamiento del listado con cursor.** El `orderBy` actual mezcla `siiStatus asc` con `date/folio desc`. El brief simplifica a `createdAt desc, id desc`. Decidir: conservar UX actual (pendientes arriba) con cursor compuesto, o aceptar el cambio del brief. Ver §4.1.

3. **Backfill de `pdfR2Key` para DTEs históricos.** El brief asume migración lazy (primer reenvío). Para tenants con muchos reenvíos simultáneos post-deploy puede haber carga inicial concentrada en SimpleAPI/regen. Aceptable, pero anotable.

4. **`emailStatus` en `FinanceDte` (línea 6511) sigue siendo `String?` libre** (`"SENT"` / `"FAILED"` / null). No está en el scope del PR convertirlo a enum, pero queda inconsistente con la migración a enums en `FinanceDteEmailLog`. Trackear como follow-up.

5. **Múltiples `migrate resolve --rolled-back` en `package.json`** (history compleja). Las 4 migraciones nuevas hay que aplicarlas con cuidado al staging y verificar `npx prisma migrate status` antes de mergear.

---

## 7. STOP

**Fase 0 completa.** Esperar OK de Carlos para iniciar Fase 1 (4 migraciones Prisma).

Resumen de archivos a tocar en Fase 1:
- `prisma/schema.prisma` — extender 4 modelos.
- `prisma/migrations/<ts>_crm_contacts_recibe_flags/migration.sql` (Migración 1.A).
- `prisma/migrations/<ts>_tenant_dte_config_email_per_tenant/migration.sql` (Migración 1.B).
- `prisma/migrations/<ts>_finance_dte_email_log_async_tracking/migration.sql` (Migración 1.C).
- `prisma/migrations/<ts>_finance_dte_pdf_r2_key/migration.sql` (Migración 1.D).

**Fin de Fase 0.**
