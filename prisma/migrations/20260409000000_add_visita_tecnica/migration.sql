-- CreateTable
CREATE TABLE ops.visitas_tecnicas (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "deal_id" UUID,
    "check_in_at" TIMESTAMPTZ(6),
    "check_in_lat" DOUBLE PRECISION,
    "check_in_lng" DOUBLE PRECISION,
    "check_out_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'borrador',
    "current_security_company" TEXT,
    "has_security_currently" BOOLEAN,
    "guards_needed" INTEGER,
    "guard_shift_type" TEXT,
    "guard_salary_range" TEXT,
    "requires_transport" BOOLEAN NOT NULL DEFAULT false,
    "transport_notes" TEXT,
    "requires_meals" BOOLEAN NOT NULL DEFAULT false,
    "meal_notes" TEXT,
    "requires_exams" BOOLEAN NOT NULL DEFAULT false,
    "exam_notes" TEXT,
    "requires_equipment" BOOLEAN NOT NULL DEFAULT false,
    "equipment_notes" TEXT,
    "requires_uniform" BOOLEAN NOT NULL DEFAULT false,
    "uniform_notes" TEXT,
    "additional_costs" JSONB,
    "contacts" JSONB,
    "general_report" TEXT,
    "security_risks" TEXT,
    "recommendations" TEXT,
    "photos" JSONB,
    "duration_minutes" INTEGER,
    "survey_contact_name" TEXT,
    "survey_contact_role" TEXT,
    "survey_how_did_you_hear" TEXT,
    "survey_visit_opinion" TEXT,
    "survey_expectations" TEXT,
    "survey_current_pain_points" TEXT,
    "survey_signature_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visitas_tecnicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ops_visitas_tecnicas_tenant" ON ops.visitas_tecnicas("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ops_visitas_tecnicas_user" ON ops.visitas_tecnicas("user_id");

-- CreateIndex
CREATE INDEX "idx_ops_visitas_tecnicas_installation" ON ops.visitas_tecnicas("installation_id");

-- CreateIndex
CREATE INDEX "idx_ops_visitas_tecnicas_account" ON ops.visitas_tecnicas("account_id");

-- CreateIndex
CREATE INDEX "idx_ops_visitas_tecnicas_status" ON ops.visitas_tecnicas("status");

-- CreateIndex
CREATE INDEX "idx_ops_visitas_tecnicas_created" ON ops.visitas_tecnicas("created_at" DESC);

-- AddForeignKey
ALTER TABLE ops.visitas_tecnicas ADD CONSTRAINT "visitas_tecnicas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE ops.visitas_tecnicas ADD CONSTRAINT "visitas_tecnicas_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES crm.installations("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE ops.visitas_tecnicas ADD CONSTRAINT "visitas_tecnicas_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES crm.accounts("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE ops.visitas_tecnicas ADD CONSTRAINT "visitas_tecnicas_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES crm.deals("id") ON DELETE SET NULL ON UPDATE CASCADE;
