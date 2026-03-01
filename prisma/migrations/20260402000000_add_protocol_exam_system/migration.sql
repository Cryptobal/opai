-- CreateTable: ops_protocol_sections
CREATE TABLE "ops"."ops_protocol_sections" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ops_protocol_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_protocol_items
CREATE TABLE "ops"."ops_protocol_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "section_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ops_protocol_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_protocol_versions
CREATE TABLE "ops"."ops_protocol_versions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "snapshot" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "published_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_protocol_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_protocol_documents
CREATE TABLE "ops"."ops_protocol_documents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_protocol_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_exams
CREATE TABLE "ops"."ops_exams" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'protocol',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "schedule_type" TEXT NOT NULL DEFAULT 'manual',
    "recurring_months" INTEGER,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ops_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_exam_questions
CREATE TABLE "ops"."ops_exam_questions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "exam_id" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" TEXT NOT NULL DEFAULT 'multiple_choice',
    "options" JSONB,
    "correct_answer" TEXT,
    "section_reference" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_exam_assignments
CREATE TABLE "ops"."ops_exam_assignments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "exam_id" UUID NOT NULL,
    "guard_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "score" DECIMAL(5,2),
    "answers" JSONB,
    "time_taken_seconds" INTEGER,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_exam_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ops_protocol_sections_tenant" ON "ops"."ops_protocol_sections"("tenant_id");
CREATE INDEX "idx_ops_protocol_sections_installation" ON "ops"."ops_protocol_sections"("installation_id");

CREATE INDEX "idx_ops_protocol_items_section" ON "ops"."ops_protocol_items"("section_id");
CREATE INDEX "idx_ops_protocol_items_tenant" ON "ops"."ops_protocol_items"("tenant_id");

CREATE INDEX "idx_ops_protocol_versions_tenant" ON "ops"."ops_protocol_versions"("tenant_id");
CREATE INDEX "idx_ops_protocol_versions_installation" ON "ops"."ops_protocol_versions"("installation_id");
CREATE INDEX "idx_ops_protocol_versions_install_version" ON "ops"."ops_protocol_versions"("installation_id", "version_number");

CREATE INDEX "idx_ops_protocol_documents_tenant" ON "ops"."ops_protocol_documents"("tenant_id");
CREATE INDEX "idx_ops_protocol_documents_installation" ON "ops"."ops_protocol_documents"("installation_id");

CREATE INDEX "idx_ops_exams_tenant" ON "ops"."ops_exams"("tenant_id");
CREATE INDEX "idx_ops_exams_installation" ON "ops"."ops_exams"("installation_id");
CREATE INDEX "idx_ops_exams_installation_type" ON "ops"."ops_exams"("installation_id", "type");
CREATE INDEX "idx_ops_exams_status" ON "ops"."ops_exams"("status");

CREATE INDEX "idx_ops_exam_questions_exam" ON "ops"."ops_exam_questions"("exam_id");

CREATE INDEX "idx_ops_exam_assignments_tenant" ON "ops"."ops_exam_assignments"("tenant_id");
CREATE INDEX "idx_ops_exam_assignments_exam" ON "ops"."ops_exam_assignments"("exam_id");
CREATE INDEX "idx_ops_exam_assignments_guard" ON "ops"."ops_exam_assignments"("guard_id");
CREATE INDEX "idx_ops_exam_assignments_guard_status" ON "ops"."ops_exam_assignments"("guard_id", "status");

-- AddForeignKey
ALTER TABLE "ops"."ops_protocol_sections" ADD CONSTRAINT "ops_protocol_sections_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."ops_protocol_items" ADD CONSTRAINT "ops_protocol_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "ops"."ops_protocol_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."ops_protocol_versions" ADD CONSTRAINT "ops_protocol_versions_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."ops_protocol_documents" ADD CONSTRAINT "ops_protocol_documents_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."ops_exams" ADD CONSTRAINT "ops_exams_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."ops_exam_questions" ADD CONSTRAINT "ops_exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "ops"."ops_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."ops_exam_assignments" ADD CONSTRAINT "ops_exam_assignments_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "ops"."ops_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."ops_exam_assignments" ADD CONSTRAINT "ops_exam_assignments_guard_id_fkey" FOREIGN KEY ("guard_id") REFERENCES "ops"."guardias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
