-- AlterTable: OpsTicketType - add on_approval_action
ALTER TABLE "ops"."ops_ticket_types" ADD COLUMN "on_approval_action" TEXT;

-- AlterTable: OpsTicket - add metadata
ALTER TABLE "ops"."ops_tickets" ADD COLUMN "metadata" JSONB;

-- AlterTable: OpsRefuerzoSolicitud - add ticket_id
ALTER TABLE "ops"."refuerzo_solicitudes" ADD COLUMN "ticket_id" UUID;

-- CreateIndex: unique ticket_id on refuerzo_solicitudes
CREATE UNIQUE INDEX "refuerzo_solicitudes_ticket_id_key" ON "ops"."refuerzo_solicitudes"("ticket_id");

-- AddForeignKey: refuerzo_solicitudes.ticket_id -> ops_tickets.id
ALTER TABLE "ops"."refuerzo_solicitudes" ADD CONSTRAINT "refuerzo_solicitudes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "ops"."ops_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: FinancePendingBillableItem
CREATE TABLE "finance"."finance_pending_billable_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "item_name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "unit_price" DECIMAL(14,4) NOT NULL,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invoiced_dte_id" UUID,
    "invoiced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_pending_billable_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_finance_pending_billable_acct_status" ON "finance"."finance_pending_billable_items"("tenant_id", "account_id", "status");
CREATE INDEX "idx_finance_pending_billable_source" ON "finance"."finance_pending_billable_items"("source_type", "source_id");
