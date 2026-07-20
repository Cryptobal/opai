-- Confirmación de cobro por el cliente (landing pública /cobro/[token]).
-- Migración 100% ADITIVA: 1 enum nuevo, 1 tabla nueva, 4 columnas nuevas
-- (nullable / con default) en finance.finance_dtes, e índices. Sin DROP ni
-- ALTER destructivo.
--
-- NOTA: generada a mano con el formato exacto de Prisma migrate porque el
-- entorno de la sesión no tiene DATABASE_URL (no se pudo correr
-- `prisma migrate dev --create-only`). El SQL coincide con el diff que
-- Prisma produciría a partir de los cambios en schema.prisma.

-- CreateEnum
CREATE TYPE "finance"."FinanceDteClientAction" AS ENUM ('VIEWED', 'APPROVED', 'REJECTED', 'OC_ADDED');

-- AlterTable
ALTER TABLE "finance"."finance_dtes" ADD COLUMN     "client_action_token" TEXT,
ADD COLUMN     "client_action_token_exp" TIMESTAMPTZ(6),
ADD COLUMN     "cobro_last_reminder_at" TIMESTAMPTZ(6),
ADD COLUMN     "cobro_reminder_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "finance"."finance_dte_client_event" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dte_id" UUID NOT NULL,
    "variant" TEXT NOT NULL,
    "action" "finance"."FinanceDteClientAction" NOT NULL,
    "actor_email" TEXT,
    "comment" TEXT,
    "oc_folio" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_dte_client_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_dte_client_event_tenant_id_dte_id_idx" ON "finance"."finance_dte_client_event"("tenant_id", "dte_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_dtes_client_action_token_key" ON "finance"."finance_dtes"("client_action_token");

-- AddForeignKey
ALTER TABLE "finance"."finance_dte_client_event" ADD CONSTRAINT "finance_dte_client_event_dte_id_fkey" FOREIGN KEY ("dte_id") REFERENCES "finance"."finance_dtes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
