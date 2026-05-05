-- CreateTable: ops_ticket_attachments (adjuntos persistidos por ticket)
CREATE TABLE IF NOT EXISTS "ops"."ops_ticket_attachments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "ticket_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "content_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_ops_ticket_attachments_ticket" ON "ops"."ops_ticket_attachments"("ticket_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_ops_ticket_attachments_tenant" ON "ops"."ops_ticket_attachments"("tenant_id");

-- AddForeignKey
ALTER TABLE "ops"."ops_ticket_attachments"
ADD CONSTRAINT "ops_ticket_attachments_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "ops"."ops_tickets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
