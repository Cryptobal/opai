-- Índice único parcial: un canal INSTALLATION activo por instalación
-- (excluye sub_type = 'interno').
--
-- Antes de crear el índice, desactiva duplicados (ganador: sub_type=reportes,
-- luego mayor message_count, luego más antiguo). Sin esto migrate deploy
-- falla con P3009 si hubo canales INSTALLATION duplicados en prod.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY installation_id
      ORDER BY
        CASE WHEN sub_type = 'reportes' THEN 0 ELSE 1 END,
        message_count DESC,
        created_at ASC,
        id ASC
    ) AS rn
  FROM chat.channels
  WHERE channel_type = 'INSTALLATION'
    AND installation_id IS NOT NULL
    AND is_active = true
    AND sub_type IS DISTINCT FROM 'interno'
)
UPDATE chat.channels AS c
SET is_active = false,
    updated_at = NOW()
FROM ranked AS r
WHERE c.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_one_active_per_installation
ON chat.channels (installation_id)
WHERE channel_type = 'INSTALLATION'
  AND installation_id IS NOT NULL
  AND is_active = true
  AND sub_type IS DISTINCT FROM 'interno';
