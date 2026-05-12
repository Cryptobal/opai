-- Allow per-installation customization of record type label & icon.
-- The id stays the same ("visit" | "provider" | "vehicle" | "staff" | "delivery")
-- so historical records stay valid. Only the display label and lucide icon are
-- overridden when the JSON entry is present; falls back to defaults otherwise.

ALTER TABLE "access_control"."access_control_configs"
  ADD COLUMN IF NOT EXISTS "record_type_labels" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "record_type_icons"  JSONB NOT NULL DEFAULT '{}';
