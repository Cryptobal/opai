-- Add SUPERVISION context type for module-level notes (IF NOT EXISTS for idempotency)
DO $$ BEGIN
  ALTER TYPE notes."NoteContextType" ADD VALUE 'SUPERVISION';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
