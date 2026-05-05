-- Hot-fix DTE: agrega columnas faltantes en finance_dtes que causaban
-- P2022 en /api/finance/billing/received y /api/finance/billing/issued.
--
-- Esta migration recoge el drift acumulado entre schema.prisma y prod
-- causado por ediciones de schema aplicadas vía `prisma db push` que
-- nunca generaron archivo de migración. Aplicada manualmente contra
-- prod el 2026-05-05 vía sesión de hot-fix; resuelta con
-- `prisma migrate resolve --applied` en lugar de `migrate deploy`
-- para no re-aplicar SQL ya ejecutado.
--
-- NOTA: 3 partial indexes (idx_push_outbox_due, idx_push_outbox_group,
-- reports_public_token_key) existen en prod con WHERE clauses más
-- estrictos que el schema declarado y se mantienen así (drift benigno
-- — los partial indexes son una optimización superior).

-- AlterTable
ALTER TABLE "finance"."finance_dtes" ADD COLUMN "email_sent_at" TIMESTAMPTZ(6),
ADD COLUMN "email_status" TEXT;

-- RenameIndex
ALTER INDEX "ops"."idx_ops_ticket_comments_message_id" RENAME TO "ops_ticket_comments_message_id_key";

-- RenameForeignKey
ALTER TABLE "ops"."guardias" RENAME CONSTRAINT "ops_guardias_referred_by_admin_fk" TO "guardias_referred_by_admin_id_fkey";

-- AddForeignKey
ALTER TABLE "ai_action_log" ADD CONSTRAINT "ai_action_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_action_log" ADD CONSTRAINT "ai_action_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."exam_source_documents" ADD CONSTRAINT "exam_source_documents_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "crm"."exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."alertas_cobertura" ADD CONSTRAINT "alertas_cobertura_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "psych"."items" ADD CONSTRAINT "items_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "psych"."test_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "psych"."assessments" ADD CONSTRAINT "assessments_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "psych"."test_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "psych"."responses" ADD CONSTRAINT "responses_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "psych"."assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "psych"."results" ADD CONSTRAINT "results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "psych"."assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
