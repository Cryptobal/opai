/**
 * Tenant Deletion — borra un tenant completo limpiando todas las relaciones.
 *
 * Estrategia:
 * 1. Limpiar tablas en schemas non-public (payroll, cpq, crm, ops, etc.) que
 *    tienen `tenantId` pero SIN FK formal al Tenant. Estas no cascadean.
 * 2. Limpiar relaciones con `onDelete: Restrict` (Admin, Template, Presentation).
 * 3. Borrar el Tenant — esto cascadea las relaciones con `onDelete: Cascade`.
 *
 * IRREVERSIBLE — siempre confirmar slug en el caller antes de invocar.
 *
 * El listado de tablas se generó inspeccionando prisma/schema.prisma. Si se
 * agregan modelos con tenantId sin FK al Tenant, agregar a la lista. La función
 * está diseñada para fallar suave (skip) si una tabla no existe.
 */

import { prisma } from '@/lib/prisma';

export interface DeleteTenantResult {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  deletedAt: Date;
  rowsDeleted: Record<string, number>;
}

interface OrphanTable {
  table: string; // schema-qualified, ej "ops.guardias"
  column: string; // nombre real de la columna en DB (snake o camel)
}

/**
 * Tablas con `tenantId` sin FK al Tenant. Hay 191 en total — generado por
 * auditoría del schema. Casi todas usan `tenant_id` (snake) excepto algunas
 * en public que no tienen `@map` en Prisma.
 */
const ORPHAN_TABLES: OrphanTable[] = [
  // public — UserInvitation no tiene @@map ni @map en tenantId
  { table: 'public."UserInvitation"', column: '"tenantId"' },
  { table: 'public.push_tokens', column: 'tenant_id' },
  { table: 'public.tenant_ai_providers', column: 'tenant_id' },
  { table: 'public.ai_usage_logs', column: 'tenant_id' },
  { table: 'public.notification_preferences', column: 'tenant_id' },
  { table: 'public.push_outbox', column: 'tenant_id' },
  { table: 'public.tenant_dte_configs', column: 'tenant_id' },
  { table: 'public.tenant_dte_certificates', column: 'tenant_id' },
  { table: 'public.tenant_billing_signers', column: 'tenant_id' },
  { table: 'public.tenant_dte_cafs', column: 'tenant_id' },
  { table: 'public.tenant_dte_folio_trackers', column: 'tenant_id' },

  // payroll
  { table: 'payroll.simulations', column: 'tenant_id' },
  { table: 'payroll.holidays', column: 'tenant_id' },
  { table: 'payroll.bono_catalog', column: 'tenant_id' },
  { table: 'payroll.salary_structures', column: 'tenant_id' },
  { table: 'payroll.attendance_imports', column: 'tenant_id' },
  { table: 'payroll.attendance_records', column: 'tenant_id' },
  { table: 'payroll.attendance_periods', column: 'tenant_id' },
  { table: 'payroll.anticipo_processes', column: 'tenant_id' },
  { table: 'payroll.liquidaciones', column: 'tenant_id' },
  { table: 'payroll.periods', column: 'tenant_id' },

  // cpq
  { table: 'cpq.quote_attachments', column: 'tenant_id' },
  { table: 'cpq.quotes', column: 'tenant_id' },
  { table: 'cpq.proposal_templates', column: 'tenant_id' },
  { table: 'cpq.includes_suggestions', column: 'tenant_id' },
  { table: 'cpq.cost_categories', column: 'tenant_id' },
  { table: 'cpq.puestos_trabajo', column: 'tenant_id' },
  { table: 'cpq.cargos', column: 'tenant_id' },
  { table: 'cpq.roles', column: 'tenant_id' },
  { table: 'cpq.catalog_items', column: 'tenant_id' },

  // crm — orden importa por FKs internas (hijos primero)
  { table: 'crm.email_messages', column: 'tenant_id' },
  { table: 'crm.email_threads', column: 'tenant_id' },
  { table: 'crm.email_templates', column: 'tenant_id' },
  { table: 'crm.email_signatures', column: 'tenant_id' },
  { table: 'crm.email_accounts', column: 'tenant_id' },
  { table: 'crm.email_dead_letters', column: 'tenant_id' },
  { table: 'crm.deal_quotes', column: 'tenant_id' },
  { table: 'crm.deal_stage_history', column: 'tenant_id' },
  { table: 'crm.deal_contacts', column: 'tenant_id' },
  { table: 'crm.deals', column: 'tenant_id' },
  { table: 'crm.pipeline_stages', column: 'tenant_id' },
  { table: 'crm.tasks', column: 'tenant_id' },
  { table: 'crm.notes', column: 'tenant_id' },
  { table: 'crm.history_logs', column: 'tenant_id' },
  { table: 'crm.crm_followup_logs', column: 'tenant_id' },
  { table: 'crm.crm_followup_config', column: 'tenant_id' },
  { table: 'crm.custom_field_values', column: 'tenant_id' },
  { table: 'crm.custom_fields', column: 'tenant_id' },
  { table: 'crm.file_links', column: 'tenant_id' },
  { table: 'crm.files', column: 'tenant_id' },
  { table: 'crm.document_folders', column: 'tenant_id' },
  { table: 'crm.protocol_acceptances', column: 'tenant_id' },
  { table: 'crm.exam_recurring_dispatch_runs', column: 'tenant_id' },
  { table: 'crm.portal_cliente_audit_logs', column: 'tenant_id' },
  { table: 'crm.portal_cliente_demo_data', column: 'tenant_id' },
  { table: 'crm.portal_cliente_reportes', column: 'tenant_id' },
  { table: 'crm.portal_cliente_alert_configs', column: 'tenant_id' },
  { table: 'crm.portal_access_logs', column: 'tenant_id' },
  { table: 'crm.company_presentations', column: 'tenant_id' },
  { table: 'crm.contacts', column: 'tenant_id' },
  { table: 'crm.installations', column: 'tenant_id' },
  { table: 'crm.account_personerias', column: 'tenant_id' },
  { table: 'crm.account_representantes_legales', column: 'tenant_id' },
  { table: 'crm.accounts', column: 'tenant_id' },
  { table: 'crm.leads', column: 'tenant_id' },
  { table: 'crm.notifications', column: 'tenant_id' },
  { table: 'crm.public_inquiries', column: 'tenant_id' },

  // ops — orden importa
  { table: 'ops.ops_alerta_log', column: 'tenant_id' },
  { table: 'ops.alertas_ronda', column: 'tenant_id' },
  { table: 'ops.marcacion_checkpoints', column: 'tenant_id' },
  { table: 'ops.ronda_incidentes', column: 'tenant_id' },
  { table: 'ops.marcaciones', column: 'tenant_id' },
  { table: 'ops.ronda_ejecuciones', column: 'tenant_id' },
  { table: 'ops.ronda_programaciones', column: 'tenant_id' },
  { table: 'ops.ronda_checkpoints', column: 'tenant_id' },
  { table: 'ops.ronda_templates', column: 'tenant_id' },
  { table: 'ops.checkpoint_task_responses', column: 'tenant_id' },
  { table: 'ops.checkpoint_tasks', column: 'tenant_id' },
  { table: 'ops.checkpoints', column: 'tenant_id' },
  { table: 'ops.pago_te_items', column: 'tenant_id' },
  { table: 'ops.pago_te_lotes', column: 'tenant_id' },
  { table: 'ops.refuerzo_solicitudes', column: 'tenant_id' },
  { table: 'ops.turnos_extra', column: 'tenant_id' },
  { table: 'ops.asistencia_diaria', column: 'tenant_id' },
  { table: 'ops.guard_events', column: 'tenant_id' },
  { table: 'ops.eventos_rrhh', column: 'tenant_id' },
  { table: 'ops.serie_asignaciones', column: 'tenant_id' },
  { table: 'ops.asignacion_guardias', column: 'tenant_id' },
  { table: 'ops.ops_ppc_snapshots', column: 'tenant_id' },
  { table: 'ops.pauta_mensual', column: 'tenant_id' },
  { table: 'ops.puestos_operativos', column: 'tenant_id' },
  { table: 'ops.comentarios_guardia', column: 'tenant_id' },
  { table: 'ops.guardia_history', column: 'tenant_id' },
  { table: 'ops.cuentas_bancarias', column: 'tenant_id' },
  { table: 'ops.documentos_persona', column: 'tenant_id' },
  { table: 'ops.onboarding_status', column: 'tenant_id' },
  { table: 'ops.email_logs', column: 'tenant_id' },
  { table: 'ops.email_templates', column: 'tenant_id' },
  { table: 'ops.guardia_flags', column: 'tenant_id' },
  { table: 'ops.guardias', column: 'tenant_id' },
  { table: 'ops.personas', column: 'tenant_id' },
  { table: 'ops.control_nocturno', column: 'tenant_id' },
  { table: 'ops.dispositivos_instalacion', column: 'tenant_id' },
  { table: 'ops.device_pairings', column: 'tenant_id' },
  { table: 'ops.guard_selection_logs', column: 'tenant_id' },
  { table: 'ops.patrullaje_sesiones', column: 'tenant_id' },
  { table: 'ops.monitoreo_turnos', column: 'tenant_id' },
  { table: 'ops.ops_ticket_attachments', column: 'tenant_id' },
  { table: 'ops.ops_ticket_links', column: 'tenant_id' },
  { table: 'ops.ops_ticket_csat', column: 'tenant_id' },
  { table: 'ops.ops_ticket_events', column: 'tenant_id' },
  { table: 'ops.ops_tickets', column: 'tenant_id' },
  { table: 'ops.ops_ticket_types', column: 'tenant_id' },
  { table: 'ops.visitas_tecnicas', column: 'tenant_id' },
  { table: 'ops.gamificacion_canjes', column: 'tenant_id' },
  { table: 'ops.gamificacion_beneficios', column: 'tenant_id' },
  { table: 'ops.gamificacion_desafio_participaciones', column: 'tenant_id' },
  { table: 'ops.gamificacion_desafios', column: 'tenant_id' },
  { table: 'ops.gamificacion_sugerencias_bono', column: 'tenant_id' },
  { table: 'ops.gamificacion_fondos_premio', column: 'tenant_id' },
  { table: 'ops.gamificacion_reconocimientos', column: 'tenant_id' },
  { table: 'ops.gamificacion_guardia_badges', column: 'tenant_id' },
  { table: 'ops.gamificacion_badges', column: 'tenant_id' },
  { table: 'ops.gamificacion_eventos', column: 'tenant_id' },
  { table: 'ops.gamificacion_score_guardia', column: 'tenant_id' },
  { table: 'ops.config_empresa', column: 'tenant_id' },
  { table: 'ops.alertas_cobertura', column: 'tenant_id' },
  { table: 'ops.client_onboardings', column: 'tenant_id' },
  { table: 'ops.onboarding_playbooks', column: 'tenant_id' },

  // docs
  { table: 'docs.contract_suggestions', column: 'tenant_id' },
  { table: 'docs.doc_signature_requests', column: 'tenant_id' },
  { table: 'docs.documents', column: 'tenant_id' },
  { table: 'docs.doc_templates', column: 'tenant_id' },
  { table: 'docs.doc_categories', column: 'tenant_id' },

  // finance
  { table: 'finance.finance_audit_log', column: 'tenant_id' },
  { table: 'finance.finance_dte_email_logs', column: 'tenant_id' },
  { table: 'finance.finance_dte_attachments', column: 'tenant_id' },
  { table: 'finance.finance_dte_recurring_runs', column: 'tenant_id' },
  { table: 'finance.finance_dte_recurring_template_attachments', column: 'tenant_id' },
  { table: 'finance.finance_dte_recurring_templates', column: 'tenant_id' },
  { table: 'finance.finance_dtes', column: 'tenant_id' },
  { table: 'finance.finance_pending_billable_items', column: 'tenant_id' },
  { table: 'finance.finance_suppliers', column: 'tenant_id' },
  { table: 'finance.finance_journal_entries', column: 'tenant_id' },
  { table: 'finance.finance_accounting_periods', column: 'tenant_id' },
  { table: 'finance.finance_account_plan', column: 'tenant_id' },
  { table: 'finance.finance_attachments', column: 'tenant_id' },
  { table: 'finance.finance_trips', column: 'tenant_id' },
  { table: 'finance.finance_rendiciones', column: 'tenant_id' },
  { table: 'finance.finance_cost_centers', column: 'tenant_id' },
  { table: 'finance.finance_rendicion_items', column: 'tenant_id' },
  { table: 'finance.finance_reconciliations', column: 'tenant_id' },
  { table: 'finance.finance_payment_records', column: 'tenant_id' },
  { table: 'finance.finance_cash_registers', column: 'tenant_id' },
  { table: 'finance.finance_bank_transactions', column: 'tenant_id' },
  { table: 'finance.finance_bank_transaction_links', column: 'tenant_id' },
  { table: 'finance.finance_automatch_rules', column: 'tenant_id' },
  { table: 'finance.finance_bank_account_balances', column: 'tenant_id' },
  { table: 'finance.finance_bank_accounts', column: 'tenant_id' },
  { table: 'finance.finance_factoring_operations', column: 'tenant_id' },
  { table: 'finance.finance_factoring_companies', column: 'tenant_id' },
  { table: 'finance.finance_cashflow_occurrences', column: 'tenant_id' },
  { table: 'finance.finance_cashflow_items', column: 'tenant_id' },
  { table: 'finance.finance_cashflow_category_accounts', column: 'tenant_id' },
  { table: 'finance.finance_cashflow_categories', column: 'tenant_id' },
  { table: 'finance.finance_cashflow_config', column: 'tenant_id' },

  // notes
  { table: 'notes.note_reactions', column: 'tenant_id' },
  { table: 'notes.note_read_statuses', column: 'tenant_id' },
  { table: 'notes.note_mentions', column: 'tenant_id' },
  { table: 'notes.note_entity_references', column: 'tenant_id' },
  { table: 'notes.entity_followers', column: 'tenant_id' },
  { table: 'notes.ai_context_summaries', column: 'tenant_id' },
  { table: 'notes.notes', column: 'tenant_id' },

  // chat — orden por FKs internas
  { table: 'chat.message_reactions', column: 'tenant_id' },
  { table: 'chat.mentions', column: 'tenant_id' },
  { table: 'chat.read_cursors', column: 'tenant_id' },
  { table: 'chat.messages', column: 'tenant_id' },
  { table: 'chat.channels', column: 'tenant_id' },
  { table: 'chat.notification_preferences', column: 'tenant_id' },
  { table: 'chat.push_subscriptions', column: 'tenant_id' },

  // access_control
  { table: 'access_control.access_control_denied_attempts', column: 'tenant_id' },
  { table: 'access_control.access_control_records', column: 'tenant_id' },
  { table: 'access_control.access_control_preregistrations', column: 'tenant_id' },
  { table: 'access_control.access_control_known_visitors', column: 'tenant_id' },
  { table: 'access_control.access_control_pairing_codes', column: 'tenant_id' },
  { table: 'access_control.access_control_devices', column: 'tenant_id' },
  { table: 'access_control.access_control_lists', column: 'tenant_id' },
  { table: 'access_control.access_control_report_recipients', column: 'tenant_id' },
  { table: 'access_control.access_control_configs', column: 'tenant_id' },

  // psych
  { table: 'psych.assessments', column: 'tenant_id' },
  { table: 'psych.client_contract_config', column: 'tenant_id' },
  { table: 'psych.tenant_config', column: 'tenant_id' },
];

export async function deleteTenant(tenantId: string): Promise<DeleteTenantResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} no encontrado.`);
  }

  const rowsDeleted: Record<string, number> = {};

  // 1. Limpiar tablas cross-schema sin FK al Tenant.
  // Nombres son hardcodeados arriba — sin riesgo de SQL injection.
  for (const { table, column } of ORPHAN_TABLES) {
    try {
      const count = await prisma.$executeRawUnsafe(
        `DELETE FROM ${table} WHERE ${column} = $1`,
        tenantId,
      );
      if (count > 0) rowsDeleted[table] = count;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('does not exist') || msg.includes('no existe')) {
        console.warn(`[delete-tenant] tabla ${table} no existe, skip`);
        continue;
      }
      throw e;
    }
  }

  // 2. Limpiar relaciones Restrict en public schema antes del DELETE final.
  // 3. Borrar el Tenant (cascadea las relaciones Cascade).
  await prisma.$transaction(
    async (tx) => {
      const adminCount = await tx.admin.deleteMany({ where: { tenantId } });
      if (adminCount.count > 0) rowsDeleted['public.admins'] = adminCount.count;

      const presCount = await tx.presentation.deleteMany({ where: { tenantId } });
      if (presCount.count > 0) rowsDeleted['public.presentations'] = presCount.count;

      const tmplCount = await tx.template.deleteMany({ where: { tenantId } });
      if (tmplCount.count > 0) rowsDeleted['public.templates'] = tmplCount.count;

      await tx.tenant.delete({ where: { id: tenantId } });
      rowsDeleted['public.tenants'] = 1;
    },
    { timeout: 60000 },
  );

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    deletedAt: new Date(),
    rowsDeleted,
  };
}
