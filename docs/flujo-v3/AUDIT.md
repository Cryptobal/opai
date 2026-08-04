# Flujo de Caja v3 "Modo Planilla" — Auditoría (B0)

Fecha: 2026-07-21 · Branch: `claude/flujo-caja-v3-planilla-gy3kmn` (desde `main` @ `708b781`)

Objetivo: mapear las fuentes de verdad existentes que los derivadores v3 van a
consumir en LECTURA. Principio rector: **derivar, no materializar** — solo el
Plan del usuario se persiste (`FinanceFlowRow` + `FinanceFlowPlanCell`).

---

## 1. Fuentes de verdad (se conservan intactas)

### 1.1 DTEs — `FinanceDte` (`prisma/schema.prisma:6685`)

Campos relevantes para los derivadores:

- `direction` (`ISSUED`/`RECEIVED`), `dteType` (33/34/56/61...), `folio`, `date`, `dueDate?`
- `recurringTemplateId?` + `billingPeriod?` (`YYYY-MM`): vínculo cuota↔programación.
  **Base de la dedupe period-aware** del derivador de ingresos (un DTE emitido
  "ocupa" el período de su template; ambos NULL = factura extra).
- `crmAccountId?` / `installationId?`: centro de costo → match con filas
  `ACCOUNT_INSTALLATION`.
- `paymentStatus` (`UNPAID|PARTIAL|PAID|OVERDUE|WRITTEN_OFF|CEDED`),
  `amountPaid`, `amountPending`, `reconciledAt?`.
  `CEDED` = cedida a factoring → el cobro no es nuestro, se EXCLUYE del comprometido.
- `voidedByCreditNoteId?` / `creditedNetAmount`: factura anulada por NC CodRef=1
  o acreditada parcialmente por NC CodRef=3 → **sale del flujo** (regla de
  producto ya documentada en el schema). Por eso las NC 61 NO se restan aparte:
  su efecto ya está aplicado vía estos campos (restarlas de nuevo duplicaría).
- `siiStatus`: emitidos colectables = `ACCEPTED|PENDING|SENT`; `DRAFT` = borrador
  (no emitido); `ANNULLED|REJECTED` fuera.
- `receptionStatus` (recibidos): `ACCEPTED` = aceptado. NULL en históricos
  importados → se tratan como pagables (conservador).
- `FinanceDteLine.accountId?` → cuenta contable por línea (para categorizar
  egresos vía `FinanceCashflowCategoryAccount`).

### 1.2 Banco — `FinanceBankTransaction` + `FinanceBankTransactionLink` (`schema:7506/7452`)

- Tx: `transactionDate`, `amount` (signado: + abono / − cargo), `hiddenAt?`
  (soft-delete, excluir), `excludedReason?` (interna/comisión → excluir del
  saldo real), `reconciliationStatus`.
- Link: `targetType` (`DTE_ISSUED|DTE_RECEIVED|PAYROLL_LIQUIDACION|PAYROLL_ANTICIPO|TE_*|EXPENSE|INCOME|FACTORING_OPERATION`),
  `targetId?`, `amount`, `accountPlanId?`. **Un movimiento con ≥1 link = conciliado.**
- Resolución de categoría de un link: `category-resolver.ts` →
  `resolveCategoryForLink(ctx)` (pura) con atajos payroll
  (EGR_SUELDO/EGR_QUINCENA/EGR_TURNO_EXTRA) + mapa cuenta→categoría
  (`bulkResolveCategoriesFromAccounts` de `categoryAccount.service.ts`).

### 1.3 Programaciones — `FinanceDteRecurringTemplate` (`schema:7061`) ✅ pre-verificado

`src/modules/finance/billing/dte-recurring.service.ts`:

- `computeNextRunAt(template, fromDate?)` (línea 99, **pura, exportada**):
  próxima corrida según frequency/dayOfMonth/dayOfWeek/monthOfYear.
  **Retorna `null` si supera `endDate`** (línea 154). Confirmado.
- `computeRecurringIssueYmd(template, anchor)` (línea 182, **pura, exportada**):
  fecha de EMISIÓN de la cuota (respeta `facturaTiming=DIA_ESPECIFICO`,
  `facturaDay`, `facturaMesRelativo`).
- `runTemplate` salta con `status="skipped_endDate"` si `endDate < hoy`
  (línea 476) y desactiva la plantilla cuando `computeNextRunAt` → null
  (líneas ~700-713). Confirmado.
- Template tiene `endDate`, `crmAccountId`, `installationId`, `isActive`,
  `lines` (JSON con qty/unitPrice/unitPriceUf/discountPct/isExempt),
  `currency`, `nextRunAt`, `lastRunAt`. Confirmado.
- **Falta** (lo hace v3): proyección limitada por `endDate` en el derivador (B3)
  y exponer/aplazar `endDate` desde la planilla (B6/B7). El update de endDate se
  hace vía servicio nuevo delgado que valida tenant (no existe un
  `updateTemplate` genérico reutilizable en el service actual — el CRUD vive en
  la API route de billing; el PATCH v3 escribe solo `endDate` con guards).

### 1.4 Búsqueda de DTEs en el flujo — `dte-flow-search.service.ts`

`searchDtesForFlow(tenantId, query, limit)`: busca EMITIDOS por folio/nombre,
excluye 56/61, anuladas y `voidedByCreditNoteId`. Reutilizable tal cual para el
buscador de la planilla (post-MVP). Los overrides de fecha
(`FinanceCashflowDteDateOverride`) son parte del módulo viejo y NO se leen en v3.

### 1.5 Saldo inicial — `opening-balance.service.ts` + `real-balance.helper.ts`

- `resolveOpeningBalance(tenantId, asOfDate?)` → `{ totalClp, currentTotalClp, perAccount }`.
  El matrix v3 usa `currentTotalClp` (mismo criterio que la proyección vieja,
  `projection.service.ts` ~L2109: "saldo banco hoy").
- `getRealBankBalanceAt(...)` (pura) para saldos por fecha si hiciera falta.

### 1.6 Payroll (hallazgo clave)

Dos subsistemas paralelos:

- **Liquidaciones reales** (`PayrollPeriod`/`PayrollLiquidacion`/`PayrollAnticipoProcess`,
  schema payroll): montos reales por guardia (`netSalary`, `grossSalary`,
  `employerCost`). El flujo viejo **NO** las lee.
- **Proyección desde dotación** — lo que consume el cashflow hoy:
  `src/modules/finance/cashflow/generators/payroll-sync.ts` →
  `computeMonthlyPayrollForInstallation(tenantId, installationId)` (interna,
  **se exporta en B4**) = `{ liquido, previRed, total, name }` desde
  `OpsPuestoOperativo` activos × `PayrollSalaryStructure.netSalaryEstimate` +
  `computeEmployerCost()` del motor payroll. `previRed = employerCost − liquido`.
- **Quincena/anticipos** — `generators/quincena-sync.ts`: modo `FICHA`
  (Σ `OpsGuardia.montoAnticipo` de activos con `recibeAnticipo`) o
  `PCT_LIQUIDO` (% × líquidos). Lógica interna (**se exporta en B4** como
  cómputo puro del monto).
- Días de pago en `FinanceCashflowConfig` (`schema:8023`): `payrollPayDay`
  (default 5), `quincenaPayDay` (default 15), `previRedPayDay` (default 10 —
  el prompt decía "F30 vence 13"; **F30 no existe en el repo**, lo real es
  Previred con día configurable; se usa `previRedPayDay`).

### 1.7 F29 / Libro IVA — existe cálculo canónico ✅

`src/modules/finance/billing/f29.service.ts` → `computeF29Period(tenantId, "YYYY-MM")`
(línea 228): débito − crédito − remanente UTM + PPM = `f29.totalAPagar`. Es la
misma fuente de la página Libro IVA y del generador viejo
(`generators/iva-f29-sync.ts`). El día de pago es `config.ivaPayDay`
(default 12; el prompt decía "día 20" — se respeta la config real del repo).
v3 deriva comprometido F29 SOLO para períodos ya cerrados (mes vencido, DTEs
reales); los futuros son Plan del usuario, no comprometido.

### 1.8 Semanas ISO — helpers existentes

- **Cliente/puro (UTC)**: `src/components/finance/cashflow/v2/grid/week-keys.ts` —
  `startOfIsoWeekUTC`, `addWeeksUTC`, `isoWeekNumber`, `weekKey` (`YYYY-Www`),
  `parseWeekKey`. Archivo puro (sin "use client", sin prisma) → **flow-v3/weeks.ts
  lo importa y extiende** (rango de horizonte, key `YYYY-MM-DD` de lunes,
  agregación mensual). No se duplica aritmética ISO.
- Server (módulo viejo): `recurrence-engine.ts` `bucketKeyFor`/`bucketBoundsFor`
  (date-fns, hora local normalizada) — no se usa en v3 para no arrastrar la
  dependencia del engine viejo.

### 1.9 Auth/guards de API finance

Patrón vigente (`src/app/api/finance/cashflow/projection/route.ts`):
`requireAuth()` → `resolveApiPerms(ctx)` → `hasCapability(perms, "cashflow_view")`
(lectura) / `"cashflow_manage"` (mutación). `tenantId` SIEMPRE de `ctx`, jamás
del body. v3 replica esto en `/api/finance/flow-v3/*`.

### 1.10 Navegación y flags

- Registry único: `src/lib/nav/registry.ts`. Entrada actual:
  `banca-flujo-caja` → `/finanzas/flujo-caja` (N3 de `finance-banca`,
  capability `cashflow_view`, líneas ~389-397). Breadcrumbs auto-derivados
  (`AutoBreadcrumbs`). Lint: `npm run lint:nav` (ModuleSubNav va en layout.tsx).
- Flags por tenant: tabla `TenantModule` (`tenantId`+`module`+`enabled`+
  `config Json?`). Helper `src/lib/tenant-modules.ts` (cache 5 min).
  **B9 usa `TenantModule(module="finanzas").config.cashflowPlanillaV3: true`**
  (JSONB aditivo, cero migración).

### 1.11 Design System v3

Tokens: `text-ds-text-1..4`, `bg-ds-surface-0..4`, `border-ds-border-*`,
`bg/text/border-status-{ok|warn|danger|info}-{soft|fg|border}`, `text-primary`.
Checker `scripts/check-design-system.mjs`: prohíbe colores Tailwind crudos,
`text-[10px]` siempre, y `text-[11px]` salvo patrón eyebrow
(`font-mono` + `uppercase` + `tracking-*`) — la grilla numérica v3 usa
`font-mono uppercase tracking-tight tabular-nums text-[11px]` (dígitos: el
uppercase es no-op visual). Estados con `Tag`/tokens status.

### 1.12 Mockup

`mockup-flujo-caja-modo-planilla-v2.html` **no existe en el repo** (verificado
glob + historia git). B7 implementa las specs numéricas del prompt v3.1
(fila 22px, mono 11px, col 1 200px, semanas 84-88px, ≥22 filas en 1440×900).

---

## 2. Qué reutiliza cada derivador

### B3 `derive-committed-income.ts` (pura + loader)

| Fuente | Función/modelo reutilizado |
|---|---|
| DTEs emitidos no pagados | `FinanceDte` (ISSUED, 33/34, `siiStatus IN (ACCEPTED,PENDING,SENT)`, `voidedByCreditNoteId=null`, `creditedNetAmount=0`, `paymentStatus IN (UNPAID,PARTIAL,OVERDUE)`) |
| Fecha estimada de cobro | `dueDate` ?? `date + 30d` (**ni CrmAccount ni el template tienen término de pago en el schema — default 30 días documentado, constante única `DEFAULT_COLLECTION_LAG_DAYS`**) |
| Proyección de programaciones | `computeNextRunAt` + `computeRecurringIssueYmd` (dte-recurring.service, sin tocar) — iteradas hasta `endDate` inclusive o fin de horizonte |
| Monto proyectado | Σ líneas del template (qty×price×(1−disc)), UF→CLP con UF vigente (`@/lib/uf`), +19% si no exenta y dteType≠34 (bruto = caja) |
| Dedupe cuota↔DTE | `FinanceDte.recurringTemplateId` + `billingPeriod` (incluye DRAFTs: el borrador ocupa el período y aparece como item `scheduled` con su monto real) |
| NC 61 | ya aplicadas vía `voidedByCreditNoteId`/`creditedNetAmount` (no se restan aparte) |

### B4 `derive-committed-expense.ts` (pura + loader)

| Fuente | Función/modelo reutilizado |
|---|---|
| Payroll líquido + Previred | `computeMonthlyPayrollForInstallation` (payroll-sync.ts, se exporta) agregada por tenant; días `payrollPayDay`/`previRedPayDay` de `FinanceCashflowConfig` |
| Quincena | cómputo de quincena-sync.ts (se exporta el cálculo del monto); día `quincenaPayDay` |
| F29 | `computeF29Period` (f29.service.ts) para meses vencidos; semana del `ivaPayDay` del mes siguiente |
| DTE recibidos por pagar | `FinanceDte` RECEIVED aceptados/null sin pagar → semana de `dueDate` ?? `date+paymentTermDays` del `FinanceSupplier` (default 30) |
| Categoría del recibido | `FinanceDteLine.accountId` → `bulkResolveCategoriesFromAccounts` → fila `CATEGORY`; sin match → fila "Otros gastos" |

### B5 `derive-real.ts` (pura + loader)

| Fuente | Función/modelo reutilizado |
|---|---|
| Movimientos conciliados | `FinanceBankTransaction` (`hiddenAt=null`, `excludedReason=null`) con `links` no vacíos, semana de `transactionDate` |
| Abono→fila ingreso | link `DTE_ISSUED` → DTE → `crmAccountId`/`installationId` → FlowRow |
| Cargo→fila egreso | `resolveCategoryForLink` (category-resolver.ts) + atajos payroll → FlowRow CATEGORY/canónica |
| Sin match | fila "Otros" (ingreso/gasto según signo) |

---

## 3. Decisiones de adaptación (prompt vs código real)

1. **`diasCobroDesdeFactura` "del template" no existe** — vive en
   `FinanceCashflowItem` (módulo viejo, los espejos RECURRING_DTE lo escriben
   siempre 0). v3 usa `dueDate ?? +30d` (emitidos) / `emisión+30d` (programados).
   Equivalente en intención (semana de cobro esperada); constante única para
   hacerla configurable después.
2. **F30 no existe** → Previred con `previRedPayDay` (default 10).
3. **"Día 20" del F29** → `ivaPayDay` de la config (default 12).
4. **NC 61 no se restan como item aparte** → su efecto ya está en
   `voidedByCreditNoteId`/`creditedNetAmount` (restarlas de nuevo = doble conteo).
   Facturas `CEDED` (factoring) se excluyen del comprometido.
5. **Flag**: no hay framework de "feature flags" genérico; se usa
   `TenantModule.config` JSONB (mecanismo existente, aditivo).
6. **Endpoint viejo se llama `projection`**, no "matrix" — v3 usa su propio
   `/api/finance/flow-v3/matrix` sin tocar el viejo.

Ninguna discrepancia arquitectónica que amerite STOP: todas las fuentes
existen y tienen forma equivalente a la asumida por el prompt.

---

## Cartola-first (v6) — modelo de capas

Fecha: 2026-08-04 · Branch: `cursor/flujo-caja-cartola-first-e1f1`

### Qué alimenta cada capa

| Capa | Fuente | Notas |
|---|---|---|
| **REAL** | Movimientos bancarios (`FinanceBankTransaction` + links) | Única verdad del pasado/presente. Invariante: suma real semana = suma cartola visible. |
| **PROYECTADA (comprometido)** | Ingresos: DTEs emitidos + borradores + templates. Egresos: hitos payroll/F29/TE + plan/GAV recurrente. | **No** incluye DTEs recibidos salvo `projectReceivedDtesAsExpense=true` (opt-in). |
| **PLAN** | `FinanceFlowPlanCell` + recurrencias GAV | Editable; semanas selladas bloqueadas. |

### Filas bandeja

- **Otros ingresos**: solo abonos bancarios sin link (o remanente). Flag `bandejaIncomeBankOnly` (default true).
- **Otros egresos**: solo cargos bancarios sin link (o remanente).
- Las facturas emitidas sin fila **no** van a la bandeja: viven en `unroutedIncome` / panel "Facturas sin fila".
- Las facturas de compra **no proyectan egreso** por defecto. Opt-in puntual: `POST .../pin-to-flow` (celda de plan + nota con folio). Crédito IVA F29 intacto.

### Clasificación RUT → fila

Al confirmar clasificación de un movimiento a una fila se crea/actualiza
`FinanceAutoMatchRule` (`BENEFICIARY_RUT RUT_MATCHES` → `{kind:"FLOW_ROW"}`)
y `run-rules-only` re-aplica al histórico `UNMATCHED` del mismo RUT.
