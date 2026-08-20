-- Art. 22: exento de marcación de entrada/salida (jornada no sujeta a control horario).
ALTER TABLE "ops"."guardias"
  ADD COLUMN IF NOT EXISTS "is_articulo_22" BOOLEAN NOT NULL DEFAULT false;
