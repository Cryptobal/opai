-- CreateEnum
CREATE TYPE "finance"."FinanceAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COST', 'EXPENSE');

-- CreateEnum
CREATE TYPE "finance"."FinanceAccountNature" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "finance"."FinancePeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "finance"."FinanceJournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "finance"."FinanceJournalSourceType" AS ENUM ('MANUAL', 'INVOICE_ISSUED', 'INVOICE_RECEIVED', 'PAYMENT', 'RECONCILIATION', 'FACTORING', 'EXPENSE_REPORT', 'OPENING', 'CLOSING');

-- CreateEnum
CREATE TYPE "finance"."FinanceThirdPartyType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "finance"."FinanceDteDirection" AS ENUM ('ISSUED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "finance"."FinanceCurrency" AS ENUM ('CLP', 'USD', 'UF');

-- CreateEnum
CREATE TYPE "finance"."FinanceSiiStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'WITH_OBJECTIONS', 'ANNULLED');

-- CreateEnum
CREATE TYPE "finance"."FinanceReceptionStatus" AS ENUM ('PENDING_REVIEW', 'ACCEPTED', 'CLAIMED', 'PARTIAL_CLAIM', 'EXPIRED');

-- CreateEnum
CREATE TYPE "finance"."FinancePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "finance"."FinanceBankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'VISTA');

-- CreateEnum
CREATE TYPE "finance"."FinanceBankTxSource" AS ENUM ('API', 'MANUAL', 'CSV_IMPORT');

-- CreateEnum
CREATE TYPE "finance"."FinanceReconciliationStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'RECONCILED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "finance"."FinanceReconcPeriodStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'APPROVED');

-- CreateEnum
CREATE TYPE "finance"."FinanceMatchType" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "finance"."FinancePaymentRecordType" AS ENUM ('COLLECTION', 'DISBURSEMENT');

-- CreateEnum
CREATE TYPE "finance"."FinancePaymentMethod" AS ENUM ('TRANSFER', 'CHECK', 'CASH', 'CREDIT_CARD', 'FACTORING', 'COMPENSATION', 'OTHER');

-- CreateEnum
CREATE TYPE "finance"."FinancePaymentRecordStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "finance"."FinanceFactoringStatus" AS ENUM ('SIMULATED', 'SUBMITTED', 'APPROVED', 'FUNDED', 'COLLECTED', 'CANCELLED');

-- CreateTable: finance_account_plan (Task 1)
CREATE TABLE "finance"."finance_account_plan" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "finance"."FinanceAccountType" NOT NULL,
    "nature" "finance"."FinanceAccountNature" NOT NULL,
    "parent_id" UUID,
    "level" INTEGER NOT NULL DEFAULT 1,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "accepts_entries" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "tax_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_account_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_accounting_periods (Task 1)
CREATE TABLE "finance"."finance_accounting_periods" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "finance"."FinancePeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_by" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_journal_entries (Task 1)
CREATE TABLE "finance"."finance_journal_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "period_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "source_type" "finance"."FinanceJournalSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_id" TEXT,
    "status" "finance"."FinanceJournalStatus" NOT NULL DEFAULT 'DRAFT',
    "reversed_by_id" UUID,
    "cost_center_id" UUID,
    "total_debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "posted_by" TEXT,
    "posted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_journal_lines (Task 1)
CREATE TABLE "finance"."finance_journal_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "description" TEXT,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_center_id" UUID,
    "third_party_id" TEXT,
    "third_party_type" "finance"."FinanceThirdPartyType",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_audit_log (Task 1)
CREATE TABLE "finance"."finance_audit_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "previous_data" JSONB,
    "new_data" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_suppliers (Task 2)
CREATE TABLE "finance"."finance_suppliers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade_name" TEXT,
    "address" TEXT,
    "commune" TEXT,
    "city" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "contact_name" TEXT,
    "payment_term_days" INTEGER NOT NULL DEFAULT 30,
    "account_payable_id" UUID,
    "account_expense_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_dtes (Task 2)
CREATE TABLE "finance"."finance_dtes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "direction" "finance"."FinanceDteDirection" NOT NULL,
    "dte_type" INTEGER NOT NULL,
    "folio" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "due_date" DATE,
    "issuer_rut" TEXT NOT NULL,
    "issuer_name" TEXT NOT NULL,
    "receiver_rut" TEXT NOT NULL,
    "receiver_name" TEXT NOT NULL,
    "receiver_email" TEXT,
    "reference_dte_id" UUID,
    "reference_type" INTEGER,
    "reference_folio" INTEGER,
    "reference_reason" TEXT,
    "currency" "finance"."FinanceCurrency" NOT NULL DEFAULT 'CLP',
    "exchange_rate" DECIMAL(10,4),
    "net_amount" DECIMAL(14,2) NOT NULL,
    "exempt_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 19.00,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "account_id" TEXT,
    "contact_id" TEXT,
    "supplier_id" UUID,
    "sii_status" "finance"."FinanceSiiStatus" NOT NULL DEFAULT 'PENDING',
    "sii_track_id" TEXT,
    "sii_response" JSONB,
    "sii_accepted_at" TIMESTAMPTZ(6),
    "reception_status" "finance"."FinanceReceptionStatus",
    "reception_deadline" DATE,
    "reception_decided_at" TIMESTAMPTZ(6),
    "reception_decided_by" TEXT,
    "claim_type" INTEGER,
    "pdf_url" TEXT,
    "xml_url" TEXT,
    "cedible" BOOLEAN NOT NULL DEFAULT false,
    "journal_entry_id" UUID,
    "payment_status" "finance"."FinancePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_pending" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_dtes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_dte_lines (Task 2)
CREATE TABLE "finance"."finance_dte_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "dte_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "item_code" TEXT,
    "item_name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" TEXT,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "is_exempt" BOOLEAN NOT NULL DEFAULT false,
    "account_id" UUID,
    "cost_center_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_dte_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_bank_accounts (Task 2)
CREATE TABLE "finance"."finance_bank_accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_type" "finance"."FinanceBankAccountType" NOT NULL,
    "account_number" TEXT NOT NULL,
    "currency" "finance"."FinanceCurrency" NOT NULL DEFAULT 'CLP',
    "holder_name" TEXT NOT NULL,
    "holder_rut" TEXT NOT NULL,
    "account_plan_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "api_provider" TEXT,
    "api_link_id" TEXT,
    "api_account_id" TEXT,
    "api_last_sync" TIMESTAMPTZ(6),
    "current_balance" DECIMAL(14,2),
    "balance_updated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_bank_transactions (Task 2)
CREATE TABLE "finance"."finance_bank_transactions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "transaction_date" DATE NOT NULL,
    "value_date" DATE,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance" DECIMAL(14,2),
    "category" TEXT,
    "source" "finance"."FinanceBankTxSource" NOT NULL DEFAULT 'MANUAL',
    "api_transaction_id" TEXT,
    "reconciliation_status" "finance"."FinanceReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "reconciliation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_cash_registers (Task 2)
CREATE TABLE "finance"."finance_cash_registers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_plan_id" UUID,
    "current_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_payment_records (Task 2)
CREATE TABLE "finance"."finance_payment_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "finance"."FinancePaymentRecordType" NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "finance"."FinanceCurrency" NOT NULL DEFAULT 'CLP',
    "exchange_rate" DECIMAL(10,4),
    "payment_method" "finance"."FinancePaymentMethod" NOT NULL,
    "bank_account_id" UUID,
    "cash_register_id" UUID,
    "check_number" TEXT,
    "transfer_reference" TEXT,
    "account_id" TEXT,
    "supplier_id" UUID,
    "journal_entry_id" UUID,
    "status" "finance"."FinancePaymentRecordStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_payment_allocations (Task 2)
CREATE TABLE "finance"."finance_payment_allocations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "payment_id" UUID NOT NULL,
    "dte_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_reconciliations (Task 2)
CREATE TABLE "finance"."finance_reconciliations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "status" "finance"."FinanceReconcPeriodStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "bank_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "book_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "completed_by" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "approved_by" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_reconciliation_matches (Task 2)
CREATE TABLE "finance"."finance_reconciliation_matches" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "reconciliation_id" UUID NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "payment_record_id" UUID,
    "journal_entry_id" UUID,
    "match_type" "finance"."FinanceMatchType" NOT NULL,
    "match_confidence" DECIMAL(5,2),
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_reconciliation_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable: finance_factoring_operations (Task 2)
CREATE TABLE "finance"."finance_factoring_operations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "dte_id" UUID NOT NULL,
    "factoring_company" TEXT NOT NULL,
    "invoice_amount" DECIMAL(14,2) NOT NULL,
    "advance_rate" DECIMAL(5,2) NOT NULL,
    "advance_amount" DECIMAL(14,2) NOT NULL,
    "interest_rate" DECIMAL(6,4) NOT NULL,
    "interest_amount" DECIMAL(14,2) NOT NULL,
    "commission_amount" DECIMAL(14,2) NOT NULL,
    "net_advance" DECIMAL(14,2) NOT NULL,
    "retention_amount" DECIMAL(14,2) NOT NULL,
    "status" "finance"."FinanceFactoringStatus" NOT NULL DEFAULT 'SIMULATED',
    "submitted_at" TIMESTAMPTZ(6),
    "funded_at" TIMESTAMPTZ(6),
    "collected_at" TIMESTAMPTZ(6),
    "cession_registered" BOOLEAN NOT NULL DEFAULT false,
    "cession_date" DATE,
    "cession_sii_status" TEXT,
    "journal_entry_id" UUID,
    "collection_entry_id" UUID,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_factoring_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Task 1 indexes
CREATE INDEX "idx_finance_account_plan_tenant" ON "finance"."finance_account_plan"("tenant_id");
CREATE INDEX "idx_finance_account_plan_type" ON "finance"."finance_account_plan"("tenant_id", "type");
CREATE UNIQUE INDEX "uq_finance_account_plan_code" ON "finance"."finance_account_plan"("tenant_id", "code");

CREATE INDEX "idx_finance_period_tenant" ON "finance"."finance_accounting_periods"("tenant_id");
CREATE UNIQUE INDEX "uq_finance_period_tenant_year_month" ON "finance"."finance_accounting_periods"("tenant_id", "year", "month");

CREATE UNIQUE INDEX "finance_journal_entries_reversed_by_id_key" ON "finance"."finance_journal_entries"("reversed_by_id");
CREATE INDEX "idx_finance_journal_tenant_date" ON "finance"."finance_journal_entries"("tenant_id", "date");
CREATE INDEX "idx_finance_journal_source" ON "finance"."finance_journal_entries"("tenant_id", "source_type", "source_id");
CREATE UNIQUE INDEX "uq_finance_journal_tenant_number" ON "finance"."finance_journal_entries"("tenant_id", "number");

CREATE INDEX "idx_finance_journal_line_entry" ON "finance"."finance_journal_lines"("entry_id");
CREATE INDEX "idx_finance_journal_line_account" ON "finance"."finance_journal_lines"("account_id");

CREATE INDEX "idx_finance_audit_entity" ON "finance"."finance_audit_log"("tenant_id", "entity_type", "entity_id");
CREATE INDEX "idx_finance_audit_date" ON "finance"."finance_audit_log"("tenant_id", "created_at");

-- CreateIndex: Task 2 indexes
CREATE INDEX "idx_finance_supplier_tenant" ON "finance"."finance_suppliers"("tenant_id");
CREATE UNIQUE INDEX "uq_finance_supplier_rut" ON "finance"."finance_suppliers"("tenant_id", "rut");

CREATE INDEX "idx_finance_dte_payment_status" ON "finance"."finance_dtes"("tenant_id", "direction", "payment_status");
CREATE INDEX "idx_finance_dte_account" ON "finance"."finance_dtes"("tenant_id", "account_id");
CREATE INDEX "idx_finance_dte_supplier" ON "finance"."finance_dtes"("tenant_id", "supplier_id");
CREATE INDEX "idx_finance_dte_date" ON "finance"."finance_dtes"("tenant_id", "date");
CREATE UNIQUE INDEX "uq_finance_dte_folio" ON "finance"."finance_dtes"("tenant_id", "direction", "dte_type", "folio");

CREATE INDEX "idx_finance_dte_line_dte" ON "finance"."finance_dte_lines"("dte_id");

CREATE INDEX "idx_finance_bank_account_tenant" ON "finance"."finance_bank_accounts"("tenant_id");
CREATE UNIQUE INDEX "uq_finance_bank_account" ON "finance"."finance_bank_accounts"("tenant_id", "bank_code", "account_number");

CREATE INDEX "idx_finance_bank_tx_date" ON "finance"."finance_bank_transactions"("tenant_id", "bank_account_id", "transaction_date");
CREATE INDEX "idx_finance_bank_tx_reconc" ON "finance"."finance_bank_transactions"("reconciliation_status");
CREATE UNIQUE INDEX "uq_finance_bank_tx_api" ON "finance"."finance_bank_transactions"("tenant_id", "bank_account_id", "api_transaction_id");

CREATE INDEX "idx_finance_cash_register_tenant" ON "finance"."finance_cash_registers"("tenant_id");
CREATE UNIQUE INDEX "uq_finance_cash_register_name" ON "finance"."finance_cash_registers"("tenant_id", "name");

CREATE INDEX "idx_finance_payment_record_type_date" ON "finance"."finance_payment_records"("tenant_id", "type", "date");
CREATE UNIQUE INDEX "uq_finance_payment_record_code" ON "finance"."finance_payment_records"("tenant_id", "code");

CREATE INDEX "idx_finance_pay_alloc_payment" ON "finance"."finance_payment_allocations"("payment_id");
CREATE INDEX "idx_finance_pay_alloc_dte" ON "finance"."finance_payment_allocations"("dte_id");

CREATE UNIQUE INDEX "uq_finance_reconc_period" ON "finance"."finance_reconciliations"("tenant_id", "bank_account_id", "period_year", "period_month");

CREATE UNIQUE INDEX "finance_reconciliation_matches_bank_transaction_id_key" ON "finance"."finance_reconciliation_matches"("bank_transaction_id");
CREATE UNIQUE INDEX "finance_reconciliation_matches_payment_record_id_key" ON "finance"."finance_reconciliation_matches"("payment_record_id");
CREATE INDEX "idx_finance_reconc_match_reconc" ON "finance"."finance_reconciliation_matches"("reconciliation_id");

CREATE INDEX "idx_finance_factoring_status" ON "finance"."finance_factoring_operations"("tenant_id", "status");
CREATE UNIQUE INDEX "uq_finance_factoring_code" ON "finance"."finance_factoring_operations"("tenant_id", "code");

-- AddForeignKey: Task 1
ALTER TABLE "finance"."finance_account_plan" ADD CONSTRAINT "finance_account_plan_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "finance"."finance_account_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_journal_entries" ADD CONSTRAINT "finance_journal_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "finance"."finance_accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_journal_entries" ADD CONSTRAINT "finance_journal_entries_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "finance"."finance_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "finance"."finance_journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance"."finance_account_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Task 2
ALTER TABLE "finance"."finance_suppliers" ADD CONSTRAINT "finance_suppliers_account_payable_id_fkey" FOREIGN KEY ("account_payable_id") REFERENCES "finance"."finance_account_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_suppliers" ADD CONSTRAINT "finance_suppliers_account_expense_id_fkey" FOREIGN KEY ("account_expense_id") REFERENCES "finance"."finance_account_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_dtes" ADD CONSTRAINT "finance_dtes_reference_dte_id_fkey" FOREIGN KEY ("reference_dte_id") REFERENCES "finance"."finance_dtes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_dtes" ADD CONSTRAINT "finance_dtes_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "finance"."finance_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_dtes" ADD CONSTRAINT "finance_dtes_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "finance"."finance_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_dte_lines" ADD CONSTRAINT "finance_dte_lines_dte_id_fkey" FOREIGN KEY ("dte_id") REFERENCES "finance"."finance_dtes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_dte_lines" ADD CONSTRAINT "finance_dte_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance"."finance_account_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_bank_accounts" ADD CONSTRAINT "finance_bank_accounts_account_plan_id_fkey" FOREIGN KEY ("account_plan_id") REFERENCES "finance"."finance_account_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_bank_transactions" ADD CONSTRAINT "finance_bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "finance"."finance_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_cash_registers" ADD CONSTRAINT "finance_cash_registers_account_plan_id_fkey" FOREIGN KEY ("account_plan_id") REFERENCES "finance"."finance_account_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_payment_records" ADD CONSTRAINT "finance_payment_records_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "finance"."finance_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_payment_records" ADD CONSTRAINT "finance_payment_records_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "finance"."finance_cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_payment_records" ADD CONSTRAINT "finance_payment_records_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "finance"."finance_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_payment_records" ADD CONSTRAINT "finance_payment_records_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "finance"."finance_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_payment_allocations" ADD CONSTRAINT "finance_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "finance"."finance_payment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_payment_allocations" ADD CONSTRAINT "finance_payment_allocations_dte_id_fkey" FOREIGN KEY ("dte_id") REFERENCES "finance"."finance_dtes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_reconciliations" ADD CONSTRAINT "finance_reconciliations_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "finance"."finance_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "finance"."finance_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "finance"."finance_bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_payment_record_id_fkey" FOREIGN KEY ("payment_record_id") REFERENCES "finance"."finance_payment_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "finance"."finance_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_factoring_operations" ADD CONSTRAINT "finance_factoring_operations_dte_id_fkey" FOREIGN KEY ("dte_id") REFERENCES "finance"."finance_dtes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_factoring_operations" ADD CONSTRAINT "finance_factoring_operations_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "finance"."finance_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_factoring_operations" ADD CONSTRAINT "finance_factoring_operations_collection_entry_id_fkey" FOREIGN KEY ("collection_entry_id") REFERENCES "finance"."finance_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
