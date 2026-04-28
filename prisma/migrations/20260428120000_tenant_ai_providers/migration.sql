-- CreateTable
CREATE TABLE "public"."tenant_ai_providers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL,
    "api_key" TEXT,
    "base_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_ai_models" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "cost_tier" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_tenant_ai_provider_type" ON "public"."tenant_ai_providers"("tenant_id", "provider_type");

-- CreateIndex
CREATE INDEX "idx_tenant_ai_provider_tenant" ON "public"."tenant_ai_providers"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_tenant_ai_model_provider" ON "public"."tenant_ai_models"("provider_id");

-- AddForeignKey
ALTER TABLE "public"."tenant_ai_models" ADD CONSTRAINT "tenant_ai_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."tenant_ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
