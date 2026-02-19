-- ============================================
-- PAYROLL: Bonus Catalog
-- ============================================

CREATE TABLE "payroll"."bono_catalog" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "bono_type" TEXT NOT NULL,
  "is_taxable" BOOLEAN NOT NULL DEFAULT true,
  "is_tributable" BOOLEAN NOT NULL DEFAULT true,
  "default_amount" DECIMAL(12,2),
  "default_percentage" DECIMAL(5,2),
  "condition_type" TEXT,
  "condition_threshold" DECIMAL(5,2),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "bono_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bono_catalog_code_key" ON "payroll"."bono_catalog" ("code");
CREATE INDEX "idx_payroll_bono_catalog_tenant" ON "payroll"."bono_catalog" ("tenant_id");
CREATE INDEX "idx_payroll_bono_catalog_active" ON "payroll"."bono_catalog" ("is_active");
CREATE INDEX "idx_payroll_bono_catalog_type" ON "payroll"."bono_catalog" ("bono_type");

-- ============================================
-- PAYROLL: Salary Structure
-- ============================================

CREATE TABLE "payroll"."salary_structures" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" UUID NOT NULL,
  "base_salary" DECIMAL(12,2) NOT NULL,
  "colacion" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "movilizacion" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "gratification_type" TEXT NOT NULL DEFAULT 'AUTO_25',
  "gratification_custom_amount" DECIMAL(12,2),
  "net_salary_estimate" DECIMAL(12,2),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" DATE,
  "effective_until" DATE,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_payroll_salary_structure_tenant" ON "payroll"."salary_structures" ("tenant_id");
CREATE INDEX "idx_payroll_salary_structure_source" ON "payroll"."salary_structures" ("source_type", "source_id");
CREATE INDEX "idx_payroll_salary_structure_active" ON "payroll"."salary_structures" ("is_active");

-- ============================================
-- PAYROLL: Salary Structure Bonos (join table)
-- ============================================

CREATE TABLE "payroll"."salary_structure_bonos" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "salary_structure_id" UUID NOT NULL,
  "bono_catalog_id" UUID NOT NULL,
  "override_amount" DECIMAL(12,2),
  "override_percentage" DECIMAL(5,2),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "salary_structure_bonos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_structure_bono_structure" FOREIGN KEY ("salary_structure_id") REFERENCES "payroll"."salary_structures"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_structure_bono_catalog" FOREIGN KEY ("bono_catalog_id") REFERENCES "payroll"."bono_catalog"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_payroll_structure_bono_structure" ON "payroll"."salary_structure_bonos" ("salary_structure_id");
CREATE INDEX "idx_payroll_structure_bono_catalog" ON "payroll"."salary_structure_bonos" ("bono_catalog_id");

-- ============================================
-- PAYROLL: Periods
-- ============================================

CREATE TABLE "payroll"."periods" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "closed_at" TIMESTAMPTZ(6),
  "paid_at" TIMESTAMPTZ(6),
  "closed_by" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_payroll_period_tenant_year_month" ON "payroll"."periods" ("tenant_id", "year", "month");
CREATE INDEX "idx_payroll_period_tenant" ON "payroll"."periods" ("tenant_id");
CREATE INDEX "idx_payroll_period_status" ON "payroll"."periods" ("status");

-- ============================================
-- PAYROLL: Liquidaciones
-- ============================================

CREATE TABLE "payroll"."liquidaciones" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "period_id" UUID NOT NULL,
  "guardia_id" UUID NOT NULL,
  "persona_id" UUID NOT NULL,
  "installation_id" UUID,
  "puesto_id" UUID,
  "salary_structure_id" UUID,
  "salary_source" TEXT NOT NULL,
  "attendance_source" TEXT NOT NULL DEFAULT 'OPAI',
  "days_worked" INTEGER NOT NULL,
  "total_days_month" INTEGER NOT NULL DEFAULT 30,
  "breakdown" JSONB NOT NULL,
  "gross_salary" DECIMAL(12,2) NOT NULL,
  "net_salary" DECIMAL(12,2) NOT NULL,
  "total_deductions" DECIMAL(12,2) NOT NULL,
  "employer_cost" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "parameters_snapshot" JSONB NOT NULL,
  "paid_at" TIMESTAMPTZ(6),
  "voided_at" TIMESTAMPTZ(6),
  "void_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "liquidaciones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_liquidacion_period" FOREIGN KEY ("period_id") REFERENCES "payroll"."periods"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_liquidacion_salary_structure" FOREIGN KEY ("salary_structure_id") REFERENCES "payroll"."salary_structures"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "uq_payroll_liquidacion_period_guardia" ON "payroll"."liquidaciones" ("period_id", "guardia_id");
CREATE INDEX "idx_payroll_liquidacion_tenant" ON "payroll"."liquidaciones" ("tenant_id");
CREATE INDEX "idx_payroll_liquidacion_period" ON "payroll"."liquidaciones" ("period_id");
CREATE INDEX "idx_payroll_liquidacion_guardia" ON "payroll"."liquidaciones" ("guardia_id");
CREATE INDEX "idx_payroll_liquidacion_status" ON "payroll"."liquidaciones" ("status");

-- ============================================
-- PAYROLL: Anticipo Processes
-- ============================================

CREATE TABLE "payroll"."anticipo_processes" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "period_id" UUID NOT NULL,
  "process_date" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total_guards" INTEGER NOT NULL DEFAULT 0,
  "bank_file_generated" BOOLEAN NOT NULL DEFAULT false,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "anticipo_processes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_anticipo_process_period" FOREIGN KEY ("period_id") REFERENCES "payroll"."periods"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_payroll_anticipo_process_tenant" ON "payroll"."anticipo_processes" ("tenant_id");
CREATE INDEX "idx_payroll_anticipo_process_period" ON "payroll"."anticipo_processes" ("period_id");

-- ============================================
-- PAYROLL: Anticipo Items
-- ============================================

CREATE TABLE "payroll"."anticipo_items" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "anticipo_process_id" UUID NOT NULL,
  "guardia_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paid_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "anticipo_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_anticipo_item_process" FOREIGN KEY ("anticipo_process_id") REFERENCES "payroll"."anticipo_processes"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_payroll_anticipo_item_process" ON "payroll"."anticipo_items" ("anticipo_process_id");
CREATE INDEX "idx_payroll_anticipo_item_guardia" ON "payroll"."anticipo_items" ("guardia_id");

-- ============================================
-- PAYROLL: Attendance Imports
-- ============================================

CREATE TABLE "payroll"."attendance_imports" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "period_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "uploaded_by" TEXT,
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "matched_rows" INTEGER NOT NULL DEFAULT 0,
  "unmatched_rows" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'UPLOADED',
  "raw_data" JSONB,
  "process_log" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "attendance_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_attendance_import_period" FOREIGN KEY ("period_id") REFERENCES "payroll"."periods"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_payroll_attendance_import_tenant" ON "payroll"."attendance_imports" ("tenant_id");
CREATE INDEX "idx_payroll_attendance_import_period" ON "payroll"."attendance_imports" ("period_id");

-- ============================================
-- PAYROLL: Attendance Records
-- ============================================

CREATE TABLE "payroll"."attendance_records" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "period_id" UUID NOT NULL,
  "import_id" UUID,
  "guardia_id" UUID NOT NULL,
  "source" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "days_worked" INTEGER NOT NULL DEFAULT 0,
  "days_absent" INTEGER NOT NULL DEFAULT 0,
  "days_medical_leave" INTEGER NOT NULL DEFAULT 0,
  "days_vacation" INTEGER NOT NULL DEFAULT 0,
  "days_unpaid_leave" INTEGER NOT NULL DEFAULT 0,
  "total_days_month" INTEGER NOT NULL DEFAULT 30,
  "scheduled_days" INTEGER NOT NULL DEFAULT 0,
  "sundays_worked" INTEGER NOT NULL DEFAULT 0,
  "sundays_scheduled" INTEGER NOT NULL DEFAULT 0,
  "normal_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "overtime_hours_50" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "overtime_hours_100" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "late_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "daily_detail" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_attendance_record_period" FOREIGN KEY ("period_id") REFERENCES "payroll"."periods"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_attendance_record_import" FOREIGN KEY ("import_id") REFERENCES "payroll"."attendance_imports"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "uq_payroll_attendance_guardia_period" ON "payroll"."attendance_records" ("guardia_id", "year", "month");
CREATE INDEX "idx_payroll_attendance_record_tenant" ON "payroll"."attendance_records" ("tenant_id");
CREATE INDEX "idx_payroll_attendance_record_period" ON "payroll"."attendance_records" ("period_id");
CREATE INDEX "idx_payroll_attendance_record_guardia" ON "payroll"."attendance_records" ("guardia_id");

-- ============================================
-- OPS: Add salary_structure_id to puestos_operativos
-- ============================================

ALTER TABLE "ops"."puestos_operativos"
  ADD COLUMN "salary_structure_id" UUID;

-- ============================================
-- OPS: Add salary_structure_id to guardias
-- ============================================

ALTER TABLE "ops"."guardias"
  ADD COLUMN "salary_structure_id" UUID;
