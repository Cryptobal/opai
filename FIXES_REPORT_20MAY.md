# Fixes 20-May 2026 — Resumen ejecutivo

## Diagnóstico

**No ejecutado** — el sandbox de Claude Code on the web no tiene `.env.local` con
`DATABASE_URL`, así que no se pudo conectar a la DB para diagnosticar el estado
del cron de hoy. El script de diagnóstico quedó listo en
`scripts/diagnose-auto-send-today.ts` para correrlo desde tu máquina:

```bash
# Desde tu máquina, con .env.local de prod:
npx tsx scripts/diagnose-auto-send-today.ts
```

El script imprime el root cause y guarda un JSON en
`scripts/.diagnosis-auto-send-today.json`.

## Cambios deployados

| Fase | Cambio | Archivos |
|---|---|---|
| 2-3 | Instalación + cuenta CRM visibles en card y sheet de borrador | `dte-draft.service.ts`, `DraftsMobileList.tsx`, `DraftDetailSheet.tsx` |
| 4 | Endpoint `POST /api/finance/billing/drafts/bulk-retry-send` con backfill desde plantilla | `bulk-retry-send/route.ts` |
| 5 | Endpoint `GET /api/finance/billing/drafts/pending-sends` para alimentar el banner | `pending-sends/route.ts` |
| 6 | Banner amarillo "N borradores con envío pendiente" en `/programacion` con botón Reintentar | `PendingSendsBanner.tsx`, `PendingSendsBannerWrapper.tsx`, `page.tsx` |
| 7 | Fix overflow horizontal del modal "Editar plantilla recurrente" (y dialog base) | `dialog.tsx`, `RecurringTemplateForm.tsx` |
| 8 | Link "Corregir destinatarios →" desde el modal de errores auto-envío hacia la sección de destinatarios del form | `RecurringClient.tsx`, `RecurringTemplateForm.tsx` |

## Cómo funciona el flujo de recovery (acción inmediata)

1. Abrí `/finanzas/facturacion/programacion` en el celular.
2. Si hay borradores con envío pendiente, aparece un banner amarillo con el
   conteo (proformas, estados de pago, "N sin destinatarios").
3. Tap **"Reintentar"** → confirmá.
4. Para cada borrador, el endpoint:
   - Si el draft ya tiene destinatarios → manda directo.
   - Si el draft está vacío pero la plantilla origen tiene destinatarios
     cargados ahora → copia destinatarios de la plantilla al draft (backfill)
     y manda.
   - Si ni el draft ni la plantilla tienen destinatarios → falla con error
     legible.
5. Toast resume `okCount / failCount / backfillCount`.

## Para corregir las plantillas que no tienen destinatarios

1. En `/finanzas/facturacion/recurring`, cualquier plantilla con `auto-envío ON`
   pero sin contactos aparece con el chip ámbar "N errores auto-envío".
2. Tap el chip → modal de detalle.
3. Tap **"Corregir destinatarios →"** → abre el form de la plantilla
   scrolleado a la sección de destinatarios.
4. Marcá contactos del cliente, guardá.
5. Volvé a `/programacion` y tap "Reintentar" en el banner para que los
   borradores generados hoy usen los nuevos destinatarios (vía backfill).

## Pendiente (acción manual para Carlos)

1. **Correr el diagnóstico** desde tu máquina con `.env.local` apuntando a prod
   para confirmar el root cause exacto de hoy.
2. **Si root cause = `ENVIO_FALLO_TECNICO`** (Resend, PDF render, etc.):
   parar y revisar `sampleErrors` antes de reintentar — el problema no es de UI.
3. **Si root cause = `TEMPLATES_LACK_RECIPIENTS` o `BUG_DRAFT_HAS_RECIPIENTS_BUT_NOT_SENT`**:
   abrir `/programacion` y usar el banner para reintentar.

## Build / typecheck

- `npx tsc --noEmit` → ✅ 0 errores
- `npm run build` → ❌ falló por Google Fonts inalcanzable desde el sandbox
  (problema de red, no de código). El typecheck cubre toda la superficie tocada.

## Commits en `claude/fix-auto-send-emails-SThUV`

```
34799a0 chore(scripts): add diagnose-auto-send-today + trigger-bulk-retry helpers
b329d8d feat(recurring): quick-link from auto-send error banner to recipients section
fec84f8 fix(dialog,recurring-template): prevent horizontal overflow on mobile
4177983 feat(programacion): pending sends banner with bulk retry + backfill
5879fbc feat(finance): bulk-retry-send + pending-sends endpoints with template recipient backfill
6bb34b2 feat(programacion): expose installation + crm account name in draft list and detail
```
