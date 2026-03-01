-- Protocol Sections
CREATE TABLE "crm"."protocol_sections" (
    "id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📋',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "protocol_sections_pkey" PRIMARY KEY ("id")
);

-- Protocol Items
CREATE TABLE "crm"."protocol_items" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "protocol_items_pkey" PRIMARY KEY ("id")
);

-- Protocol Documents (uploaded PDFs)
CREATE TABLE "crm"."protocol_documents" (
    "id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "storage_key" TEXT,
    "file_size" INTEGER,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "protocol_documents_pkey" PRIMARY KEY ("id")
);

-- Protocol Versions (snapshots)
CREATE TABLE "crm"."protocol_versions" (
    "id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "snapshot" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "published_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "protocol_versions_pkey" PRIMARY KEY ("id")
);

-- Exams
CREATE TABLE "crm"."exams" (
    "id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'protocol',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "schedule_type" TEXT NOT NULL DEFAULT 'manual',
    "recurring_months" INTEGER,
    "passing_score" INTEGER NOT NULL DEFAULT 60,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- Exam Questions
CREATE TABLE "crm"."exam_questions" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" TEXT NOT NULL DEFAULT 'multiple_choice',
    "options" JSONB NOT NULL,
    "correct_answer" INTEGER NOT NULL,
    "section_ref" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- Exam Assignments
CREATE TABLE "crm"."exam_assignments" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "guard_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "score" DOUBLE PRECISION,
    "answers" JSONB,
    "time_taken_secs" INTEGER,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_assignments_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "idx_protocol_section_installation" ON "crm"."protocol_sections"("installation_id");
CREATE INDEX "idx_protocol_item_section" ON "crm"."protocol_items"("section_id");
CREATE INDEX "idx_protocol_document_installation" ON "crm"."protocol_documents"("installation_id");
CREATE INDEX "idx_protocol_version_installation" ON "crm"."protocol_versions"("installation_id");
CREATE INDEX "idx_protocol_version_number" ON "crm"."protocol_versions"("installation_id", "version_number");
CREATE INDEX "idx_exam_installation" ON "crm"."exams"("installation_id");
CREATE INDEX "idx_exam_installation_status" ON "crm"."exams"("installation_id", "status");
CREATE INDEX "idx_exam_question_exam" ON "crm"."exam_questions"("exam_id");
CREATE INDEX "idx_exam_assignment_exam" ON "crm"."exam_assignments"("exam_id");
CREATE INDEX "idx_exam_assignment_guard" ON "crm"."exam_assignments"("guard_id");
CREATE INDEX "idx_exam_assignment_exam_guard" ON "crm"."exam_assignments"("exam_id", "guard_id");

-- Foreign Keys
ALTER TABLE "crm"."protocol_sections" ADD CONSTRAINT "protocol_sections_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm"."protocol_items" ADD CONSTRAINT "protocol_items_section_id_fkey"
    FOREIGN KEY ("section_id") REFERENCES "crm"."protocol_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm"."protocol_documents" ADD CONSTRAINT "protocol_documents_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm"."protocol_versions" ADD CONSTRAINT "protocol_versions_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm"."exams" ADD CONSTRAINT "exams_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm"."exam_questions" ADD CONSTRAINT "exam_questions_exam_id_fkey"
    FOREIGN KEY ("exam_id") REFERENCES "crm"."exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm"."exam_assignments" ADD CONSTRAINT "exam_assignments_exam_id_fkey"
    FOREIGN KEY ("exam_id") REFERENCES "crm"."exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm"."exam_assignments" ADD CONSTRAINT "exam_assignments_guard_id_fkey"
    FOREIGN KEY ("guard_id") REFERENCES "ops"."guardias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
