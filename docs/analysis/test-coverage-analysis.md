# Test Coverage Analysis — OPAI Suite

**Date:** 2026-04-14
**Scope:** Full codebase (`/home/user/opai`)

---

## 1. Current State

| Metric | Value |
|---|---|
| Test framework | Vitest 3.2.4 |
| Test files | 14 (10 existing + 4 new rondas tests) |
| Test cases | ~160 total |
| Source files | ~500K+ LOC across 148 pages, 493 API endpoints, 430 components |
| API endpoints | 493 (0 tested via integration tests) |
| Prisma models | 195 (0 model-level tests) |
| Cron jobs | 18+ (0 tested) |
| CI/CD test pipeline | None configured |
| Coverage reporting | Not configured |

### Existing test files

| File | Module | Tests |
|---|---|---|
| `src/lib/__tests__/crm-deal-active-quotation.test.ts` | CRM | 5 |
| `src/lib/__tests__/email-lead-extractor.test.ts` | CRM | 17 |
| `src/lib/__tests__/tickets-email.test.ts` | Ops/Tickets | 6 |
| `src/lib/__tests__/tickets-inbound-parser.test.ts` | Ops/Tickets | 8 |
| `src/lib/__tests__/doc-verificacion-helpers.test.ts` | Docs | 11 |
| `src/lib/__tests__/inventory-product-catalog.test.ts` | Inventory | 3 |
| `src/lib/ai/__tests__/help-chat-improvements.test.ts` | AI/Chat | 35+ |
| `src/components/ops/__tests__/MarcacionModificadaBadge.test.tsx` | UI/Ops | 4 |
| `src/app/api/docs/documents/__tests__/signed-pdf-pagebreak.test.ts` | Docs/PDF | 3 |
| `src/modules/finance/accounting/__tests__/journal-validator.test.ts` | Finance | 13 |

### New tests added (this PR)

| File | Module | Tests |
|---|---|---|
| `src/lib/rondas/__tests__/geo-utils.test.ts` | Rondas/Geo | 26 |
| `src/lib/rondas/__tests__/anomaly-detection.test.ts` | Rondas/Anomalies | 15 |
| `src/lib/rondas/__tests__/schedule-engine.test.ts` | Rondas/Scheduling | 10 |
| `src/lib/rondas/__tests__/trust-score-v2.test.ts` | Rondas/Trust | 8 |

---

## 2. Critical Gaps (Priority 1 — High Business Impact)

### 2.1 Rondas API Endpoints — Zero integration tests

The rounds module is the core product feature and has **zero API-level tests**. A real production bug was found today: the `completar` endpoint incorrectly blocked guards from completing rounds due to a `guardiaId` mismatch check that was too strict.

**Endpoints to test:**

| Endpoint | Risk | Why |
|---|---|---|
| `POST /api/portal/rondas/completar` | **Critical** | Round completion — bug found here. Guard mismatch blocked valid completions |
| `POST /api/portal/rondas/marcar` | **Critical** | Checkpoint marking — core UX flow, uses shared `marcar-checkpoint-service` |
| `POST /api/portal/rondas/iniciar` | High | Round start — race conditions possible when two guards start the same round |
| `POST /api/portal/rondas/iniciar-libre` | High | Ad-hoc rounds — complex blocking logic (programacion windows, en_curso checks) |
| `POST /api/portal/rondas/auth` | High | Guard auth — RUT matching with multiple formats, non-deterministic ordering |
| `GET /api/portal/rondas/mis-rondas` | Medium | Round listing — complex query with timezone calculations |
| `GET /api/cron/rondas/generar` | Medium | Cron round generation — scheduling deduplication |

**Suggested test approach:** Mock Prisma with `vi.mock("@/lib/prisma")` and test the API handlers in isolation. Focus on:
- Guard assignment and validation flows
- Edge cases: null guardiaId, mismatched guards, concurrent access
- Round state transitions: pendiente → en_curso → completada/incompleta

### 2.2 Authentication & Session Management

The portal auth endpoint (`/api/portal/rondas/auth`) resolves guards through a multi-step process (RUT normalization → persona lookup → guardia resolution) that is bug-prone:

- **RUT format matching**: 4 different formats are tried (`cleanRut`, `rutWithDash`, `rutWithDots`, `raw`). No tests validate these.
- **Guard selection**: When multiple personas match, the sort uses `status` and `hasPin` — the ordering is non-deterministic for equal-priority records. This could cause different `guardiaId` to be returned across logins.
- **No tenant scoping**: The persona query doesn't filter by `tenantId`, so cross-tenant RUT collisions are possible.

**Impact:** Could cause session/guardiaId mismatches — exactly the type of bug seen in production.

### 2.3 Chat Module — Zero tests

23 components + real-time Pusher integration + 7 API endpoints with no test coverage. High risk for:
- Message ordering bugs
- Reaction/mention edge cases
- Channel access control

### 2.4 Panic Button — Zero tests

The `PanicAlertProvider` is a safety-critical feature (guard emergency). The Pusher event handling, audio alarm, and cross-tab coordination have no tests.

---

## 3. Important Gaps (Priority 2 — Moderate Business Impact)

### 3.1 Cron Jobs (18+ endpoints, 0 tests)

| Cron | Risk |
|---|---|
| `rondas/generar` | Generates all scheduled rounds — dedup logic untested |
| `consolidar-marcaciones` | Consolidates attendance records — payroll-affecting |
| `sla-monitor` | SLA breach detection — client-facing alerts |
| `contract-alerts` | Contract expiration notifications |
| `gamification-calculate` | Guard points/badges — engagement feature |

### 3.2 Financial Calculations

Only `journal-validator` is tested. Missing:
- Payroll salary simulations (`src/modules/payroll/`)
- CPQ cost calculations (`src/modules/cpq/`)
- UF (Chilean inflation index) conversions (`src/lib/uf-utils.ts`)
- Expense report calculations (`src/modules/finance/`)

### 3.3 Schedule Engine — Edge Cases

The `buildScheduleSlots` function is now tested for basic cases, but needs additional coverage:
- **DST transitions**: Chile observes DST (April and September). Slots crossing the DST boundary could produce duplicates or gaps.
- **Edge day-of-week**: Overnight shifts that span midnight change the day-of-week in Chile time. The `getChileDayOfWeek` function needs validation.
- **Multi-day ranges**: Generating slots for a full week with varied `diasSemana`.

### 3.4 Document Generation & PDF

- Tiptap → HTML conversion (1 test exists) but no end-to-end PDF rendering tests
- Contract template token replacement untested
- Digital signature flow untested

---

## 4. Structural Gaps (Priority 3 — Long-term Quality)

### 4.1 No Component Tests for Core UI

Only 1 component test exists (`MarcacionModificadaBadge`). Critical components without tests:

| Component | Why |
|---|---|
| `RondaActiva.tsx` | Core patrol UI — 1100+ lines, complex state management |
| `RondasMonitoreoClient.tsx` | Real-time monitoring dashboard |
| `ChatConversation.tsx` | Message rendering and threading |
| `PanicFullscreenModal.tsx` | Emergency alert UI |

### 4.2 No End-to-End (E2E) Tests

No Playwright or Cypress configuration exists. E2E tests are essential for:
- Guard login → round start → checkpoint marking → round completion flow
- Chat message sending and receiving
- Panic button activation and resolution
- Multi-tab/multi-device scenarios

### 4.3 No CI/CD Pipeline

Tests are not integrated into any CI/CD pipeline (no GitHub Actions, no Vercel build checks). Tests could be failing silently.

### 4.4 No Test Coverage Reporting

No coverage configuration means there's no visibility into what percentage of code is actually exercised by tests.

---

## 5. Recommended Action Plan

### Phase 1 — Immediate (This Sprint)

1. **Add vitest coverage configuration** to `vitest.config.ts`:
   ```ts
   coverage: {
     provider: 'v8',
     include: ['src/lib/**', 'src/modules/**'],
     exclude: ['**/__tests__/**', '**/node_modules/**'],
   }
   ```

2. **Write integration tests for rondas API endpoints** — Focus on the `completar`, `marcar`, `iniciar`, and `auth` flows using mocked Prisma.

3. **Add a GitHub Actions workflow** to run tests on every PR.

### Phase 2 — Next 2 Sprints

4. **Test auth/session flows** — Validate RUT normalization, guard resolution, and session persistence edge cases.

5. **Test cron jobs** — Especially `rondas/generar` (round generation dedup) and `consolidar-marcaciones` (payroll-affecting).

6. **Test financial calculations** — Payroll, CPQ, and UF conversions.

### Phase 3 — Next Quarter

7. **Add E2E tests with Playwright** — Start with the guard round flow (login → patrol → complete) and panic button.

8. **Add component tests for critical UI** — `RondaActiva`, `ChatConversation`, `PanicFullscreenModal`.

9. **Set up coverage thresholds** — Enforce minimum coverage (e.g., 60% for `src/lib`, 40% overall) in CI.

---

## 6. Bug Found During Analysis

### "guardiaId no coincide con la ejecución" — Completar Endpoint

**File:** `src/app/api/portal/rondas/completar/route.ts:73-78`

**Root cause:** The `completar` endpoint blocked round completion with a strict `guardiaId` check. But `mis-rondas` shows ALL rounds at an installation to ALL guards (by design: "any authenticated guard can take any round"). This inconsistency meant a guard could view and mark checkpoints on a round but get blocked when completing it.

**Fix:** Changed the strict 403 block to a warning log. The effective guardiaId is still resolved correctly from the execution record.

**This bug perfectly illustrates why the rondas module needs comprehensive tests.** The mismatch between the listing policy (permissive) and the completion policy (strict) was not caught because neither endpoint had any tests.
