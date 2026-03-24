-- Add delivery confirmation fields (FES — Firma Electrónica Simple) to inventory movements
-- Supports Face ID verification and PIN fallback for guard receipt confirmation
ALTER TABLE "inventory"."movements"
  ADD COLUMN "confirmation_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "confirmed_method" TEXT,
  ADD COLUMN "confirmed_ip" TEXT,
  ADD COLUMN "confirmed_device" TEXT,
  ADD COLUMN "confirmed_face_conf" DOUBLE PRECISION,
  ADD COLUMN "confirmed_hash" TEXT;
