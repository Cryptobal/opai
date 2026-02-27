-- Add optional "name" column to cpq.quotes for user-friendly identification
ALTER TABLE cpq.quotes ADD COLUMN IF NOT EXISTS "name" TEXT;
