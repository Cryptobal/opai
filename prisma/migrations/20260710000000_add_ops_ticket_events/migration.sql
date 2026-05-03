-- CreateTable: ops_ticket_events (audit trail de tickets)
CREATE TABLE IF NOT EXISTS "ops"."ops_ticket_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "ticket_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_id" TEXT,
    "data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_ops_ticket_events_ticket_created" ON "ops"."ops_ticket_events"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_ops_ticket_events_tenant_type" ON "ops"."ops_ticket_events"("tenant_id", "type");

-- AddForeignKey
ALTER TABLE "ops"."ops_ticket_events"
ADD CONSTRAINT "ops_ticket_events_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "ops"."ops_tickets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
