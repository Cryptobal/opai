# DTE: estado de pago vs conciliación bancaria

> Investigación 2026-08 — casos Berlintexx F#1748 / SCRB F#1732 vs depósitos
> conciliados a F#1774 / F#1772.

## Resumen ejecutivo

**No hay bug de sync** entre links bancarios y KPI "Sin pagar" cuando la
conciliación apunta al **folio correcto**. El sistema actualiza
`paymentStatus` del DTE vinculado en la misma transacción que crea el
`FinanceBankTransactionLink` + `FinancePaymentAllocation`.

Si Bancos muestra el depósito linkeado a **F#1774** pero Por cobrar sigue
mostrando **F#1748** como "Sin pagar", la causa más probable es:

1. **Folios distintos** — el pago se registró contra otra factura (error de
   selección en conciliación, o re-emisión sin NC de la factura anterior).
2. **Conciliación solo contable (INCOME/EXPENSE)** — el movimiento figura
   MATCHED en Bancos pero no creó allocation contra ningún DTE.

## 1. ¿Cómo se calcula el estado de pago?

| Campo / concepto | Rol |
|------------------|-----|
| `FinanceDte.paymentStatus` | Enum persistido: `UNPAID`, `PARTIAL`, `PAID`, `OVERDUE`, `CEDED`, `WRITTEN_OFF`. Es lo que lee la UI "Sin pagar" / KPIs Por cobrar. |
| `FinanceDte.amountPaid` / `amountPending` | Montos denormalizados; `amountPending` alimenta aging y top deudores. |
| `FinancePaymentAllocation` | **Fuente de verdad del monto cobrado** vía banco o recibo formal. Σ allocations → deriva status. |
| `FinanceDte.reconciledAt` | Timestamp del movimiento bancario matcheado. **Independiente** de `paymentStatus`. |
| `FinanceBankTransactionLink` (`DTE_ISSUED` / `DTE_RECEIVED`) | Vínculo UI banco↔DTE; dispara creación de PaymentRecord + allocations en conciliación manual/auto. |
| `bulk-mark-paid` | Marca `PAID` **sin** allocations (pago manual / import legacy). Preserva estado en recompute hasta que llegue cartola. |
| Factoring / cesión | `paymentStatus=CEDED` o `FinanceFactoringOperation`; cobro lo gestiona el factor, no el KPI Por cobrar. |
| Write-off automático | Si el remanente ≤ umbral tenant, cierra como `PAID` con asiento de ajuste. |

Derivación (código): `deriveDtePaymentStatusFromAllocations` en
`src/modules/finance/billing/dte-payment-status.ts`, aplicada en
`recomputeDtePaymentAggregate` (`bank-tx-link.service.ts`).

KPIs Por cobrar (`cobranzas-aggregator.ts`) filtran
`paymentStatus IN (UNPAID, PARTIAL, OVERDUE)` y suman `amountPending` —
**no miran** `reconciledAt` ni links directamente.

## 2. ¿Conciliar un depósito actualiza el DTE?

**Sí**, cuando el link es `DTE_ISSUED` (cobro) o `DTE_RECEIVED` (pago):

1. `setTransactionLinks` / `bulkReconcileToDte(s)` / `tryAutoMatchBankTransactionToDte`
2. Crea `FinancePaymentRecord` + `FinancePaymentAllocation`(s)
3. Llama `recomputeDtePaymentAggregate` → actualiza `paymentStatus`, `amountPaid`, `amountPending`
4. Setea `reconciledAt` en el DTE linkeado

**No** hay paso aparte obligatorio (receipt/settlement) para marcar Pagada en
UI, salvo:

- `bulk-mark-paid` (admin, sin banco)
- Write-off manual/automático
- Cesión a factoring

**Excepción:** links `INCOME` / `EXPENSE` (reglas auto-match, categorización
manual) concilian el **movimiento bancario** pero **no tocan ningún DTE**.

## 3. ¿Bug link existe pero UI dice "Sin pagar"?

Escenarios reales en código:

| Escenario | ¿Bug? |
|-----------|-------|
| Link a **otro folio** (1774 vs 1748) | No — comportamiento correcto |
| Link `INCOME` sin `targetId` | No — by design; banco conciliado, DTE sigue UNPAID |
| `bulk-mark-paid` sin cartola | No — UI muestra "Pagado" + badge "Sin conciliar" (`DtePaymentTag`) |
| PAID manual + recompute con allocations vacías | Protegido por `isManualPaidWithoutReconciliation` |
| Filtros KPI solo `paymentStatus` | No leen links; si status no se actualizó, el DTE sigue en Por cobrar |

Para diagnosticar un folio concreto (agente/MCP):

- `get_dte_detail` incluye `reconciledAt`, allocations y links bancarios
- Verificar en Bancos el drawer del movimiento: ¿target folio 1748 o 1774?

## 4. Conciliado en Bancos ≠ Pagado en DTE (by design)

| Concepto | Significado |
|----------|-------------|
| **Conciliado (banco)** | `FinanceBankTransaction.reconciliationStatus = MATCHED` — el movimiento tiene links que cuadran el monto (puede ser INCOME genérico). |
| **Conciliado (DTE)** | `reconciledAt != null` + link `DTE_*` — hay trazabilidad banco→factura. |
| **Pagado (DTE)** | `paymentStatus = PAID` (o PARTIAL) — saldo de cobranza cerrado o parcial. |

Flujos válidos desalineados:

- Pagado manual (`bulk-mark-paid`) → PAID, `reconciledAt=null` → badge "Sin conciliar"
- Regla auto-match INCOME → banco MATCHED, facturas siguen UNPAID
- Pago contra folio B mientras folio A (mismo cliente/período) queda abierto

### Recomendaciones UX (mínimas)

1. **Operación:** al conciliar, confirmar folio + monto pendiente en el resumen
   (ya parcialmente en `BankTxReconcileSheet`).
2. **Re-emisión:** si se emite F#1774 reemplazando F#1748, emitir NC anulante
   (CodRef=1) o parcial sobre 1748 — no hay auto-cierre por `billingPeriod`.
3. **Producto (futuro):** alerta "Este cliente tiene otra factura pagada reciente
   (F#XXXX)" al ver UNPAID — reduce confusiones de folio.

## 5. MCP / API agent tools (finanzas)

| Path | Estado |
|------|--------|
| `src/app/api/mcp/route.ts` + `handler.ts` | MCP JSON-RPC activo; tools de `help-chat-tools-v2.ts` |
| `search_dtes`, `get_dte_detail` | Lectura DTEs (folio, paymentStatus, allocations) |
| `get_finance_summary`, `get_finance_dashboard_kpis` | KPIs agregados |
| `preview_invoice_draft`, `create_invoice_draft`, … | Emisión borradores |
| **Sin tools dedicados** | Conciliación bancaria, links, bulk-reconcile (solo REST `/api/finance/banking/*`) |

REST relevante para agentes futuros:

- `POST /api/finance/banking/transactions/[id]/links` → `setTransactionLinks`
- `POST /api/finance/banking/transactions/bulk-reconcile-dtes`
- `POST /api/finance/billing/issued/bulk-mark-paid`

## Caso Carlos — interpretación

Reporte: F#1748 y F#1732 "están pagadas", pero Bancos tiene depósitos
linkeados a **F#1774** y **F#1772** (folios distintos).

Con el modelo actual, lo esperado es:

- F#1774 / F#1772 → `PAID` + `reconciledAt` seteado
- F#1748 / F#1732 → `UNPAID` (sin allocations a su UUID)

Acciones sugeridas en producción (sin tocar código):

1. Abrir detalle F#1774 / F#1772 → confirmar PAID + recibo COB-* + movimiento
2. Abrir F#1748 / F#1732 → confirmar sin allocations; revisar si debían
   anularse con NC al re-emitir
3. Si el depósito debía ir a 1748: desconciliar movimiento y re-conciliar al
   folio correcto (o transferir allocation vía desconciliar + nueva conciliación)

## Desconciliar desde facturación (`POST .../issued/[id]/unreconcile`)

Inverso centrado-en-DTE de `clearTransactionLinks` (desde Banca). Implementado
en `unreconcileIssuedDte` (`bank-tx-link.service.ts`).

| Paso | Acción |
|------|--------|
| 1 | Borra `FinancePaymentAllocation` del DTE + `FinancePaymentRecord` huérfanos |
| 2 | Elimina `FinanceBankTransactionLink` con `targetType=DTE_ISSUED` → `dteId` |
| 3 | Recomputa `paymentStatus` / montos (salvo `keepPaymentStatus`) vía `recomputeDtePaymentAggregate`, **antes** de limpiar `reconciledAt` (mismo orden que banca) |
| 4 | Limpia `reconciledAt` si ya no queda link DTE_* |
| 5 | Movimientos sin links restantes → `reconciliationStatus=UNMATCHED` + reset cashflow occurrences |

### Modo "mantener pagada" — `keepPaymentStatus: true`

Body opcional en `POST .../unreconcile`. La UI de DTEs emitidos lo envía
(`DtesEmitidosClient`) para honrar el diálogo "la factura sigue marcada como
pagada".

| `keepPaymentStatus` | Resultado tras unreconcile |
|---------------------|----------------------------|
| `false` (default API) | Recompute bank-aligned → `UNPAID`/`OVERDUE` si el cobro era solo cartola |
| `true` (UI facturación) | Conserva `paymentStatus` / montos; limpia links + `reconciledAt` → badge "Sin conciliar" si era PAID |

`mark-unpaid` sigue exigiendo cero allocations (desconciliar primero). Tras el
fix, unreconcile deja el DTE limpio para ese flujo.

### Anti-patrón corregido (bug pre-fix)

Antes: unreconcile borraba allocations pero dejaba links bancarios +
`reconciledAt` → `mark-unpaid` podía dejar `UNPAID` con rastro de conciliación.
Ahora alineado con desconciliar desde Banca.
