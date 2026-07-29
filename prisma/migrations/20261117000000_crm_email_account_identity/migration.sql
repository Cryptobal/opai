-- ============================================================================
-- Identidad visual de casillas Gmail (correo multicuenta v1)
-- Aditivo: color, display_label, is_default, sort_index + backfill.
-- ============================================================================

ALTER TABLE crm.email_accounts
  ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE crm.email_accounts
  ADD COLUMN IF NOT EXISTS display_label TEXT;

ALTER TABLE crm.email_accounts
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm.email_accounts
  ADD COLUMN IF NOT EXISTS sort_index INTEGER NOT NULL DEFAULT 0;

-- Paleta disponible (6 tints DS existentes). Cicla por orden de creación
-- dentro de cada (tenant_id, user_id).
WITH ranked AS (
  SELECT
    id,
    tenant_id,
    user_id,
    email,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, user_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM crm.email_accounts
),
labeled AS (
  SELECT
    id,
    tenant_id,
    user_id,
    rn,
    (ARRAY['teal','violet','rose','amber','emerald','sky'])[
      ((rn - 1) % 6) + 1
    ] AS color,
    -- Dominio → etiqueta corta (≤6). Colisiones: Gard / Gard2 / …
    LEFT(
      INITCAP(
        SPLIT_PART(
          SPLIT_PART(LOWER(email), '@', 2),
          '.',
          1
        )
      ),
      6
    ) AS base_label
  FROM ranked
),
disambiguated AS (
  SELECT
    id,
    tenant_id,
    user_id,
    rn,
    color,
    CASE
      WHEN COUNT(*) OVER (
        PARTITION BY tenant_id, user_id, base_label
      ) = 1 THEN base_label
      WHEN ROW_NUMBER() OVER (
        PARTITION BY tenant_id, user_id, base_label
        ORDER BY rn
      ) = 1 THEN base_label
      ELSE LEFT(
        base_label,
        GREATEST(
          1,
          6 - LENGTH(
            (
              ROW_NUMBER() OVER (
                PARTITION BY tenant_id, user_id, base_label
                ORDER BY rn
              )
            )::text
          )
        )
      ) || (
        ROW_NUMBER() OVER (
          PARTITION BY tenant_id, user_id, base_label
          ORDER BY rn
        )
      )::text
    END AS display_label,
    (rn = 1) AS is_default,
    (rn - 1)::integer AS sort_index
  FROM labeled
)
UPDATE crm.email_accounts ea
SET
  color = d.color,
  display_label = d.display_label,
  is_default = d.is_default,
  sort_index = d.sort_index
FROM disambiguated d
WHERE ea.id = d.id
  AND (ea.color IS NULL OR ea.display_label IS NULL);
