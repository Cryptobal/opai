-- Drive: modo SHARED_DRIVE + ingesta entrante (aditivo + DROP NOT NULL seguro)

ALTER TABLE "google_drive_workspaces"
  ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'OAUTH',
  ADD COLUMN IF NOT EXISTS "shared_drive_id" TEXT,
  ADD COLUMN IF NOT EXISTS "changes_page_token" TEXT,
  ADD COLUMN IF NOT EXISTS "last_ingest_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_ingest_error" TEXT;

ALTER TABLE "google_drive_workspaces" ALTER COLUMN "google_email" DROP NOT NULL;
ALTER TABLE "google_drive_workspaces" ALTER COLUMN "access_token_enc" DROP NOT NULL;
ALTER TABLE "google_drive_workspaces" ALTER COLUMN "refresh_token_enc" DROP NOT NULL;
ALTER TABLE "google_drive_workspaces" ALTER COLUMN "connected_by" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "drive_ingested_files" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "drive_file_id" TEXT NOT NULL,
  "drive_folder_id" TEXT,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "storage_key" TEXT,
  "target_table" TEXT,
  "target_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ingested_at" TIMESTAMP(3),
  CONSTRAINT "drive_ingested_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_drive_ingested_tenant_file"
  ON "drive_ingested_files" ("tenant_id", "drive_file_id");

CREATE INDEX IF NOT EXISTS "idx_drive_ingested_tenant_status"
  ON "drive_ingested_files" ("tenant_id", "status");
