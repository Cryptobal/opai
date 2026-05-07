# Finance Reports V1 — Block Notes

Notes from the overnight execution of `feat/finance-reports-v1` on branch `claude/finance-reports-v1-ZqMnM`.

## Pre-existing TS errors (NOT in scope)

- `src/modules/finance/billing/cobranzas-aggregator.ts(321,23)` — `a.currentBalance` possibly null. Pre-existing on `main`. Not touched.

## Audit findings (B0)

- `getAccountLedger(tenantId, accountId, dateFrom?, dateTo?)` exists in `src/modules/finance/accounting/ledger.service.ts`, but its signature does NOT accept `costCenterId`. We add a new service `getExtendedLedger` in `src/modules/finance/reports/ledger-extended.service.ts` (block 5) with cost-center filter — does NOT replace the legacy.
- `sales-aggregator.ts` exports `POSITIVE_TYPES`, `ND_TYPES`, `NC_TYPES`, `DEFAULT_INCLUDED_STATUS`, `buildMonthRange`, `prevRangeOf`, `formatMonthLabel`. Reusable constants (we re-imported in matrix services).
- `permissions.ts` uses two parallel arrays: `CAPABILITY_KEYS` (string list, drives `CapabilityKey`) and `CAPABILITY_META` (objects with key/label/description/moduleKey). Both must be updated when adding capabilities.
- Subnav already lists "Informes" → `/finanzas/reportes` with `subKey: "reportes"`. Untouched.
- `FinanceJournalEntry.status` enum is `FinanceJournalStatus` (DRAFT/POSTED/REVERSED), not `FinanceJournalEntryStatus`.
- `FinancePaymentStatus` enum: UNPAID, PARTIAL, PAID, OVERDUE, WRITTEN_OFF, CEDED. AR/AP filters use UNPAID/PARTIAL/OVERDUE.
- `FinanceReceptionStatus` enum: PENDING_REVIEW, ACCEPTED, CLAIMED, PARTIAL_CLAIM, EXPIRED. There is no `RECEIVED_OK` value — purchases-matrix uses `[ACCEPTED]` + null.
- `CrmAccount.status` text: prospect, client_active, client_inactive — matches plan.

## Future optimizations / phase 2

- Dashboard `getDashboardKpis` currently calls `getSalesMatrix` + `getIncomeStatement` 12 times sequentially to build the 12-month trend. This is an N+1 in service-call terms. Consider materialized monthly view or in-memory aggregate over a single Prisma scan.
- CSV export is intentionally deferred (mentioned in scope).
- `ProfitabilityRow.invoicesCount` is currently a proxy (months-with-value > 0). For accurate count, query `prisma.financeDte.groupBy({ by: ['crmAccountId'] })` per period.
