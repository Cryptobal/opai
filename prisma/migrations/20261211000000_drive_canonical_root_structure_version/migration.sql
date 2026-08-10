-- Drive: raíz canónica + versión de estructura + caché auto-reparable (solo aditivo)
ALTER TABLE "google_drive_workspaces"
  ADD COLUMN IF NOT EXISTS "root_folder_name" TEXT,
  ADD COLUMN IF NOT EXISTS "structure_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "root_verified_at" TIMESTAMP(3);

ALTER TABLE "drive_folder_cache"
  ADD COLUMN IF NOT EXISTS "last_verified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "entity_type" TEXT,
  ADD COLUMN IF NOT EXISTS "entity_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_drive_folder_cache_entity"
  ON "drive_folder_cache" ("tenant_id", "entity_type", "entity_id");

CREATE INDEX IF NOT EXISTS "idx_drive_folder_cache_folder"
  ON "drive_folder_cache" ("tenant_id", "drive_folder_id");
