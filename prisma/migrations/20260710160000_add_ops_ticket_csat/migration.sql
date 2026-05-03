-- 1) Tabla CSAT por ticket
CREATE TABLE IF NOT EXISTS "ops"."ops_ticket_csat" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "ticket_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fingerprint" TEXT,

    CONSTRAINT "ops_ticket_csat_pkey" PRIMARY KEY ("id")
);

-- 1 fila por ticket.
CREATE UNIQUE INDEX IF NOT EXISTS "ops_ticket_csat_ticket_id_key"
  ON "ops"."ops_ticket_csat" ("ticket_id");

CREATE INDEX IF NOT EXISTS "idx_ops_ticket_csat_tenant_submitted"
  ON "ops"."ops_ticket_csat" ("tenant_id", "submitted_at");
CREATE INDEX IF NOT EXISTS "idx_ops_ticket_csat_tenant_rating"
  ON "ops"."ops_ticket_csat" ("tenant_id", "rating");

ALTER TABLE "ops"."ops_ticket_csat"
  ADD CONSTRAINT "ops_ticket_csat_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "ops"."ops_tickets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Token CSAT en ops_tickets para acceso público sin login
ALTER TABLE "ops"."ops_tickets"
  ADD COLUMN IF NOT EXISTS "csat_token" TEXT,
  ADD COLUMN IF NOT EXISTS "csat_token_exp" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "ops_tickets_csat_token_key"
  ON "ops"."ops_tickets" ("csat_token");
