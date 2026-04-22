-- Backfill de DocVerificacionFisica legacy:
-- Cuando el supervisor registró la verificación con guardiaDocType = codigo y sin tipoDocId,
-- asignamos el tipoDocId correspondiente para que las consultas por tipoDocId sean
-- consistentes y los findings puedan auto-resolverse correctamente.
--
-- Luego, reejecutamos la auto-resolución de findings abiertos (idempotente) ahora
-- considerando tanto tipoDocId como guardiaDocType = codigo del tipoDoc.

-- =======================================================================================
-- (A) Backfill tipoDocId en verificaciones legacy (solo capa global/instalacion).
-- =======================================================================================
UPDATE "ops"."doc_verificacion_fisica" v
SET "tipoDocId" = t."id"
FROM "ops"."tipos_doc_operacional" t
WHERE v."tipoDocId" IS NULL
  AND v."guardiaDocType" IS NOT NULL
  AND v."tenantId" = t."tenant_id"
  AND v."guardiaDocType" = t."codigo"
  AND t."capa" IN ('global', 'instalacion');

-- =======================================================================================
-- (B) Auto-resolución retroactiva (re-ejecución, ahora con tipoDocId backfilled
--     y considerando también guardiaDocType = codigo como fallback).
-- =======================================================================================
DO $$
DECLARE
  finding RECORD;
  v_id          uuid;
  v_supervision uuid;
  v_created_at  timestamptz;
  tipo_codigo   text;
BEGIN
  FOR finding IN
    SELECT f.id, f.tenant_id, f.installation_id, f.tipo_doc_id, f.guardia_doc_code,
           f.guard_id, f.first_detected_at, f.ticket_id, f.occurrence_count
    FROM "ops"."supervision_findings" f
    WHERE f.status IN ('open', 'in_progress')
  LOOP
    v_id := NULL;
    v_supervision := NULL;
    v_created_at := NULL;
    tipo_codigo := NULL;

    -- Si el finding tiene tipo_doc_id, obtener también su codigo para match amplio
    IF finding.tipo_doc_id IS NOT NULL THEN
      SELECT t.codigo INTO tipo_codigo
      FROM "ops"."tipos_doc_operacional" t
      WHERE t.id = finding.tipo_doc_id
      LIMIT 1;

      SELECT v."id", v."supervisionId", v."createdAt"
        INTO v_id, v_supervision, v_created_at
      FROM "ops"."doc_verificacion_fisica" v
      WHERE v."tenantId" = finding.tenant_id
        AND v."installationId" = finding.installation_id
        AND (
          v."tipoDocId" = finding.tipo_doc_id
          OR (v."tipoDocId" IS NULL AND tipo_codigo IS NOT NULL AND v."guardiaDocType" = tipo_codigo)
        )
        AND v."presente" = true
        AND v."createdAt" >= finding.first_detected_at
      ORDER BY v."createdAt" ASC
      LIMIT 1;
    ELSIF finding.guardia_doc_code IS NOT NULL THEN
      SELECT v."id", v."supervisionId", v."createdAt"
        INTO v_id, v_supervision, v_created_at
      FROM "ops"."doc_verificacion_fisica" v
      WHERE v."tenantId" = finding.tenant_id
        AND v."installationId" = finding.installation_id
        AND v."guardiaDocType" = finding.guardia_doc_code
        AND (finding.guard_id IS NULL OR v."guardiaId" = finding.guard_id)
        AND v."presente" = true
        AND v."createdAt" >= finding.first_detected_at
      ORDER BY v."createdAt" ASC
      LIMIT 1;
    END IF;

    IF v_id IS NOT NULL THEN
      UPDATE "ops"."supervision_findings"
      SET status               = 'resolved',
          resolved_at          = COALESCE(resolved_at, v_created_at),
          verified_in_visit_id = COALESCE(verified_in_visit_id, v_supervision),
          updated_at           = now()
      WHERE id = finding.id;

      IF finding.ticket_id IS NOT NULL THEN
        UPDATE "ops"."ops_tickets"
        SET status           = 'resolved',
            resolved_at      = COALESCE(resolved_at, v_created_at),
            resolution_notes = COALESCE(
              resolution_notes,
              'Auto-resuelto retroactivo: verificación física presente el ' ||
              to_char(v_created_at, 'DD-MM-YYYY HH24:MI') ||
              ' (ocurrencias previas: ' || finding.occurrence_count || ').'
            ),
            updated_at       = now()
        WHERE id = finding.ticket_id
          AND status NOT IN ('resolved', 'closed', 'cancelled');
      END IF;
    END IF;
  END LOOP;
END $$;
