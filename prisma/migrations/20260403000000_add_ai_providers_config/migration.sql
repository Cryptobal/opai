-- CreateTable: ai_providers
CREATE TABLE "public"."ai_providers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL,
    "api_key" TEXT,
    "base_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ai_models
CREATE TABLE "public"."ai_models" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "provider_id" UUID NOT NULL,
    "model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "cost_tier" TEXT NOT NULL DEFAULT 'low',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_providers_provider_type_key" ON "public"."ai_providers"("provider_type");
CREATE INDEX "idx_ai_providers_type" ON "public"."ai_providers"("provider_type");
CREATE INDEX "idx_ai_providers_active" ON "public"."ai_providers"("is_active");

CREATE INDEX "idx_ai_models_provider" ON "public"."ai_models"("provider_id");
CREATE INDEX "idx_ai_models_default" ON "public"."ai_models"("is_default");
CREATE INDEX "idx_ai_models_model_id" ON "public"."ai_models"("model_id");

-- AddForeignKey
ALTER TABLE "public"."ai_models" ADD CONSTRAINT "ai_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: Providers
INSERT INTO "public"."ai_providers" ("id", "name", "provider_type", "base_url", "is_active", "updated_at")
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Anthropic', 'anthropic', 'https://api.anthropic.com', false, NOW()),
  ('a0000000-0000-0000-0000-000000000002', 'OpenAI', 'openai', 'https://api.openai.com', false, NOW()),
  ('a0000000-0000-0000-0000-000000000003', 'Google AI', 'google', 'https://generativelanguage.googleapis.com', false, NOW());

-- Seed: Models
INSERT INTO "public"."ai_models" ("id", "provider_id", "model_id", "display_name", "description", "is_default", "cost_tier", "is_active", "updated_at")
VALUES
  -- Anthropic
  (uuid_generate_v4(), 'a0000000-0000-0000-0000-000000000001', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'Rápido y económico. Ideal para tareas simples.', true, 'low', true, NOW()),
  (uuid_generate_v4(), 'a0000000-0000-0000-0000-000000000001', 'claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 'Equilibrio entre calidad y costo.', false, 'medium', true, NOW()),
  (uuid_generate_v4(), 'a0000000-0000-0000-0000-000000000001', 'claude-opus-4-5-20250918', 'Claude Opus 4.5', 'Máxima calidad. Para tareas complejas.', false, 'high', true, NOW()),
  -- OpenAI
  (uuid_generate_v4(), 'a0000000-0000-0000-0000-000000000002', 'gpt-4o-mini', 'GPT-4o Mini', 'Rápido y económico.', false, 'low', true, NOW()),
  (uuid_generate_v4(), 'a0000000-0000-0000-0000-000000000002', 'gpt-4o', 'GPT-4o', 'Alta calidad multimodal.', false, 'medium', true, NOW()),
  -- Google AI
  (uuid_generate_v4(), 'a0000000-0000-0000-0000-000000000003', 'gemini-2.0-flash', 'Gemini 2.0 Flash', 'Rápido y económico.', false, 'low', true, NOW()),
  (uuid_generate_v4(), 'a0000000-0000-0000-0000-000000000003', 'gemini-2.0-pro', 'Gemini 2.0 Pro', 'Alta calidad.', false, 'medium', true, NOW());
