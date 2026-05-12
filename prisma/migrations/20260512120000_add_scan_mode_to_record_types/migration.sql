-- Adds a `scan_mode` column to custom record types so the portal can
-- decide which scanner to open when an admin creates a new form:
--   'plate' → opens VehiclePlateOCR (vehicle flow, skips RUT identify)
--   'rut'   → opens CedulaQRScanner (identify step)
--   'none'  → manual entry only (no scanner)
-- Existing rows default to 'none' so behavior stays unchanged for any
-- custom types created before this migration.

ALTER TABLE "access_control"."access_control_record_types"
  ADD COLUMN IF NOT EXISTS "scan_mode" TEXT NOT NULL DEFAULT 'none';
