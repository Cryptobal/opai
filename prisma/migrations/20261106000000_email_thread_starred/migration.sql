-- Destacados (C11 §7): espejo del label STARRED de Gmail. Migración aditiva.

ALTER TABLE "crm"."email_threads"
  ADD COLUMN IF NOT EXISTS "starred_at" TIMESTAMPTZ(6);
