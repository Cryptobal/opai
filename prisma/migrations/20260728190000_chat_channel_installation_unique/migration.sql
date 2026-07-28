-- Índice único parcial: un canal INSTALLATION activo por instalación
-- (excluye sub_type = 'interno'). Solo aplicar tras normalización (Bloque 2 --apply).
CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_one_active_per_installation
ON chat.channels (installation_id)
WHERE channel_type = 'INSTALLATION'
  AND installation_id IS NOT NULL
  AND is_active = true
  AND sub_type IS DISTINCT FROM 'interno';
