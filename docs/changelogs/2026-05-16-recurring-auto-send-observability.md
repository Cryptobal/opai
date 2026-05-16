# Changelog: Observabilidad y recuperabilidad de auto-send recurrente

**Fecha:** 2026-05-16  
**Branch:** `fix/recurring-auto-send-observability-01d2`  
**Afecta:** Módulo Facturación → Programación recurrente

---

## Resumen ejecutivo

El cron de facturación recurrente generaba borradores correctamente pero los auto-envíos de Proforma/Estado de Pago fallaban silenciosamente: `status: "success"` aunque los emails no salieran, sin ningún registro en BD. Este PR agrega trazabilidad end-to-end: cada fallo queda en `FinanceDteEmailLog` con un enum específico, el run guarda el detalle en `autoSendIssues`, y la UI muestra badges de advertencia con un CTA para reenviar manualmente.

---

## Antes vs después del flujo

```
ANTES:
  Cron → createDraft → [autoSend] → sendBillingDocument()
                                         ↓ falla en buildBillingDocProps
                                         ↓ console.error (solo Vercel logs)
                                         ↓ RUN status = "success" ← MENTIRA
                                         ↓ FinanceDteEmailLog = ninguno

DESPUÉS:
  Cron → createDraft → [autoSend] → sendBillingDocument(isAutoFromCron=true)
                                         ↓ falla en buildBillingDocProps
                                         ↓ FinanceDteEmailLog(kind=AUTO_PROFORMA, status=FAILED)
                                         ↓ autoSendIssues = [{variant, error, threw}]
                                         ↓ RUN status = "success" + autoSendIssues NOT NULL
                                         ↓ UI muestra badge ⚠️ "1 error auto-envío"
                                         ↓ Usuario hace click → ve el error → "Reenviar Proforma"
                                         ↓ BillingDocSendModal → POST /drafts/[id]/send-as
                                         ↓ FinanceDteEmailLog(kind=MANUAL_PROFORMA, status=SENT)
```

---

## Caso reportado (Gard SpA · 16-may-2026)

**Hipótesis más probable:** La plantilla tiene `autoSendProforma=true` y/o `autoSendPaymentStatement=true`, y los contactos en `recipientContactIds` o bien no existen, no tienen email válido, o su `accountId` no coincide con el `crmAccountId` de la plantilla. El borrador de $1.190.000 se generó correctamente (el run registró `status=success`) pero el envío del PDF falló antes de llegar a Resend — probablemente en `buildBillingDocProps` (relación CRM rota) o en la validación de destinatario (sin primary).

**Para confirmar en producción**, ejecutar el script de diagnóstico (ver sección "Cómo verificar").

---

## Los 5 problemas y sus fixes

| # | Problema | Fix |
|---|----------|-----|
| 1 | `runTemplate` registra `success` aunque auto-sends fallen | Colecta errores en `autoSendIssues`, los persiste en `FinanceDteRecurringRun.autoSendIssues` |
| 2 | `buildBillingDocProps` + `renderBillingDocPdf` fuera del try/catch | Envueltos en try/catch propio con log en `FinanceDteEmailLog` |
| 3 | Validación "sin destinatario" no crea log | Ahora llama a `logEmail` antes de retornar `{success: false}` |
| 4 | `FinanceDteEmailKind` enum no tenía valores para proforma/estado de pago del cron | Agregados `AUTO_PROFORMA`, `AUTO_ESTADO_PAGO`, `MANUAL_PROFORMA`, `MANUAL_ESTADO_PAGO` |
| 5 | Texto del checkbox `autoSendEmail` era ambiguo | Reescrito: "cuando emitas el borrador **al SII**" (no cuando el cron lo genera) |

---

## Cómo el usuario verifica el fix

### 1. Diagnóstico de un template específico (read-only)

```bash
# Buscar el TEMPLATE_ID:
SELECT id, name, crm_account_id, recipient_contact_ids, auto_send_proforma
FROM finance.finance_dte_recurring_templates
WHERE tenant_id = '<gard_tenant_id>';

# Diagnosticar:
npx ts-node -r tsconfig-paths/register \
  --compiler-options '{"module":"CommonJS"}' \
  scripts/diagnose-recurring-auto-send.ts <TEMPLATE_ID> <TENANT_ID>
```

### 2. Forzar run manual

```bash
# API autenticada (reemplazar el token con un session cookie válido):
curl -X POST https://opai.cl/api/finance/billing/recurring/<TEMPLATE_ID>/run-now \
  -H "Cookie: authjs.session-token=..." \
  -s | jq '.data | {status, dteId: .dteId, issues: .autoSendIssues}'
```

Si `autoSendIssues` no es null, el auto-send falló. El borrador sí existe.

### 3. Ver status del DTE generado

```
GET /api/finance/billing/drafts/<DTE_ID>/auto-send-status
```

Retorna estado de Proforma + Estado de Pago + últimos 20 logs de email.

### 4. Ver badges en UI

En Facturación → Programación, cualquier plantilla cuyo último run haya tenido `autoSendIssues` mostrará un badge ⚠️ naranja "X errores auto-envío". Click → modal con detalle + botones "Proforma" / "Estado de Pago" → abre `BillingDocSendModal` para reenviar.

### 5. Filtrar solo plantillas con errores

En Programación → chip "Con errores de auto-envío".

---

## Pasos post-deploy a producción

1. Aplicar las 2 migraciones:
   ```bash
   npx prisma migrate deploy
   ```
   En orden:
   - `20260918000000_finance_dte_email_kind_add_billing_doc_variants`
   - `20260918010000_finance_dte_recurring_run_auto_send_issues`

2. Forzar re-run del template de Gard SpA:
   ```
   POST /api/finance/billing/recurring/<TEMPLATE_ID>/run-now
   ```

3. Verificar en BD:
   ```sql
   -- Confirmar que autoSendIssues se pobló si hay error:
   SELECT id, status, auto_send_issues, ran_at
   FROM finance.finance_dte_recurring_runs
   WHERE template_id = '<TEMPLATE_ID>'
   ORDER BY ran_at DESC
   LIMIT 3;

   -- Confirmar que FinanceDteEmailLog registró el intento:
   SELECT kind, status, error_message, sent_at
   FROM finance.finance_dte_email_logs
   WHERE dte_id = '<DTE_ID>'
   ORDER BY sent_at DESC;
   ```

4. Si el case del 16-may sigue sin email → usar la UI para reenviar manualmente desde el badge ⚠️.

---

## TODO / próximas fases

- **Reintentos automáticos para fallos transitorios** (Fase 2): implementar backoff exponencial para errores de Resend (5xx). Actualmente todos los fallos van a `autoSendIssues` y requieren intervención manual.
- **Mover filtro "con errores de auto-envío" a server-side**: actualmente es client-side. Para grandes cantidades de plantillas, agregar un query parameter al endpoint GET `/api/finance/billing/recurring?hasIssues=true`.
- **Mejorar mensajes de error de `renderBillingDocPdf`**: distinguir entre error de fuente faltante, logo R2 inaccesible y OOM para que el usuario pueda diagnosticar sin Vercel logs.
- **Envío de notificación interna**: cuando `autoSendIssues` se puebla, considerar enviar un email al backoffice del tenant para notificar la degradación (actualmente solo es visible en la UI).

---

## Archivos cambiados

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Enum + campo `autoSendIssues` + docblock |
| `prisma/migrations/20260918000000_*/migration.sql` | `ALTER TYPE ... ADD VALUE` para 4 nuevos valores |
| `prisma/migrations/20260918010000_*/migration.sql` | `ALTER TABLE ... ADD COLUMN auto_send_issues JSONB` |
| `src/modules/finance/billing/billing-document-send.service.ts` | try/catch completo, `isAutoFromCron`, `variantToKinds`, log en todas las salidas |
| `src/modules/finance/billing/dte-recurring.service.ts` | `isAutoFromCron: true`, colección de `autoSendIssues`, persistencia en run |
| `src/app/api/finance/billing/drafts/[id]/auto-send-status/route.ts` | Endpoint nuevo (GET) |
| `src/app/api/finance/billing/recurring/route.ts` | Enriquecer lista con `lastRunIssues` + `lastRunDteId` |
| `src/components/finance/RecurringClient.tsx` | Badges ⚠️, filtro chip, modal detalle, BillingDocSendModal |
| `src/components/finance/RecurringTemplateForm.tsx` | Texto del checkbox `autoSendEmail` |
| `scripts/diagnose-recurring-auto-send.ts` | Script de diagnóstico read-only |
