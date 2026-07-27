-- Preferencia de arranque post-login (superficie ERP vs Productividad).
-- Aditivo y nullable: null = sin preferencia = comportamiento actual (/hub).

ALTER TABLE "public"."admin_preference"
  ADD COLUMN "landing_surface" TEXT;
