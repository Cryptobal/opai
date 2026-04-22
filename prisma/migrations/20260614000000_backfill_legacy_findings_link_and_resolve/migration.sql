-- Reconciliación retroactiva de hallazgos legacy:
--   (A) Linkear findings legacy (sin tipo_doc_id y sin guardia_doc_code) al TipoDocOperacional
--       correspondiente, usando best-match por contención de nombre en la descripción.
--   (B) Auto-resolver findings que ya tengan una verificación física "presente=true" posterior
--       a su first_detected_at, y cerrar su ticket asociado con nota de resolución.
--
-- Esta migración es idempotente y segura de re-ejecutar.

-- =======================================================================================
-- (A) BACKFILL: linkear description -> tipo_doc_id por best-match.
--
-- Regla: para cada finding abierto sin tipo_doc_id/guardia_doc_code, buscar en
-- tipos_doc_operacional del mismo tenant un nombre que esté contenido (case-insensitive)
-- dentro de la description. Si hay varios candidatos, gana el de nombre más largo
-- (más específico). Se ignoran nombres con menos de 4 caracteres para evitar matches
-- triviales ("Os10", "EPP", etc. quedan cubiertos porque tienen >=3-4 chars de raíz).
-- =======================================================================================
DO $$
DECLARE
  finding RECORD;
  best_tipo_id uuid;
BEGIN
  FOR finding IN
    SELECT id, tenant_id, description
    FROM "ops"."supervision_findings"
    WHERE status IN ('open', 'in_progress')
      AND tipo_doc_id IS NULL
      AND guardia_doc_code IS NULL
      AND description IS NOT NULL
  LOOP
    best_tipo_id := NULL;

    SELECT t.id
      INTO best_tipo_id
    FROM "ops"."tipos_doc_operacional" t
    WHERE t.tenant_id = finding.tenant_id
      AND t.is_active = true
      AND char_length(t.nombre) >= 4
      AND position(lower(t.nombre) IN lower(finding.description)) > 0
    ORDER BY char_length(t.nombre) DESC
    LIMIT 1;

    IF best_tipo_id IS NOT NULL THEN
      UPDATE "ops"."supervision_findings"
      SET tipo_doc_id = best_tipo_id,
          updated_at  = now()
      WHERE id = finding.id;
    END IF;
  END LOOP;
END $$;

-- =======================================================================================
-- (B) AUTO-RESOLUCIÓN RETROACTIVA:
--
-- Para cada finding abierto (con tipo_doc_id o guardia_doc_code), buscar la verificación
-- física "presente=true" más antigua posterior a first_detected_at. Si existe:
--   - Marcar el finding como resolved + verified_in_visit_id = esa visita.
--   - Cerrar el ticket asociado (si está abierto) con resolution_notes explicativa.
-- =======================================================================================
DO $$
DECLARE
  finding RECORD;
  v_id          uuid;
  v_supervision uuid;
  v_created_at  timestamptz;
BEGIN
  FOR finding IN
    SELECT id, tenant_id, installation_id, tipo_doc_id, guardia_doc_code,
           guard_id, first_detected_at, ticket_id, occurrence_count
    FROM "ops"."supervision_findings"
    WHERE status IN ('open', 'in_progress')
  LOOP
    v_id := NULL;
    v_supervision := NULL;
    v_created_at := NULL;

    IF finding.tipo_doc_id IS NOT NULL THEN
      SELECT v."id", v."supervisionId", v."createdAt"
        INTO v_id, v_supervision, v_created_at
      FROM "ops"."doc_verificacion_fisica" v
      WHERE v."tenantId" = finding.tenant_id
        AND v."installationId" = finding.installation_id
        AND v."tipoDocId" = finding.tipo_doc_id
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
