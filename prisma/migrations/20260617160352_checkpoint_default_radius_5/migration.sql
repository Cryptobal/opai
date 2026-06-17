-- Baja el radio de geocerca por defecto a la mínima tolerancia aceptada (5 m).
-- ADITIVO: solo cambia el DEFAULT de la columna. NO modifica checkpoints existentes.
ALTER TABLE "ops"."checkpoints" ALTER COLUMN "geo_radius_m" SET DEFAULT 5;
