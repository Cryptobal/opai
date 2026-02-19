ALTER TABLE "cpq"."positions"
ADD COLUMN "num_puestos" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "crm"."deals"
ADD COLUMN "total_puestos" INTEGER NOT NULL DEFAULT 0;
