-- AlterEnum
ALTER TYPE "finance"."FinanceFactoringStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "finance"."finance_factoring_operations" ADD COLUMN     "aec_track_id" TEXT,
ADD COLUMN     "aec_xml" BYTEA,
ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "cesionario_direccion" TEXT,
ADD COLUMN     "cesionario_email" TEXT,
ADD COLUMN     "cesionario_razon_social" TEXT,
ADD COLUMN     "cesionario_rut" TEXT,
ADD COLUMN     "cession_last_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "cession_method" TEXT NOT NULL DEFAULT 'ELECTRONIC',
ADD COLUMN     "cession_rpetc_raw" JSONB,
ADD COLUMN     "cession_status_error" TEXT,
ADD COLUMN     "closed_at" TIMESTAMPTZ(6),
ADD COLUMN     "email_deudor" TEXT,
ADD COLUMN     "factoring_company_id" UUID,
ADD COLUMN     "fecha_cesion" DATE,
ADD COLUMN     "fecha_vencimiento" DATE,
ADD COLUMN     "id_cesion_rpetc" TEXT,
ADD COLUMN     "monto_cesion" DECIMAL(14,2),
ADD COLUMN     "otras_condiciones" TEXT,
ADD COLUMN     "plazo_dias" INTEGER;

-- CreateTable
CREATE TABLE "finance"."finance_factoring_companies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "direccion" TEXT,
    "comuna" TEXT,
    "ciudad" TEXT,
    "email" TEXT,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "default_advance_rate" DECIMAL(5,2),
    "default_interest_rate" DECIMAL(6,4),
    "default_commission_pct" DECIMAL(5,2),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_factoring_companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_factoring_company_active" ON "finance"."finance_factoring_companies"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_factoring_company_rut" ON "finance"."finance_factoring_companies"("tenant_id", "rut");

-- CreateIndex
CREATE INDEX "idx_factoring_op_company" ON "finance"."finance_factoring_operations"("tenant_id", "factoring_company_id");

-- CreateIndex
CREATE INDEX "idx_factoring_op_fecha_cesion" ON "finance"."finance_factoring_operations"("tenant_id", "fecha_cesion");

-- AddForeignKey
ALTER TABLE "finance"."finance_factoring_operations" ADD CONSTRAINT "finance_factoring_operations_factoring_company_id_fkey" FOREIGN KEY ("factoring_company_id") REFERENCES "finance"."finance_factoring_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

