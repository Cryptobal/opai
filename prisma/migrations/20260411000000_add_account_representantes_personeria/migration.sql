-- CreateTable
CREATE TABLE IF NOT EXISTS "crm"."account_representantes_legales" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_representantes_legales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "crm"."account_personerias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "fecha_escritura" TIMESTAMP(3),
    "tipo_escritura" TEXT,
    "notaria" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_personerias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "account_representantes_legales_account_id_idx" ON "crm"."account_representantes_legales"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "account_personerias_account_id_key" ON "crm"."account_personerias"("account_id");

-- AddForeignKey
ALTER TABLE "crm"."account_representantes_legales" ADD CONSTRAINT "account_representantes_legales_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "crm"."crm_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."account_personerias" ADD CONSTRAINT "account_personerias_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "crm"."crm_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
