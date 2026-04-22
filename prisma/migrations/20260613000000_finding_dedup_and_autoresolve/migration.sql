-- Deduplicación de hallazgos de supervisión (un hallazgo persistente por instalación + tipo de documento)
-- y auto-resolución cuando el supervisor verifica el documento como presente.

ALTER TABLE "ops"."supervision_findings"
  ADD COLUMN IF NOT EXISTS "tipo_doc_id"             uuid,
  ADD COLUMN IF NOT EXISTS "guardia_doc_code"        text,
  ADD COLUMN IF NOT EXISTS "occurrence_count"        integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "first_detected_at"       timestamptz(6) NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "last_detected_at"        timestamptz(6) NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "last_detected_visit_id"  uuid;

-- Backfill de last_detected_at/first_detected_at para filas existentes usando createdAt
UPDATE "ops"."supervision_findings"
SET
  "first_detected_at" = COALESCE("first_detected_at", "created_at"),
  "last_detected_at"  = COALESCE("last_detected_at",  "created_at"),
  "last_detected_visit_id" = COALESCE("last_detected_visit_id", "visit_id");

-- FKs (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supervision_findings_tipo_doc_id_fkey'
  ) THEN
    ALTER TABLE "ops"."supervision_findings"
      ADD CONSTRAINT "supervision_findings_tipo_doc_id_fkey"
        FOREIGN KEY ("tipo_doc_id") REFERENCES "ops"."tipos_doc_operacional"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supervision_findings_last_detected_visit_id_fkey'
  ) THEN
    ALTER TABLE "ops"."supervision_findings"
      ADD CONSTRAINT "supervision_findings_last_detected_visit_id_fkey"
        FOREIGN KEY ("last_detected_visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Índices de búsqueda para deduplicación
CREATE INDEX IF NOT EXISTS "idx_supervision_findings_dedup_tipo"
  ON "ops"."supervision_findings" ("tenant_id", "installation_id", "tipo_doc_id", "status");

CREATE INDEX IF NOT EXISTS "idx_supervision_findings_dedup_guardia"
  ON "ops"."supervision_findings" ("tenant_id", "installation_id", "guardia_doc_code", "guard_id", "status");

-- Consolidación de findings legacy duplicados:
-- Agrupar por (installation_id, description) con status in ('open','in_progress').
-- Dejar el más antiguo como canónico con occurrenceCount = count del grupo
-- y fechas agregadas. El resto se marca como 'superseded' y sus tickets se cierran.
DO $$
DECLARE
  grp RECORD;
  canonical_id uuid;
  canonical_ticket uuid;
  cnt integer;
  first_at timestamptz;
  last_at timestamptz;
  last_visit uuid;
BEGIN
  FOR grp IN
    SELECT installation_id, description, COUNT(*) AS c
    FROM "ops"."supervision_findings"
    WHERE status IN ('open', 'in_progress')
      AND tipo_doc_id IS NULL
      AND guardia_doc_code IS NULL
    GROUP BY installation_id, description
    HAVING COUNT(*) > 1
  LOOP
    SELECT id, ticket_id
      INTO canonical_id, canonical_ticket
    FROM "ops"."supervision_findings"
    WHERE installation_id = grp.installation_id
      AND description = grp.description
      AND status IN ('open', 'in_progress')
    ORDER BY created_at ASC
    LIMIT 1;

    SELECT COUNT(*), MIN(created_at), MAX(created_at)
      INTO cnt, first_at, last_at
    FROM "ops"."supervision_findings"
    WHERE installation_id = grp.installation_id
      AND description = grp.description
      AND status IN ('open', 'in_progress');

    SELECT visit_id INTO last_visit
    FROM "ops"."supervision_findings"
    WHERE installation_id = grp.installation_id
      AND description = grp.description
      AND status IN ('open', 'in_progress')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Actualiza el canónico con contador y fechas agregadas
    UPDATE "ops"."supervision_findings"
    SET occurrence_count = cnt,
        first_detected_at = first_at,
        last_detected_at = last_at,
        last_detected_visit_id = last_visit,
        updated_at = now()
    WHERE id = canonical_id;

    -- Marca los demás como "superseded"
    UPDATE "ops"."supervision_findings" AS f
    SET status = 'superseded',
        resolved_at = now(),
        updated_at = now()
    WHERE f.installation_id = grp.installation_id
      AND f.description = grp.description
      AND f.status IN ('open', 'in_progress')
      AND f.id <> canonical_id;

    -- Cierra los tickets de los superseded que NO son el del canónico
    UPDATE "ops"."ops_tickets" AS t
    SET status = 'closed',
        closed_at = COALESCE(t.closed_at, now()),
        resolution_notes = COALESCE(
          t.resolution_notes,
          'Consolidado en hallazgo canónico: mismo documento/instalación.'
        ),
        updated_at = now()
    FROM "ops"."supervision_findings" AS f
    WHERE f.ticket_id = t.id
      AND f.status = 'superseded'
      AND (canonical_ticket IS NULL OR t.id <> canonical_ticket)
      AND t.status NOT IN ('closed', 'resolved', 'cancelled');
  END LOOP;
END $$;
