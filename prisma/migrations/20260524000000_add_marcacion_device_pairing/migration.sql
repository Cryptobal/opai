-- Add device_pairing_id to ops.marcaciones for tracking which device was used
ALTER TABLE "ops"."marcaciones" ADD COLUMN IF NOT EXISTS "device_pairing_id" UUID;

-- Add foreign key (DevicePairing is in ops schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marcaciones_device_pairing_id_fkey'
  ) THEN
    ALTER TABLE "ops"."marcaciones"
      ADD CONSTRAINT "marcaciones_device_pairing_id_fkey"
      FOREIGN KEY ("device_pairing_id")
      REFERENCES "ops"."device_pairings"("id") ON DELETE SET NULL;
  END IF;
END $$;
