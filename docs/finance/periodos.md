# Períodos contables — apertura automática, cierre humano

## Filosofía

Dos actos, dos naturalezas opuestas:

- **La APERTURA de un período es plomería y debe ser invisible.** Facturar en
  julio contabiliza en julio, punto. Nadie en Gard "abre un período" jamás: el
  sistema lo hace solo con el primer asiento del mes.
- **El CIERRE es un acto contable humano** (cuadrar, revisar, sellar) y JAMÁS se
  automatiza. Se recuerda insistentemente, pero lo decide y ejecuta una persona.

El modelo mental de Carlos —"cada factura cae en su mes, automático"— es la
verdad del sistema.

## Flujo mensual del contador

1. **Día 1 (y refuerzo el día 5)** — llega el recordatorio: *"Junio 2026 sigue
   abierto — N asientos, M documentos sin asiento. Revisa y cierra."* con link
   directo a Contabilidad. Con el ruteo Slack existente, también aterriza en el
   canal de finanzas.
2. **Salud del período** — en `/finanzas/contabilidad → Períodos`, si hay
   documentos emitidos sin asiento, aparece la card **"Salud del período"** con
   el conteo y el botón **"Generar asientos faltantes"** (un clic, idempotente,
   resultado detallado, auditado). También se puede reparar factura por factura
   desde el detalle del DTE (acción *"Generar asiento contable"*).
3. **Cerrar** — botón *Cerrar*. Si aún quedan documentos sin asiento, el cierre
   se **bloquea** con un mensaje accionable; se puede **"Cerrar de todos modos"**
   de forma explícita (queda en la auditoría).

## Cómo funciona por dentro

### B1 · Auto-apertura perezosa (el fix raíz)

`journal-entry.service.ts → resolvePeriodForEntry()`:

- El período se resuelve por la **fecha contable** del asiento (`input.date`), no
  por `now()`.
- Si el mes no tiene período → se abre solo (`openPeriod`, límites del mes) +
  `logAudit(accounting_period_auto_opened)` + notify informativo único.
- Si el período existe pero está **CLOSED/LOCKED** → el error *"está cerrado"* se
  mantiene intacto: contabilizar en un mes cerrado es un error accionable que el
  contador debe resolver, no algo que se resucita solo.
- **Regla de sanidad**: no se auto-abre un mes pasado si ya existe un período
  **posterior** cerrado (evita resucitar historia por un documento mal fechado).
- **Concurrencia**: se captura el `P2002` del unique `(tenant, year, month)` y se
  relee el período que ganó la carrera.

### B2 · Salud contable

Vínculo canónico DTE↔asiento: **`FinanceDte.journalEntryId`**. Un documento
emitido con `journalEntryId = null` es un huérfano.

- `findDocumentsWithoutEntry(tenantId, {year, month}?)` — consulta canónica:
  `direction = ISSUED`, `dteType ∈ {33, 34}`, `journalEntryId = null`,
  `siiStatus ∈ {PENDING, SENT, ACCEPTED, WITH_OBJECTIONS}`,
  `voidedByCreditNoteId = null`.
- `createEntryForDte(tenantId, dteId, actorId)` — función reutilizable
  (extraída del issuer). Idempotente: si el DTE ya tiene asiento, *skip*. El
  issuer y la reparación de huérfanos comparten este único camino.
- `generateMissingEntries(tenantId, ids, actorId)` — loop con resultado por
  documento.
- Cuando el auto-asiento del issuer falla, además del `console.error` se dispara
  la notificación `accounting_entry_failed` al equipo contable — un asiento
  fallido nunca más es invisible.

### B3 · Recordatorios de cierre

Cron `/api/cron/accounting-period-monitor` (vercel.json: `0 12 1 * *` y
`0 12 5 * *` — día 1 y refuerzo día 5, 08:00 Chile). Por cada tenant cuyo
período del **mes anterior** siga `OPEN`, notifica
`accounting_period_close_reminder` con el conteo de asientos y de documentos sin
asiento. Dedupe por `tenant + período + día` (patrón `sla-monitor`).

### B4 · Guarda de cierre coherente

En el close (`periods/[id]/close`): si `findDocumentsWithoutEntry` del período
devuelve > 0 → **409** con mensaje accionable y `count`. Override explícito con
`{ force: true }` (checkbox *"Cerrar de todos modos"*), auditado como
`accounting_period_closed_with_orphans`.

## Nota histórica — los 6 huérfanos de julio 2026

En la semana del 2026-07 quedaron ~6 facturas emitidas sin asiento porque el
auto-asiento del issuer fallaba silenciosamente (solo `console.error`). Tras este
cambio: (1) esos DTEs se contabilizan con un clic desde *"Generar asientos
faltantes"* (o factura por factura); (2) cualquier fallo futuro del auto-asiento
notifica al equipo contable; (3) el período no puede cerrarse dejándolos cojos
sin decisión explícita.

## Matriz de QA

| Escenario | Resultado esperado |
| --- | --- |
| Emitir factura con período inexistente | El período nace `OPEN` + asiento creado + `logAudit(accounting_period_auto_opened)` + notify informativo |
| Emitir con período `CLOSED` | Error *"está cerrado"* intacto (no se auto-abre) |
| Documento mal fechado a mes pasado con período posterior cerrado | Error claro de sanidad, no se auto-abre |
| Botón "Generar asientos faltantes" | Repara los huérfanos reales de julio; idempotente (los que ya tienen asiento se saltan) |
| Cron día 1 / día 5 | Notifica solo si el mes anterior sigue `OPEN`; dedupe por tenant+período+día |
| Cerrar con documentos sin asiento | Bloquea con 409 accionable |
| Cerrar con `force: true` | Cierra y audita `accounting_period_closed_with_orphans` |
