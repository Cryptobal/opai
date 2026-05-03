-- CreateTable: ops_ticket_links (relaciones dirigidas entre tickets)
CREATE TABLE IF NOT EXISTS "ops"."ops_ticket_links" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "source_ticket_id" UUID NOT NULL,
    "target_ticket_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_ticket_links_pkey" PRIMARY KEY ("id")
);

-- Unique para evitar duplicados (mismo par + tipo).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ops_ticket_links_pair_type"
  ON "ops"."ops_ticket_links" ("source_ticket_id", "target_ticket_id", "type");

-- Indexes de lectura.
CREATE INDEX IF NOT EXISTS "idx_ops_ticket_links_tenant_source"
  ON "ops"."ops_ticket_links" ("tenant_id", "source_ticket_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ticket_links_tenant_target"
  ON "ops"."ops_ticket_links" ("tenant_id", "target_ticket_id");

-- FKs.
ALTER TABLE "ops"."ops_ticket_links"
  ADD CONSTRAINT "ops_ticket_links_source_ticket_id_fkey"
  FOREIGN KEY ("source_ticket_id") REFERENCES "ops"."ops_tickets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."ops_ticket_links"
  ADD CONSTRAINT "ops_ticket_links_target_ticket_id_fkey"
  FOREIGN KEY ("target_ticket_id") REFERENCES "ops"."ops_tickets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
