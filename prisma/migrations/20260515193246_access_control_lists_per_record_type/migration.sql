-- AccessControlConfig: per-record-type list flags
ALTER TABLE "access_control"."access_control_configs"
  ADD COLUMN IF NOT EXISTS "whitelist_record_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "access_control"."access_control_configs"
  ADD COLUMN IF NOT EXISTS "blacklist_record_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill desde los booleans legacy: si useWhitelist=true, habilitar los 5 defaults
-- (el admin podrá afinar por tipo desde el ConfigTab).
UPDATE "access_control"."access_control_configs"
SET "whitelist_record_types" = ARRAY['visit','provider','vehicle','staff','delivery']
WHERE "use_whitelist" = TRUE AND "whitelist_record_types" = ARRAY[]::TEXT[];

UPDATE "access_control"."access_control_configs"
SET "blacklist_record_types" = ARRAY['visit','provider','vehicle','staff','delivery']
WHERE "use_blacklist" = TRUE AND "blacklist_record_types" = ARRAY[]::TEXT[];

-- AccessControlList: per-entry array of types
ALTER TABLE "access_control"."access_control_lists"
  ADD COLUMN IF NOT EXISTS "record_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill desde la columna singular legacy
UPDATE "access_control"."access_control_lists"
SET "record_types" = ARRAY[COALESCE("record_type", 'visit')]
WHERE "record_types" = ARRAY[]::TEXT[];

-- GIN index para queries de array-contains
CREATE INDEX IF NOT EXISTS "idx_ac_lists_record_types"
  ON "access_control"."access_control_lists"
  USING GIN ("record_types");
