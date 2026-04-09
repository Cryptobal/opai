-- CreateTable
CREATE TABLE "crm"."public_inquiries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "file_url" TEXT,
    "file_name" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_public_inquiries_tenant" ON "crm"."public_inquiries"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_public_inquiries_type" ON "crm"."public_inquiries"("type");

-- CreateIndex
CREATE INDEX "idx_public_inquiries_created_desc" ON "crm"."public_inquiries"("created_at" DESC);
