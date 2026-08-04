-- Eventos unificados: etiqueta libre + all-day en fuente del listado.
ALTER TABLE public.agenda_visitas ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.agenda_visitas ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT false;

-- Backfill all_day desde agenda_event_links (solo links agenda_visita).
UPDATE public.agenda_visitas v
SET all_day = true
FROM public.agenda_event_links l
WHERE l.source_type = 'agenda_visita'
  AND l.source_id = v.id::text
  AND l.all_day = true
  AND v.all_day = false;
