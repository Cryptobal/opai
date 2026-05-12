-- Custom record types per installation. The 5 default ids
-- (visit, provider, vehicle, staff, delivery) stay in code as
-- always-available; this table only holds the *extra* types the
-- admin creates. Soft-delete via `is_active=false` so historic
-- AccessControlRecord rows keep resolving their label.

CREATE TABLE IF NOT EXISTS "access_control"."access_control_record_types" (
  "id"              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenant_id"       TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "key"             TEXT NOT NULL,
  "label"           TEXT NOT NULL,
  "icon"            TEXT NOT NULL DEFAULT 'UserPlus',
  "default_fields"  JSONB NOT NULL DEFAULT '[]',
  "order_idx"       INTEGER NOT NULL DEFAULT 0,
  "is_active"       BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "access_control_record_types_installation_fk"
    FOREIGN KEY ("installation_id")
    REFERENCES "crm"."installations" ("id")
    ON DELETE CASCADE
);

-- One key per installation. Keys are generated server-side as
-- `custom_<random7>` so collisions are unlikely; the unique index
-- enforces it at the DB level just in case.
CREATE UNIQUE INDEX IF NOT EXISTS "access_control_record_types_inst_key_uniq"
  ON "access_control"."access_control_record_types" ("installation_id", "key");

CREATE INDEX IF NOT EXISTS "idx_ac_record_types_tenant"
  ON "access_control"."access_control_record_types" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_ac_record_types_inst_active"
  ON "access_control"."access_control_record_types" ("installation_id", "is_active");
