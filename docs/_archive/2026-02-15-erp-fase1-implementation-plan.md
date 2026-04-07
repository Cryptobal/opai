# ERP Financiero-Contable Fase 1: Plan de Cuentas + Facturacion

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the accounting foundation (chart of accounts, journal entries, accounting periods) and DTE invoice issuance with automatic journal entry generation.

**Architecture:** Extends the existing `finance` Prisma schema with new models. Services live in `src/modules/finance/accounting/` and `src/modules/finance/billing/`. API routes follow the existing Next.js App Router pattern with `requireAuth()` + Zod validation. A DTE provider adapter pattern abstracts the external invoicing API.

**Tech Stack:** Next.js 15, TypeScript 5.6, Prisma 6.x (PostgreSQL/Neon), Zod, Resend (email), React-PDF (DTE PDF), Cloudflare R2 (storage)

**Design Doc:** `docs/plans/2026-02-15-erp-financiero-contable-design.md`

---

## Key Patterns (Reference for all tasks)

```typescript
// Auth pattern (every API route):
const ctx = await requireAuth();
if (!ctx) return unauthorized();

// Module access check:
const forbidden = await ensureModuleAccess(ctx, "finance");
if (forbidden) return forbidden;

// Zod validation:
const parsed = await parseBody(request, mySchema);
if (parsed.error) return parsed.error;

// Response format:
return NextResponse.json({ success: true, data: result });
return NextResponse.json({ success: false, error: "msg" }, { status: 4xx });

// Prisma model conventions (finance schema):
// - id: @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
// - tenantId: String @map("tenant_id")
// - snake_case table names via @@map("finance_xxx")
// - @@schema("finance")
// - createdAt/updatedAt: @db.Timestamptz(6)
```

---

## Task 1: Prisma Schema — Accounting Core Models

**Files:**
- Modify: `prisma/schema.prisma` (append after existing finance models, ~line 2651)

**Step 1: Add enums and FinanceAccountPlan model**

Add these to the schema file after the existing finance models:

```prisma
// ── ERP: Account Types ──
enum FinanceAccountType {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  COST
  EXPENSE

  @@schema("finance")
}

enum FinanceAccountNature {
  DEBIT
  CREDIT

  @@schema("finance")
}

enum FinancePeriodStatus {
  OPEN
  CLOSED
  LOCKED

  @@schema("finance")
}

enum FinanceJournalStatus {
  DRAFT
  POSTED
  REVERSED

  @@schema("finance")
}

enum FinanceJournalSourceType {
  MANUAL
  INVOICE_ISSUED
  INVOICE_RECEIVED
  PAYMENT
  RECONCILIATION
  FACTORING
  EXPENSE_REPORT
  OPENING
  CLOSING

  @@schema("finance")
}

enum FinanceThirdPartyType {
  CUSTOMER
  SUPPLIER

  @@schema("finance")
}

// ── ERP: Plan de Cuentas ──
model FinanceAccountPlan {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId        String   @map("tenant_id")
  code            String
  name            String
  type            FinanceAccountType
  nature          FinanceAccountNature
  parentId        String?  @map("parent_id") @db.Uuid
  parent          FinanceAccountPlan?  @relation("AccountHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children        FinanceAccountPlan[] @relation("AccountHierarchy")
  level           Int      @default(1)
  isSystem        Boolean  @default(false) @map("is_system")
  isActive        Boolean  @default(true) @map("is_active")
  acceptsEntries  Boolean  @default(true) @map("accepts_entries")
  description     String?
  taxCode         String?  @map("tax_code")

  journalLines    FinanceJournalLine[]
  bankAccounts    FinanceBankAccount[]
  dteLines        FinanceDteLine[]
  supplierPayable FinanceSupplier[]   @relation("SupplierPayableAccount")
  supplierExpense FinanceSupplier[]   @relation("SupplierExpenseAccount")
  cashRegisters   FinanceCashRegister[]

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, code], map: "uq_finance_account_plan_code")
  @@index([tenantId], map: "idx_finance_account_plan_tenant")
  @@index([tenantId, type], map: "idx_finance_account_plan_type")
  @@map("finance_account_plan")
  @@schema("finance")
}
```

**Step 2: Add FinanceAccountingPeriod model**

```prisma
model FinanceAccountingPeriod {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId        String   @map("tenant_id")
  year            Int
  month           Int
  startDate       DateTime @map("start_date") @db.Date
  endDate         DateTime @map("end_date") @db.Date
  status          FinancePeriodStatus @default(OPEN)
  closedBy        String?  @map("closed_by")
  closedAt        DateTime? @map("closed_at") @db.Timestamptz(6)

  journalEntries  FinanceJournalEntry[]

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, year, month], map: "uq_finance_period_tenant_year_month")
  @@index([tenantId], map: "idx_finance_period_tenant")
  @@map("finance_accounting_periods")
  @@schema("finance")
}
```

**Step 3: Add FinanceJournalEntry and FinanceJournalLine models**

```prisma
model FinanceJournalEntry {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId        String   @map("tenant_id")
  number          Int
  date            DateTime @db.Date
  periodId        String   @map("period_id") @db.Uuid
  period          FinanceAccountingPeriod @relation(fields: [periodId], references: [id])
  description     String
  reference       String?
  sourceType      FinanceJournalSourceType @default(MANUAL) @map("source_type")
  sourceId        String?  @map("source_id")
  status          FinanceJournalStatus @default(DRAFT)
  reversedById    String?  @unique @map("reversed_by_id") @db.Uuid
  reversedBy      FinanceJournalEntry? @relation("JournalReversal", fields: [reversedById], references: [id])
  reversalOf      FinanceJournalEntry? @relation("JournalReversal")
  costCenterId    String?  @map("cost_center_id") @db.Uuid
  totalDebit      Decimal  @default(0) @map("total_debit") @db.Decimal(14, 2)
  totalCredit     Decimal  @default(0) @map("total_credit") @db.Decimal(14, 2)
  createdBy       String   @map("created_by")
  postedBy        String?  @map("posted_by")
  postedAt        DateTime? @map("posted_at") @db.Timestamptz(6)

  lines           FinanceJournalLine[]
  dtes            FinanceDte[]
  payments        FinancePaymentRecord[]
  reconcMatches   FinanceReconciliationMatch[]
  factoringOps    FinanceFactoringOperation[] @relation("FactoringCession")
  factoringColls  FinanceFactoringOperation[] @relation("FactoringCollection")

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, number], map: "uq_finance_journal_tenant_number")
  @@index([tenantId, date], map: "idx_finance_journal_tenant_date")
  @@index([tenantId, sourceType, sourceId], map: "idx_finance_journal_source")
  @@map("finance_journal_entries")
  @@schema("finance")
}

model FinanceJournalLine {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  entryId         String   @map("entry_id") @db.Uuid
  entry           FinanceJournalEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  accountId       String   @map("account_id") @db.Uuid
  account         FinanceAccountPlan @relation(fields: [accountId], references: [id])
  description     String?
  debit           Decimal  @default(0) @db.Decimal(14, 2)
  credit          Decimal  @default(0) @db.Decimal(14, 2)
  costCenterId    String?  @map("cost_center_id") @db.Uuid
  thirdPartyId    String?  @map("third_party_id")
  thirdPartyType  FinanceThirdPartyType? @map("third_party_type")

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([entryId], map: "idx_finance_journal_line_entry")
  @@index([accountId], map: "idx_finance_journal_line_account")
  @@map("finance_journal_lines")
  @@schema("finance")
}
```

**Step 4: Add FinanceAuditLog model**

```prisma
model FinanceAuditLog {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId        String   @map("tenant_id")
  userId          String   @map("user_id")
  userName        String   @map("user_name")
  action          String
  entityType      String   @map("entity_type")
  entityId        String   @map("entity_id")
  previousData    Json?    @map("previous_data")
  newData         Json?    @map("new_data")
  ipAddress       String?  @map("ip_address")

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([tenantId, entityType, entityId], map: "idx_finance_audit_entity")
  @@index([tenantId, createdAt], map: "idx_finance_audit_date")
  @@map("finance_audit_log")
  @@schema("finance")
}
```

**Step 5: Generate and apply migration**

Run: `cd /Users/caco/Desktop/Cursor/opai && npx prisma migrate dev --name add_erp_accounting_core`
Expected: Migration created and applied successfully.

Run: `npx prisma generate`
Expected: Prisma Client generated successfully.

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(finance): add accounting core schema — plan de cuentas, periodos, asientos, auditoria"
```

---

## Task 2: Prisma Schema — Billing & DTE Models

**Files:**
- Modify: `prisma/schema.prisma` (append after Task 1 models)

**Step 1: Add billing enums**

```prisma
enum FinanceDteDirection {
  ISSUED
  RECEIVED

  @@schema("finance")
}

enum FinanceCurrency {
  CLP
  USD
  UF

  @@schema("finance")
}

enum FinanceSiiStatus {
  PENDING
  SENT
  ACCEPTED
  REJECTED
  WITH_OBJECTIONS
  ANNULLED

  @@schema("finance")
}

enum FinanceReceptionStatus {
  PENDING_REVIEW
  ACCEPTED
  CLAIMED
  PARTIAL_CLAIM
  EXPIRED

  @@schema("finance")
}

enum FinancePaymentStatus {
  UNPAID
  PARTIAL
  PAID
  OVERDUE
  WRITTEN_OFF

  @@schema("finance")
}
```

**Step 2: Add FinanceSupplier model**

```prisma
model FinanceSupplier {
  id                String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId          String   @map("tenant_id")
  rut               String
  name              String
  tradeName         String?  @map("trade_name")
  address           String?
  commune           String?
  city              String?
  email             String?
  phone             String?
  contactName       String?  @map("contact_name")
  paymentTermDays   Int      @default(30) @map("payment_term_days")
  accountPayableId  String?  @map("account_payable_id") @db.Uuid
  accountPayable    FinanceAccountPlan? @relation("SupplierPayableAccount", fields: [accountPayableId], references: [id])
  accountExpenseId  String?  @map("account_expense_id") @db.Uuid
  accountExpense    FinanceAccountPlan? @relation("SupplierExpenseAccount", fields: [accountExpenseId], references: [id])
  isActive          Boolean  @default(true) @map("is_active")

  dtes              FinanceDte[]
  payments          FinancePaymentRecord[]

  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, rut], map: "uq_finance_supplier_rut")
  @@index([tenantId], map: "idx_finance_supplier_tenant")
  @@map("finance_suppliers")
  @@schema("finance")
}
```

**Step 3: Add FinanceDte model**

```prisma
model FinanceDte {
  id                  String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId            String   @map("tenant_id")
  direction           FinanceDteDirection
  dteType             Int      @map("dte_type")
  folio               Int
  code                String
  date                DateTime @db.Date
  dueDate             DateTime? @map("due_date") @db.Date

  issuerRut           String   @map("issuer_rut")
  issuerName          String   @map("issuer_name")
  receiverRut         String   @map("receiver_rut")
  receiverName        String   @map("receiver_name")
  receiverEmail       String?  @map("receiver_email")

  referenceDteId      String?  @map("reference_dte_id") @db.Uuid
  referenceDte        FinanceDte? @relation("DteReference", fields: [referenceDteId], references: [id])
  referencedBy        FinanceDte[] @relation("DteReference")
  referenceType       Int?     @map("reference_type")
  referenceFolio      Int?     @map("reference_folio")
  referenceReason     String?  @map("reference_reason")

  currency            FinanceCurrency @default(CLP)
  exchangeRate        Decimal? @map("exchange_rate") @db.Decimal(10, 4)
  netAmount           Decimal  @map("net_amount") @db.Decimal(14, 2)
  exemptAmount        Decimal  @default(0) @map("exempt_amount") @db.Decimal(14, 2)
  taxRate             Decimal  @default(19.00) @map("tax_rate") @db.Decimal(5, 2)
  taxAmount           Decimal  @map("tax_amount") @db.Decimal(14, 2)
  totalAmount         Decimal  @map("total_amount") @db.Decimal(14, 2)

  accountId           String?  @map("account_id")
  contactId           String?  @map("contact_id")
  supplierId          String?  @map("supplier_id") @db.Uuid
  supplier            FinanceSupplier? @relation(fields: [supplierId], references: [id])

  siiStatus           FinanceSiiStatus @default(PENDING) @map("sii_status")
  siiTrackId          String?  @map("sii_track_id")
  siiResponse         Json?    @map("sii_response")
  siiAcceptedAt       DateTime? @map("sii_accepted_at") @db.Timestamptz(6)

  receptionStatus     FinanceReceptionStatus? @map("reception_status")
  receptionDeadline   DateTime? @map("reception_deadline") @db.Date
  receptionDecidedAt  DateTime? @map("reception_decided_at") @db.Timestamptz(6)
  receptionDecidedBy  String?  @map("reception_decided_by")
  claimType           Int?     @map("claim_type")

  pdfUrl              String?  @map("pdf_url")
  xmlUrl              String?  @map("xml_url")
  cedible             Boolean  @default(false)

  journalEntryId      String?  @map("journal_entry_id") @db.Uuid
  journalEntry        FinanceJournalEntry? @relation(fields: [journalEntryId], references: [id])
  paymentStatus       FinancePaymentStatus @default(UNPAID) @map("payment_status")
  amountPaid          Decimal  @default(0) @map("amount_paid") @db.Decimal(14, 2)
  amountPending       Decimal  @default(0) @map("amount_pending") @db.Decimal(14, 2)

  notes               String?
  createdBy           String   @map("created_by")

  lines               FinanceDteLine[]
  paymentAllocations  FinancePaymentAllocation[]
  factoringOps        FinanceFactoringOperation[]

  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, direction, dteType, folio], map: "uq_finance_dte_folio")
  @@index([tenantId, direction, paymentStatus], map: "idx_finance_dte_payment_status")
  @@index([tenantId, accountId], map: "idx_finance_dte_account")
  @@index([tenantId, supplierId], map: "idx_finance_dte_supplier")
  @@index([tenantId, date], map: "idx_finance_dte_date")
  @@map("finance_dtes")
  @@schema("finance")
}

model FinanceDteLine {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  dteId           String   @map("dte_id") @db.Uuid
  dte             FinanceDte @relation(fields: [dteId], references: [id], onDelete: Cascade)
  lineNumber      Int      @map("line_number")
  itemCode        String?  @map("item_code")
  itemName        String   @map("item_name")
  description     String?
  quantity        Decimal  @db.Decimal(12, 4)
  unit            String?
  unitPrice       Decimal  @map("unit_price") @db.Decimal(14, 4)
  discountPct     Decimal  @default(0) @map("discount_pct") @db.Decimal(5, 2)
  netAmount       Decimal  @map("net_amount") @db.Decimal(14, 2)
  isExempt        Boolean  @default(false) @map("is_exempt")
  accountId       String?  @map("account_id") @db.Uuid
  account         FinanceAccountPlan? @relation(fields: [accountId], references: [id])
  costCenterId    String?  @map("cost_center_id") @db.Uuid

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([dteId], map: "idx_finance_dte_line_dte")
  @@map("finance_dte_lines")
  @@schema("finance")
}
```

**Step 4: Add treasury, payment, reconciliation, and factoring models**

```prisma
// ── ERP: Tesoreria ──

enum FinanceBankAccountType {
  CHECKING
  SAVINGS
  VISTA

  @@schema("finance")
}

enum FinanceBankTxSource {
  API
  MANUAL
  CSV_IMPORT

  @@schema("finance")
}

enum FinanceReconciliationStatus {
  UNMATCHED
  MATCHED
  RECONCILED
  EXCLUDED

  @@schema("finance")
}

enum FinanceReconcPeriodStatus {
  IN_PROGRESS
  COMPLETED
  APPROVED

  @@schema("finance")
}

enum FinanceMatchType {
  AUTO
  MANUAL

  @@schema("finance")
}

enum FinancePaymentRecordType {
  COLLECTION
  DISBURSEMENT

  @@schema("finance")
}

enum FinancePaymentMethod {
  TRANSFER
  CHECK
  CASH
  CREDIT_CARD
  FACTORING
  COMPENSATION
  OTHER

  @@schema("finance")
}

enum FinancePaymentRecordStatus {
  PENDING
  CONFIRMED
  CANCELLED

  @@schema("finance")
}

enum FinanceFactoringStatus {
  SIMULATED
  SUBMITTED
  APPROVED
  FUNDED
  COLLECTED
  CANCELLED

  @@schema("finance")
}

model FinanceBankAccount {
  id                String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId          String   @map("tenant_id")
  bankCode          String   @map("bank_code")
  bankName          String   @map("bank_name")
  accountType       FinanceBankAccountType @map("account_type")
  accountNumber     String   @map("account_number")
  currency          FinanceCurrency @default(CLP)
  holderName        String   @map("holder_name")
  holderRut         String   @map("holder_rut")
  accountPlanId     String?  @map("account_plan_id") @db.Uuid
  accountPlan       FinanceAccountPlan? @relation(fields: [accountPlanId], references: [id])
  isActive          Boolean  @default(true) @map("is_active")
  isDefault         Boolean  @default(false) @map("is_default")
  apiProvider       String?  @map("api_provider")
  apiLinkId         String?  @map("api_link_id")
  apiAccountId      String?  @map("api_account_id")
  apiLastSync       DateTime? @map("api_last_sync") @db.Timestamptz(6)
  currentBalance    Decimal? @map("current_balance") @db.Decimal(14, 2)
  balanceUpdatedAt  DateTime? @map("balance_updated_at") @db.Timestamptz(6)

  transactions      FinanceBankTransaction[]
  reconciliations   FinanceReconciliation[]
  paymentsFrom      FinancePaymentRecord[]

  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, bankCode, accountNumber], map: "uq_finance_bank_account")
  @@index([tenantId], map: "idx_finance_bank_account_tenant")
  @@map("finance_bank_accounts")
  @@schema("finance")
}

model FinanceBankTransaction {
  id                    String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId              String   @map("tenant_id")
  bankAccountId         String   @map("bank_account_id") @db.Uuid
  bankAccount           FinanceBankAccount @relation(fields: [bankAccountId], references: [id])
  transactionDate       DateTime @map("transaction_date") @db.Date
  valueDate             DateTime? @map("value_date") @db.Date
  description           String
  reference             String?
  amount                Decimal  @db.Decimal(14, 2)
  balance               Decimal? @db.Decimal(14, 2)
  category              String?
  source                FinanceBankTxSource @default(MANUAL)
  apiTransactionId      String?  @map("api_transaction_id")
  reconciliationStatus  FinanceReconciliationStatus @default(UNMATCHED) @map("reconciliation_status")
  reconciliationId      String?  @map("reconciliation_id") @db.Uuid

  reconcMatch           FinanceReconciliationMatch?

  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, bankAccountId, apiTransactionId], map: "uq_finance_bank_tx_api")
  @@index([tenantId, bankAccountId, transactionDate], map: "idx_finance_bank_tx_date")
  @@index([reconciliationStatus], map: "idx_finance_bank_tx_reconc")
  @@map("finance_bank_transactions")
  @@schema("finance")
}

model FinanceCashRegister {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId        String   @map("tenant_id")
  name            String
  accountPlanId   String?  @map("account_plan_id") @db.Uuid
  accountPlan     FinanceAccountPlan? @relation(fields: [accountPlanId], references: [id])
  currentBalance  Decimal  @default(0) @map("current_balance") @db.Decimal(14, 2)
  isActive        Boolean  @default(true) @map("is_active")

  payments        FinancePaymentRecord[]

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, name], map: "uq_finance_cash_register_name")
  @@index([tenantId], map: "idx_finance_cash_register_tenant")
  @@map("finance_cash_registers")
  @@schema("finance")
}

// ── ERP: Pagos y Conciliacion ──

model FinancePaymentRecord {
  id                String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId          String   @map("tenant_id")
  code              String
  type              FinancePaymentRecordType
  date              DateTime @db.Date
  amount            Decimal  @db.Decimal(14, 2)
  currency          FinanceCurrency @default(CLP)
  exchangeRate      Decimal? @map("exchange_rate") @db.Decimal(10, 4)
  paymentMethod     FinancePaymentMethod @map("payment_method")
  bankAccountId     String?  @map("bank_account_id") @db.Uuid
  bankAccount       FinanceBankAccount? @relation(fields: [bankAccountId], references: [id])
  cashRegisterId    String?  @map("cash_register_id") @db.Uuid
  cashRegister      FinanceCashRegister? @relation(fields: [cashRegisterId], references: [id])
  checkNumber       String?  @map("check_number")
  transferReference String?  @map("transfer_reference")
  accountId         String?  @map("account_id")
  supplierId        String?  @map("supplier_id") @db.Uuid
  supplier          FinanceSupplier? @relation(fields: [supplierId], references: [id])
  journalEntryId    String?  @map("journal_entry_id") @db.Uuid
  journalEntry      FinanceJournalEntry? @relation(fields: [journalEntryId], references: [id])
  status            FinancePaymentRecordStatus @default(PENDING)
  notes             String?
  createdBy         String   @map("created_by")

  allocations       FinancePaymentAllocation[]
  reconcMatch       FinanceReconciliationMatch?

  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, code], map: "uq_finance_payment_record_code")
  @@index([tenantId, type, date], map: "idx_finance_payment_record_type_date")
  @@map("finance_payment_records")
  @@schema("finance")
}

model FinancePaymentAllocation {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  paymentId       String   @map("payment_id") @db.Uuid
  payment         FinancePaymentRecord @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  dteId           String   @map("dte_id") @db.Uuid
  dte             FinanceDte @relation(fields: [dteId], references: [id])
  amount          Decimal  @db.Decimal(14, 2)

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([paymentId], map: "idx_finance_pay_alloc_payment")
  @@index([dteId], map: "idx_finance_pay_alloc_dte")
  @@map("finance_payment_allocations")
  @@schema("finance")
}

model FinanceReconciliation {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId        String   @map("tenant_id")
  bankAccountId   String   @map("bank_account_id") @db.Uuid
  bankAccount     FinanceBankAccount @relation(fields: [bankAccountId], references: [id])
  periodYear      Int      @map("period_year")
  periodMonth     Int      @map("period_month")
  status          FinanceReconcPeriodStatus @default(IN_PROGRESS)
  bankBalance     Decimal  @default(0) @map("bank_balance") @db.Decimal(14, 2)
  bookBalance     Decimal  @default(0) @map("book_balance") @db.Decimal(14, 2)
  difference      Decimal  @default(0) @db.Decimal(14, 2)
  completedBy     String?  @map("completed_by")
  completedAt     DateTime? @map("completed_at") @db.Timestamptz(6)
  approvedBy      String?  @map("approved_by")
  approvedAt      DateTime? @map("approved_at") @db.Timestamptz(6)

  matches         FinanceReconciliationMatch[]

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, bankAccountId, periodYear, periodMonth], map: "uq_finance_reconc_period")
  @@map("finance_reconciliations")
  @@schema("finance")
}

model FinanceReconciliationMatch {
  id                  String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  reconciliationId    String   @map("reconciliation_id") @db.Uuid
  reconciliation      FinanceReconciliation @relation(fields: [reconciliationId], references: [id], onDelete: Cascade)
  bankTransactionId   String   @unique @map("bank_transaction_id") @db.Uuid
  bankTransaction     FinanceBankTransaction @relation(fields: [bankTransactionId], references: [id])
  paymentRecordId     String?  @unique @map("payment_record_id") @db.Uuid
  paymentRecord       FinancePaymentRecord? @relation(fields: [paymentRecordId], references: [id])
  journalEntryId      String?  @map("journal_entry_id") @db.Uuid
  journalEntry        FinanceJournalEntry? @relation(fields: [journalEntryId], references: [id])
  matchType           FinanceMatchType @map("match_type")
  matchConfidence     Decimal? @map("match_confidence") @db.Decimal(5, 2)
  createdBy           String?  @map("created_by")

  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([reconciliationId], map: "idx_finance_reconc_match_reconc")
  @@map("finance_reconciliation_matches")
  @@schema("finance")
}

// ── ERP: Factoring ──

model FinanceFactoringOperation {
  id                  String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId            String   @map("tenant_id")
  code                String
  dteId               String   @map("dte_id") @db.Uuid
  dte                 FinanceDte @relation(fields: [dteId], references: [id])
  factoringCompany    String   @map("factoring_company")
  invoiceAmount       Decimal  @map("invoice_amount") @db.Decimal(14, 2)
  advanceRate         Decimal  @map("advance_rate") @db.Decimal(5, 2)
  advanceAmount       Decimal  @map("advance_amount") @db.Decimal(14, 2)
  interestRate        Decimal  @map("interest_rate") @db.Decimal(6, 4)
  interestAmount      Decimal  @map("interest_amount") @db.Decimal(14, 2)
  commissionAmount    Decimal  @map("commission_amount") @db.Decimal(14, 2)
  netAdvance          Decimal  @map("net_advance") @db.Decimal(14, 2)
  retentionAmount     Decimal  @map("retention_amount") @db.Decimal(14, 2)
  status              FinanceFactoringStatus @default(SIMULATED)
  submittedAt         DateTime? @map("submitted_at") @db.Timestamptz(6)
  fundedAt            DateTime? @map("funded_at") @db.Timestamptz(6)
  collectedAt         DateTime? @map("collected_at") @db.Timestamptz(6)
  cessionRegistered   Boolean  @default(false) @map("cession_registered")
  cessionDate         DateTime? @map("cession_date") @db.Date
  cessionSiiStatus    String?  @map("cession_sii_status")
  journalEntryId      String?  @map("journal_entry_id") @db.Uuid
  journalEntry        FinanceJournalEntry? @relation("FactoringCession", fields: [journalEntryId], references: [id])
  collectionEntryId   String?  @map("collection_entry_id") @db.Uuid
  collectionEntry     FinanceJournalEntry? @relation("FactoringCollection", fields: [collectionEntryId], references: [id])
  notes               String?
  createdBy           String   @map("created_by")

  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, code], map: "uq_finance_factoring_code")
  @@index([tenantId, status], map: "idx_finance_factoring_status")
  @@map("finance_factoring_operations")
  @@schema("finance")
}
```

**Step 5: Generate and apply migration**

Run: `cd /Users/caco/Desktop/Cursor/opai && npx prisma migrate dev --name add_erp_billing_treasury_models`
Expected: Migration created and applied successfully.

Run: `npx prisma generate`
Expected: Prisma Client generated successfully.

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(finance): add DTE, supplier, bank, payment, reconciliation, factoring schema models"
```

---

## Task 3: Chilean Chart of Accounts Seed Data

**Files:**
- Create: `src/modules/finance/shared/constants/chart-of-accounts-cl.ts`
- Create: `prisma/seeds/finance-chart-of-accounts.ts`

**Step 1: Create the chart of accounts constant**

Create `src/modules/finance/shared/constants/chart-of-accounts-cl.ts` with the standard Chilean chart of accounts. This is the seed data that gets loaded when a tenant activates the accounting module.

The file should export a `CHART_OF_ACCOUNTS_CL` array with entries like:

```typescript
/**
 * Plan de Cuentas Base Chileno
 * Estructura jerarquica: Grupo > Subgrupo > Cuenta > Subcuenta
 * Basado en el estandar IFRS/NIC Chile para PYMES
 */

export type AccountSeedEntry = {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "COST" | "EXPENSE";
  nature: "DEBIT" | "CREDIT";
  level: number;
  parentCode: string | null;
  acceptsEntries: boolean;
  taxCode?: string;
};

export const CHART_OF_ACCOUNTS_CL: AccountSeedEntry[] = [
  // ── 1. ACTIVOS ──
  { code: "1", name: "Activos", type: "ASSET", nature: "DEBIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "1.1", name: "Activos Corrientes", type: "ASSET", nature: "DEBIT", level: 2, parentCode: "1", acceptsEntries: false },
  { code: "1.1.01", name: "Efectivo y Equivalentes", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.1", acceptsEntries: false },
  { code: "1.1.01.001", name: "Caja General", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },
  { code: "1.1.01.002", name: "Caja Chica", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },
  { code: "1.1.01.010", name: "Banco Santander CLP", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },
  { code: "1.1.01.011", name: "Banco de Chile CLP", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },
  { code: "1.1.01.012", name: "Banco BCI CLP", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },
  { code: "1.1.01.020", name: "Banco USD", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },

  { code: "1.1.02", name: "Deudores Comerciales", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.1", acceptsEntries: false },
  { code: "1.1.02.001", name: "Deudores por Venta", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.02", acceptsEntries: true },
  { code: "1.1.02.002", name: "Documentos por Cobrar", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.02", acceptsEntries: true },
  { code: "1.1.02.003", name: "Deudores en Factoring", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.02", acceptsEntries: true },
  { code: "1.1.02.004", name: "Retencion Factoring", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.02", acceptsEntries: true },
  { code: "1.1.02.009", name: "Estimacion Deudores Incobrables", type: "ASSET", nature: "CREDIT", level: 4, parentCode: "1.1.02", acceptsEntries: true },

  { code: "1.1.03", name: "Impuestos por Recuperar", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.1", acceptsEntries: false },
  { code: "1.1.03.001", name: "IVA Credito Fiscal", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.03", acceptsEntries: true, taxCode: "CF" },
  { code: "1.1.03.002", name: "PPM por Recuperar", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.03", acceptsEntries: true },
  { code: "1.1.03.003", name: "Remanente IVA", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.03", acceptsEntries: true },

  { code: "1.1.04", name: "Anticipos y Otros", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.1", acceptsEntries: false },
  { code: "1.1.04.001", name: "Anticipos a Proveedores", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.04", acceptsEntries: true },
  { code: "1.1.04.002", name: "Gastos Pagados por Anticipado", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.04", acceptsEntries: true },

  { code: "1.2", name: "Activos No Corrientes", type: "ASSET", nature: "DEBIT", level: 2, parentCode: "1", acceptsEntries: false },
  { code: "1.2.01", name: "Propiedad, Planta y Equipo", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.2", acceptsEntries: false },
  { code: "1.2.01.001", name: "Vehiculos", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.2.01", acceptsEntries: true },
  { code: "1.2.01.002", name: "Equipos de Computacion", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.2.01", acceptsEntries: true },
  { code: "1.2.01.003", name: "Muebles y Enseres", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.2.01", acceptsEntries: true },
  { code: "1.2.01.009", name: "Depreciacion Acumulada", type: "ASSET", nature: "CREDIT", level: 4, parentCode: "1.2.01", acceptsEntries: true },

  { code: "1.2.02", name: "Intangibles", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.2", acceptsEntries: false },
  { code: "1.2.02.001", name: "Software y Licencias", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.2.02", acceptsEntries: true },
  { code: "1.2.02.009", name: "Amortizacion Acumulada", type: "ASSET", nature: "CREDIT", level: 4, parentCode: "1.2.02", acceptsEntries: true },

  // ── 2. PASIVOS ──
  { code: "2", name: "Pasivos", type: "LIABILITY", nature: "CREDIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "2.1", name: "Pasivos Corrientes", type: "LIABILITY", nature: "CREDIT", level: 2, parentCode: "2", acceptsEntries: false },
  { code: "2.1.01", name: "Proveedores", type: "LIABILITY", nature: "CREDIT", level: 3, parentCode: "2.1", acceptsEntries: false },
  { code: "2.1.01.001", name: "Proveedores Nacionales", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.01", acceptsEntries: true },
  { code: "2.1.01.002", name: "Documentos por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.01", acceptsEntries: true },
  { code: "2.1.01.003", name: "Acreedores Varios", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.01", acceptsEntries: true },

  { code: "2.1.02", name: "Impuestos por Pagar", type: "LIABILITY", nature: "CREDIT", level: 3, parentCode: "2.1", acceptsEntries: false },
  { code: "2.1.02.001", name: "IVA Debito Fiscal", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.02", acceptsEntries: true, taxCode: "DF" },
  { code: "2.1.02.002", name: "Retencion Impuesto Unico", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.02", acceptsEntries: true },
  { code: "2.1.02.003", name: "PPM por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.02", acceptsEntries: true },
  { code: "2.1.02.004", name: "Impuesto Renta por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.02", acceptsEntries: true },

  { code: "2.1.03", name: "Remuneraciones por Pagar", type: "LIABILITY", nature: "CREDIT", level: 3, parentCode: "2.1", acceptsEntries: false },
  { code: "2.1.03.001", name: "Sueldos por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.03", acceptsEntries: true },
  { code: "2.1.03.002", name: "AFP por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.03", acceptsEntries: true },
  { code: "2.1.03.003", name: "Salud por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.03", acceptsEntries: true },
  { code: "2.1.03.004", name: "Vacaciones por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.03", acceptsEntries: true },

  { code: "2.2", name: "Pasivos No Corrientes", type: "LIABILITY", nature: "CREDIT", level: 2, parentCode: "2", acceptsEntries: false },
  { code: "2.2.01", name: "Obligaciones Financieras LP", type: "LIABILITY", nature: "CREDIT", level: 3, parentCode: "2.2", acceptsEntries: false },
  { code: "2.2.01.001", name: "Prestamos Bancarios LP", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.2.01", acceptsEntries: true },
  { code: "2.2.01.002", name: "Provision Indemnizacion Anios Servicio", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.2.01", acceptsEntries: true },

  // ── 3. PATRIMONIO ──
  { code: "3", name: "Patrimonio", type: "EQUITY", nature: "CREDIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "3.1", name: "Capital", type: "EQUITY", nature: "CREDIT", level: 2, parentCode: "3", acceptsEntries: false },
  { code: "3.1.01", name: "Capital Social", type: "EQUITY", nature: "CREDIT", level: 3, parentCode: "3.1", acceptsEntries: false },
  { code: "3.1.01.001", name: "Capital Pagado", type: "EQUITY", nature: "CREDIT", level: 4, parentCode: "3.1.01", acceptsEntries: true },

  { code: "3.2", name: "Resultados", type: "EQUITY", nature: "CREDIT", level: 2, parentCode: "3", acceptsEntries: false },
  { code: "3.2.01", name: "Resultados Acumulados", type: "EQUITY", nature: "CREDIT", level: 3, parentCode: "3.2", acceptsEntries: false },
  { code: "3.2.01.001", name: "Utilidades Retenidas", type: "EQUITY", nature: "CREDIT", level: 4, parentCode: "3.2.01", acceptsEntries: true },
  { code: "3.2.01.002", name: "Perdidas Acumuladas", type: "EQUITY", nature: "DEBIT", level: 4, parentCode: "3.2.01", acceptsEntries: true },
  { code: "3.2.01.003", name: "Resultado del Ejercicio", type: "EQUITY", nature: "CREDIT", level: 4, parentCode: "3.2.01", acceptsEntries: true },

  // ── 4. INGRESOS ──
  { code: "4", name: "Ingresos", type: "REVENUE", nature: "CREDIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "4.1", name: "Ingresos de Explotacion", type: "REVENUE", nature: "CREDIT", level: 2, parentCode: "4", acceptsEntries: false },
  { code: "4.1.01", name: "Ventas de Servicios", type: "REVENUE", nature: "CREDIT", level: 3, parentCode: "4.1", acceptsEntries: false },
  { code: "4.1.01.001", name: "Ingresos por Servicios de Seguridad", type: "REVENUE", nature: "CREDIT", level: 4, parentCode: "4.1.01", acceptsEntries: true },
  { code: "4.1.01.002", name: "Ingresos por Servicios Exentos", type: "REVENUE", nature: "CREDIT", level: 4, parentCode: "4.1.01", acceptsEntries: true },
  { code: "4.1.01.003", name: "Ingresos por Horas Extra", type: "REVENUE", nature: "CREDIT", level: 4, parentCode: "4.1.01", acceptsEntries: true },

  { code: "4.2", name: "Otros Ingresos", type: "REVENUE", nature: "CREDIT", level: 2, parentCode: "4", acceptsEntries: false },
  { code: "4.2.01", name: "Ingresos Financieros", type: "REVENUE", nature: "CREDIT", level: 3, parentCode: "4.2", acceptsEntries: false },
  { code: "4.2.01.001", name: "Intereses Ganados", type: "REVENUE", nature: "CREDIT", level: 4, parentCode: "4.2.01", acceptsEntries: true },
  { code: "4.2.01.002", name: "Diferencia de Cambio Favorable", type: "REVENUE", nature: "CREDIT", level: 4, parentCode: "4.2.01", acceptsEntries: true },

  // ── 5. COSTOS ──
  { code: "5", name: "Costos", type: "COST", nature: "DEBIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "5.1", name: "Costos de Explotacion", type: "COST", nature: "DEBIT", level: 2, parentCode: "5", acceptsEntries: false },
  { code: "5.1.01", name: "Costo de Personal Operativo", type: "COST", nature: "DEBIT", level: 3, parentCode: "5.1", acceptsEntries: false },
  { code: "5.1.01.001", name: "Remuneraciones Guardias", type: "COST", nature: "DEBIT", level: 4, parentCode: "5.1.01", acceptsEntries: true },
  { code: "5.1.01.002", name: "Leyes Sociales Guardias", type: "COST", nature: "DEBIT", level: 4, parentCode: "5.1.01", acceptsEntries: true },
  { code: "5.1.01.003", name: "Uniformes y EPP", type: "COST", nature: "DEBIT", level: 4, parentCode: "5.1.01", acceptsEntries: true },
  { code: "5.1.01.004", name: "Capacitacion Guardias", type: "COST", nature: "DEBIT", level: 4, parentCode: "5.1.01", acceptsEntries: true },

  // ── 6. GASTOS ──
  { code: "6", name: "Gastos", type: "EXPENSE", nature: "DEBIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "6.1", name: "Gastos de Administracion", type: "EXPENSE", nature: "DEBIT", level: 2, parentCode: "6", acceptsEntries: false },
  { code: "6.1.01", name: "Gastos de Personal Admin", type: "EXPENSE", nature: "DEBIT", level: 3, parentCode: "6.1", acceptsEntries: false },
  { code: "6.1.01.001", name: "Remuneraciones Administrativas", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.01", acceptsEntries: true },
  { code: "6.1.01.002", name: "Leyes Sociales Admin", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.01", acceptsEntries: true },

  { code: "6.1.02", name: "Gastos Generales", type: "EXPENSE", nature: "DEBIT", level: 3, parentCode: "6.1", acceptsEntries: false },
  { code: "6.1.02.001", name: "Arriendo Oficinas", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.002", name: "Servicios Basicos", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.003", name: "Comunicaciones", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.004", name: "Seguros", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.005", name: "Combustible y Peajes", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.006", name: "Mantencion y Reparaciones", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.007", name: "Gastos de Viaje y Representacion", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.008", name: "Honorarios Profesionales", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.009", name: "Depreciacion", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.010", name: "Amortizacion", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.011", name: "Gastos Notariales y Legales", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.012", name: "Gastos de Rendiciones", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },

  { code: "6.2", name: "Gastos Financieros", type: "EXPENSE", nature: "DEBIT", level: 2, parentCode: "6", acceptsEntries: false },
  { code: "6.2.01", name: "Costos Financieros", type: "EXPENSE", nature: "DEBIT", level: 3, parentCode: "6.2", acceptsEntries: false },
  { code: "6.2.01.001", name: "Intereses Bancarios", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.2.01", acceptsEntries: true },
  { code: "6.2.01.002", name: "Comisiones Bancarias", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.2.01", acceptsEntries: true },
  { code: "6.2.01.003", name: "Costo Factoring", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.2.01", acceptsEntries: true },
  { code: "6.2.01.004", name: "Diferencia de Cambio Desfavorable", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.2.01", acceptsEntries: true },
];
```

**Step 2: Create the seed function**

Create `prisma/seeds/finance-chart-of-accounts.ts`:

```typescript
/**
 * Seed: Plan de Cuentas Base Chileno
 * Crea el plan de cuentas estandar para un tenant
 */

import { PrismaClient } from "@prisma/client";
import { CHART_OF_ACCOUNTS_CL } from "@/modules/finance/shared/constants/chart-of-accounts-cl";

const prisma = new PrismaClient();

export async function seedChartOfAccounts(tenantId: string) {
  console.log(`Seeding chart of accounts for tenant ${tenantId}...`);

  // Build a map of code -> id for parent resolution
  const codeToId: Record<string, string> = {};

  for (const account of CHART_OF_ACCOUNTS_CL) {
    const parentId = account.parentCode ? codeToId[account.parentCode] ?? null : null;

    const created = await prisma.financeAccountPlan.upsert({
      where: {
        uq_finance_account_plan_code: {
          tenantId,
          code: account.code,
        },
      },
      update: {
        name: account.name,
        type: account.type,
        nature: account.nature,
        level: account.level,
        parentId,
        acceptsEntries: account.acceptsEntries,
        isSystem: true,
        isActive: true,
        taxCode: account.taxCode ?? null,
      },
      create: {
        tenantId,
        code: account.code,
        name: account.name,
        type: account.type,
        nature: account.nature,
        level: account.level,
        parentId,
        acceptsEntries: account.acceptsEntries,
        isSystem: true,
        isActive: true,
        taxCode: account.taxCode ?? null,
      },
    });

    codeToId[account.code] = created.id;
  }

  console.log(`Seeded ${CHART_OF_ACCOUNTS_CL.length} accounts for tenant ${tenantId}`);
}
```

**Step 3: Commit**

```bash
git add src/modules/finance/shared/constants/chart-of-accounts-cl.ts prisma/seeds/finance-chart-of-accounts.ts
git commit -m "feat(finance): add Chilean chart of accounts seed data (80+ accounts)"
```

---

## Task 4: Accounting Services — Account Plan + Periods

**Files:**
- Create: `src/modules/finance/shared/types/accounting.types.ts`
- Create: `src/modules/finance/shared/validators/journal.validator.ts`
- Create: `src/modules/finance/accounting/account-plan.service.ts`
- Create: `src/modules/finance/accounting/period.service.ts`

**Step 1: Create types file**

`src/modules/finance/shared/types/accounting.types.ts`:

```typescript
import type { Decimal } from "@prisma/client/runtime/library";

export type AccountTreeNode = {
  id: string;
  code: string;
  name: string;
  type: string;
  nature: string;
  level: number;
  isSystem: boolean;
  isActive: boolean;
  acceptsEntries: boolean;
  children: AccountTreeNode[];
};

export type JournalLineInput = {
  accountId: string;
  description?: string;
  debit: number;
  credit: number;
  costCenterId?: string;
  thirdPartyId?: string;
  thirdPartyType?: "CUSTOMER" | "SUPPLIER";
};

export type JournalEntryInput = {
  date: string; // ISO date YYYY-MM-DD
  description: string;
  reference?: string;
  sourceType?: string;
  sourceId?: string;
  costCenterId?: string;
  lines: JournalLineInput[];
};

export type LedgerEntry = {
  date: Date;
  entryNumber: number;
  description: string;
  reference: string | null;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
};
```

**Step 2: Create journal validator**

`src/modules/finance/shared/validators/journal.validator.ts`:

```typescript
/**
 * Validates double-entry bookkeeping rules
 */

import type { JournalLineInput } from "../types/accounting.types";

export function validateDoubleEntry(lines: JournalLineInput[]): {
  valid: boolean;
  error?: string;
  totalDebit: number;
  totalCredit: number;
} {
  if (!lines || lines.length < 2) {
    return { valid: false, error: "Un asiento requiere al menos 2 lineas", totalDebit: 0, totalCredit: 0 };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) {
      return { valid: false, error: "Los montos no pueden ser negativos", totalDebit: 0, totalCredit: 0 };
    }
    if (line.debit > 0 && line.credit > 0) {
      return { valid: false, error: "Una linea no puede tener debito y credito al mismo tiempo", totalDebit: 0, totalCredit: 0 };
    }
    if (line.debit === 0 && line.credit === 0) {
      return { valid: false, error: "Una linea debe tener debito o credito mayor a cero", totalDebit: 0, totalCredit: 0 };
    }
    totalDebit += line.debit;
    totalCredit += line.credit;
  }

  // Round to 2 decimals for comparison
  const roundedDebit = Math.round(totalDebit * 100) / 100;
  const roundedCredit = Math.round(totalCredit * 100) / 100;

  if (roundedDebit !== roundedCredit) {
    return {
      valid: false,
      error: `Debitos (${roundedDebit}) no igualan creditos (${roundedCredit})`,
      totalDebit: roundedDebit,
      totalCredit: roundedCredit,
    };
  }

  return { valid: true, totalDebit: roundedDebit, totalCredit: roundedCredit };
}
```

**Step 3: Create account plan service**

`src/modules/finance/accounting/account-plan.service.ts`:

```typescript
/**
 * Account Plan Service
 * CRUD for chart of accounts with hierarchical tree support
 */

import { prisma } from "@/lib/prisma";
import { CHART_OF_ACCOUNTS_CL } from "../shared/constants/chart-of-accounts-cl";
import type { AccountTreeNode } from "../shared/types/accounting.types";

/**
 * Get full chart of accounts as a flat list
 */
export async function getAccountPlan(tenantId: string) {
  return prisma.financeAccountPlan.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
  });
}

/**
 * Get chart of accounts as hierarchical tree
 */
export async function getAccountTree(tenantId: string): Promise<AccountTreeNode[]> {
  const accounts = await prisma.financeAccountPlan.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
  });

  const map = new Map<string, AccountTreeNode>();
  const roots: AccountTreeNode[] = [];

  for (const acc of accounts) {
    map.set(acc.id, {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      nature: acc.nature,
      level: acc.level,
      isSystem: acc.isSystem,
      isActive: acc.isActive,
      acceptsEntries: acc.acceptsEntries,
      children: [],
    });
  }

  for (const acc of accounts) {
    const node = map.get(acc.id)!;
    if (acc.parentId && map.has(acc.parentId)) {
      map.get(acc.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Create a new account
 */
export async function createAccount(
  tenantId: string,
  data: {
    code: string;
    name: string;
    type: string;
    nature: string;
    parentId?: string;
    level: number;
    acceptsEntries: boolean;
    description?: string;
    taxCode?: string;
  }
) {
  return prisma.financeAccountPlan.create({
    data: {
      tenantId,
      code: data.code,
      name: data.name,
      type: data.type as any,
      nature: data.nature as any,
      parentId: data.parentId ?? null,
      level: data.level,
      acceptsEntries: data.acceptsEntries,
      description: data.description ?? null,
      taxCode: data.taxCode ?? null,
      isSystem: false,
      isActive: true,
    },
  });
}

/**
 * Update an account (system accounts: only name and description editable)
 */
export async function updateAccount(
  tenantId: string,
  accountId: string,
  data: Partial<{
    name: string;
    description: string;
    isActive: boolean;
    acceptsEntries: boolean;
  }>
) {
  const account = await prisma.financeAccountPlan.findFirst({
    where: { id: accountId, tenantId },
  });
  if (!account) throw new Error("Cuenta no encontrada");

  // System accounts: only allow name and description changes
  if (account.isSystem) {
    return prisma.financeAccountPlan.update({
      where: { id: accountId },
      data: {
        name: data.name ?? account.name,
        description: data.description ?? account.description,
      },
    });
  }

  return prisma.financeAccountPlan.update({
    where: { id: accountId },
    data: {
      name: data.name ?? account.name,
      description: data.description ?? account.description,
      isActive: data.isActive ?? account.isActive,
      acceptsEntries: data.acceptsEntries ?? account.acceptsEntries,
    },
  });
}

/**
 * Seed the standard Chilean chart of accounts for a tenant
 */
export async function seedAccountPlan(tenantId: string) {
  const existing = await prisma.financeAccountPlan.count({
    where: { tenantId, isSystem: true },
  });

  if (existing > 0) {
    throw new Error("El plan de cuentas base ya fue creado para esta empresa");
  }

  const codeToId: Record<string, string> = {};

  for (const account of CHART_OF_ACCOUNTS_CL) {
    const parentId = account.parentCode ? codeToId[account.parentCode] ?? null : null;

    const created = await prisma.financeAccountPlan.create({
      data: {
        tenantId,
        code: account.code,
        name: account.name,
        type: account.type as any,
        nature: account.nature as any,
        level: account.level,
        parentId,
        acceptsEntries: account.acceptsEntries,
        isSystem: true,
        isActive: true,
        taxCode: account.taxCode ?? null,
      },
    });

    codeToId[account.code] = created.id;
  }

  return { count: CHART_OF_ACCOUNTS_CL.length };
}
```

**Step 4: Create period service**

`src/modules/finance/accounting/period.service.ts`:

```typescript
/**
 * Accounting Period Service
 * Manage open/close cycles for monthly accounting periods
 */

import { prisma } from "@/lib/prisma";

/**
 * List all periods for a tenant
 */
export async function listPeriods(tenantId: string) {
  return prisma.financeAccountingPeriod.findMany({
    where: { tenantId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
}

/**
 * Open a new accounting period
 */
export async function openPeriod(
  tenantId: string,
  year: number,
  month: number
) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month

  // Check no duplicate
  const existing = await prisma.financeAccountingPeriod.findUnique({
    where: {
      uq_finance_period_tenant_year_month: { tenantId, year, month },
    },
  });
  if (existing) {
    throw new Error(`El periodo ${year}-${String(month).padStart(2, "0")} ya existe`);
  }

  return prisma.financeAccountingPeriod.create({
    data: {
      tenantId,
      year,
      month,
      startDate,
      endDate,
      status: "OPEN",
    },
  });
}

/**
 * Close a period (no more entries allowed)
 */
export async function closePeriod(
  tenantId: string,
  periodId: string,
  closedBy: string
) {
  const period = await prisma.financeAccountingPeriod.findFirst({
    where: { id: periodId, tenantId },
  });
  if (!period) throw new Error("Periodo no encontrado");
  if (period.status !== "OPEN") throw new Error("Solo se pueden cerrar periodos abiertos");

  // Check all entries are posted
  const draftEntries = await prisma.financeJournalEntry.count({
    where: { periodId, tenantId, status: "DRAFT" },
  });
  if (draftEntries > 0) {
    throw new Error(`Hay ${draftEntries} asientos en borrador. Contabilice o elimine antes de cerrar.`);
  }

  return prisma.financeAccountingPeriod.update({
    where: { id: periodId },
    data: {
      status: "CLOSED",
      closedBy,
      closedAt: new Date(),
    },
  });
}
```

**Step 5: Commit**

```bash
git add src/modules/finance/shared/ src/modules/finance/accounting/
git commit -m "feat(finance): add accounting services — plan de cuentas, periodos, validacion partida doble"
```

---

## Task 5: Journal Entry Service + Auto-Entry Builder

**Files:**
- Create: `src/modules/finance/accounting/journal-entry.service.ts`
- Create: `src/modules/finance/accounting/ledger.service.ts`
- Create: `src/modules/finance/accounting/auto-entry.builder.ts`

**Step 1: Create journal entry service**

`src/modules/finance/accounting/journal-entry.service.ts` — handles creating, posting, and reversing journal entries. Each entry must pass double-entry validation before being saved.

The service should:
- `createManualEntry(tenantId, createdBy, input)` — validate lines, compute totals, save as DRAFT
- `postEntry(tenantId, entryId, postedBy)` — change DRAFT to POSTED, set postedAt
- `reverseEntry(tenantId, entryId, reversedBy, date)` — create new reverse entry, link via reversedById
- `getEntry(tenantId, entryId)` — get entry with lines
- `listEntries(tenantId, filters)` — paginated journal with filters (date range, status, sourceType)
- Auto-generate `number` field as sequential per tenant (max+1)
- Validate period is OPEN before saving
- Use `validateDoubleEntry()` from journal validator

**Step 2: Create ledger service**

`src/modules/finance/accounting/ledger.service.ts` — generates the general ledger for a specific account.

The service should:
- `getAccountLedger(tenantId, accountId, dateRange)` — returns all journal lines for an account, with running balance, ordered by date
- Balance calculation respects account nature (DEBIT accounts: balance = sum(debit) - sum(credit))

**Step 3: Create auto-entry builder**

`src/modules/finance/accounting/auto-entry.builder.ts` — builds journal entry inputs from business events.

The builder should:
- Accept event type + source data
- Look up the correct accounts from the tenant's chart of accounts (by `taxCode` or known codes)
- Return a `JournalEntryInput` ready to pass to `createManualEntry()`
- Support events: INVOICE_ISSUED, INVOICE_RECEIVED, PAYMENT_RECEIVED, PAYMENT_MADE

Key account mappings:
- Invoice issued: DR Deudores por Venta (1.1.02.001) / CR Ingreso (4.1.01.001) + CR IVA DF (2.1.02.001)
- Invoice received: DR Gasto (line account) + DR IVA CF (1.1.03.001) / CR Proveedores (2.1.01.001)
- Payment received: DR Banco (bank account's linked plan account) / CR Deudores por Venta (1.1.02.001)
- Payment made: DR Proveedores (2.1.01.001) / CR Banco (bank account's linked plan account)

**Step 4: Commit**

```bash
git add src/modules/finance/accounting/
git commit -m "feat(finance): add journal entry service, ledger, and auto-entry builder"
```

---

## Task 6: Billing Services — DTE Issuer + Adapter

**Files:**
- Create: `src/modules/finance/shared/adapters/dte-provider.adapter.ts`
- Create: `src/modules/finance/shared/constants/dte-types.ts`
- Create: `src/modules/finance/shared/validators/rut.validator.ts`
- Create: `src/modules/finance/billing/dte-issuer.service.ts`
- Create: `src/modules/finance/billing/dte-pdf.service.ts`
- Create: `src/modules/finance/billing/dte-email.service.ts`
- Create: `src/modules/finance/billing/folio.service.ts`
- Create: `src/modules/finance/payables/supplier.service.ts`

**Step 1: Create DTE provider adapter interface**

`src/modules/finance/shared/adapters/dte-provider.adapter.ts` — defines the interface that all DTE providers must implement.

**Step 2: Create DTE types constants**

`src/modules/finance/shared/constants/dte-types.ts` — maps DTE type codes to names:
- 33: Factura Electronica
- 34: Factura No Afecta o Exenta
- 39: Boleta Electronica
- 52: Guia de Despacho
- 56: Nota de Debito
- 61: Nota de Credito

**Step 3: Create RUT validator**

`src/modules/finance/shared/validators/rut.validator.ts` — validates Chilean RUT format and check digit.

**Step 4: Create DTE issuer service**

`src/modules/finance/billing/dte-issuer.service.ts` — orchestrates DTE issuance:
1. Validate input (RUT, lines, amounts)
2. Calculate net, tax, total
3. Get next folio
4. Call DTE provider adapter to issue
5. Store DTE in database
6. Trigger auto-entry builder to create journal entry
7. Store PDF/XML in R2
8. Optionally send email

**Step 5: Create supplier service**

`src/modules/finance/payables/supplier.service.ts` — basic CRUD for suppliers.

**Step 6: Commit**

```bash
git add src/modules/finance/shared/ src/modules/finance/billing/ src/modules/finance/payables/
git commit -m "feat(finance): add DTE issuer service, provider adapter, supplier CRUD"
```

---

## Task 7: Zod Validation Schemas

**Files:**
- Create: `src/lib/validations/finance.ts`

**Step 1: Create all Zod schemas for finance endpoints**

Include schemas for:
- `createAccountSchema` — code, name, type, nature, parentId, level, acceptsEntries
- `updateAccountSchema` — name, description, isActive
- `openPeriodSchema` — year, month
- `createJournalEntrySchema` — date, description, reference, lines[]
- `createSupplierSchema` — rut, name, tradeName, address, email, phone, paymentTermDays
- `updateSupplierSchema` — partial of create
- `issueDteSchema` — dteType, receiverRut, receiverName, receiverEmail, lines[], currency, notes, accountId, autoSendEmail
- `dteCreditNoteSchema` — referenceDteId, reason, lines[]

All schemas should use the same patterns as `src/lib/validations/crm.ts` (trim, max length, optional nullable).

**Step 2: Commit**

```bash
git add src/lib/validations/finance.ts
git commit -m "feat(finance): add Zod validation schemas for accounting and billing endpoints"
```

---

## Task 8: API Routes — Accounting

**Files:**
- Create: `src/app/api/finance/accounting/accounts/route.ts` (GET, POST)
- Create: `src/app/api/finance/accounting/accounts/[id]/route.ts` (PUT)
- Create: `src/app/api/finance/accounting/accounts/[id]/ledger/route.ts` (GET)
- Create: `src/app/api/finance/accounting/accounts/seed/route.ts` (POST)
- Create: `src/app/api/finance/accounting/periods/route.ts` (GET, POST)
- Create: `src/app/api/finance/accounting/periods/[id]/close/route.ts` (POST)
- Create: `src/app/api/finance/accounting/journal/route.ts` (GET, POST)
- Create: `src/app/api/finance/accounting/journal/[id]/route.ts` (GET)
- Create: `src/app/api/finance/accounting/journal/[id]/post/route.ts` (POST)
- Create: `src/app/api/finance/accounting/journal/[id]/reverse/route.ts` (POST)

Each route file follows the exact pattern from the codebase:
1. `requireAuth()` + `unauthorized()`
2. `ensureModuleAccess(ctx, "finance")`
3. Zod validation via `parseBody()`
4. Call service function
5. Return `{ success: true, data }` or `{ success: false, error }`

**Step 1: Create all route files following the pattern**

**Step 2: Commit**

```bash
git add src/app/api/finance/accounting/
git commit -m "feat(finance): add accounting API routes — accounts, periods, journal entries"
```

---

## Task 9: API Routes — Billing & Suppliers

**Files:**
- Create: `src/app/api/finance/billing/issued/route.ts` (GET, POST)
- Create: `src/app/api/finance/billing/issued/[id]/route.ts` (GET)
- Create: `src/app/api/finance/billing/issued/[id]/pdf/route.ts` (GET)
- Create: `src/app/api/finance/billing/issued/[id]/send-email/route.ts` (POST)
- Create: `src/app/api/finance/billing/issued/[id]/void/route.ts` (POST)
- Create: `src/app/api/finance/billing/issued/[id]/status/route.ts` (GET)
- Create: `src/app/api/finance/billing/credit-note/route.ts` (POST)
- Create: `src/app/api/finance/billing/debit-note/route.ts` (POST)
- Create: `src/app/api/finance/billing/folios/route.ts` (GET)
- Create: `src/app/api/finance/purchases/suppliers/route.ts` (GET, POST)
- Create: `src/app/api/finance/purchases/suppliers/[id]/route.ts` (GET, PUT)

Same pattern as Task 8.

**Step 1: Create all route files**

**Step 2: Commit**

```bash
git add src/app/api/finance/billing/ src/app/api/finance/purchases/
git commit -m "feat(finance): add billing and supplier API routes — DTE issuance, NC/ND, supplier CRUD"
```

---

## Task 10: RBAC — Add Finance Module Permissions

**Files:**
- Modify: `src/lib/role-policy.ts` — add `finance` module access for roles `finanzas`, `solo_finanzas`, `admin`, `owner`
- Modify: `src/lib/permissions.ts` — ensure `finance` is a valid `ModuleKey`

**Step 1: Verify current RBAC and add finance sub-module permissions**

Check that `finanzas` and `solo_finanzas` roles already have access to `finance` module. If not, add it. Also ensure the new sub-routes (`accounting`, `billing`, `purchases`) are covered.

**Step 2: Commit**

```bash
git add src/lib/role-policy.ts src/lib/permissions.ts
git commit -m "feat(finance): ensure RBAC covers accounting and billing sub-modules"
```

---

## Task 11: Configuration — DTE Provider + Environment Variables

**Files:**
- Create: `src/app/api/finance/config/accounting/route.ts` (GET, PUT)
- Create: `src/app/api/finance/config/dte-provider/route.ts` (GET, PUT)
- Create: `src/app/api/finance/config/certificate/upload/route.ts` (POST)
- Modify: `.env.example` — add new env vars

**Step 1: Add environment variables to .env.example**

```
# ── ERP Finance ──
DTE_PROVIDER=FACTO
DTE_API_KEY=
DTE_API_SECRET=
DTE_API_URL=https://api.facto.cl/v1
DTE_CERTIFICATE_PASSWORD=
BANK_PROVIDER=MANUAL
FINTOC_API_KEY=
FINTOC_SECRET_KEY=
```

**Step 2: Create config routes**

**Step 3: Commit**

```bash
git add src/app/api/finance/config/ .env.example
git commit -m "feat(finance): add configuration routes and environment variables for DTE/bank providers"
```

---

## Task 12: Integration Test — Full Flow Verification

**Files:**
- Create: `src/modules/finance/accounting/__tests__/journal-validator.test.ts`

**Step 1: Write tests for double-entry validator**

Test cases:
- Valid 2-line entry (debit = credit) -> valid
- Unbalanced entry -> invalid with error message
- Negative amounts -> invalid
- Same line with both debit and credit -> invalid
- Zero amounts -> invalid
- Single line -> invalid (needs at least 2)

**Step 2: Run tests**

Run: `npx vitest run src/modules/finance/accounting/__tests__/journal-validator.test.ts`
(or `npx jest` if project uses jest)

**Step 3: Manual API flow test**

Verify the full flow works end-to-end:
1. POST `/api/finance/accounting/accounts/seed` — seed chart of accounts
2. GET `/api/finance/accounting/accounts` — verify tree
3. POST `/api/finance/accounting/periods` — open Jan 2026
4. POST `/api/finance/accounting/journal` — create manual entry
5. POST `/api/finance/accounting/journal/[id]/post` — post it
6. GET `/api/finance/accounting/accounts/[id]/ledger` — verify ledger

**Step 4: Commit**

```bash
git add src/modules/finance/accounting/__tests__/
git commit -m "test(finance): add journal validator tests and verify accounting flow"
```

---

## Summary

| Task | Description | Files | Commits |
|------|-------------|-------|---------|
| 1 | Prisma schema: accounting core | schema.prisma | 1 |
| 2 | Prisma schema: billing + treasury + all remaining | schema.prisma | 1 |
| 3 | Chilean chart of accounts seed | 2 new files | 1 |
| 4 | Account plan + period services | 4 new files | 1 |
| 5 | Journal entry + ledger + auto-entry builder | 3 new files | 1 |
| 6 | DTE issuer + adapter + supplier | 7 new files | 1 |
| 7 | Zod validation schemas | 1 new file | 1 |
| 8 | API routes: accounting | 10 new files | 1 |
| 9 | API routes: billing + suppliers | 11 new files | 1 |
| 10 | RBAC permissions update | 2 modified | 1 |
| 11 | Config routes + env vars | 4 new files | 1 |
| 12 | Tests + integration verification | 1 new file | 1 |
| **Total** | | **~45 files** | **12 commits** |
