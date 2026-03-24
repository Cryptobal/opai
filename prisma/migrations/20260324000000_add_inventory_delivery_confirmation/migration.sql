-- Add delivery confirmation fields (FES - Firma Electrónica Simple) to inventory movements
ALTER TABLE "inventory"."movements"
  ADD COLUMN "confirmation_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "confirmation_pin" TEXT,
  ADD COLUMN "confirmation_pin_exp" TIMESTAMPTZ(6),
  ADD COLUMN "confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "confirmed_ip" TEXT,
  ADD COLUMN "confirmed_device" TEXT;
