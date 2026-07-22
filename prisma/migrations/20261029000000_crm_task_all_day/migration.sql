-- Tarea "todo el día": distingue una tarea con hora fija de aviso de una
-- agendada solo por día (se avisa a media mañana, se muestra sin hora).
ALTER TABLE "crm"."tasks"
  ADD COLUMN IF NOT EXISTS "all_day" BOOLEAN NOT NULL DEFAULT false;
