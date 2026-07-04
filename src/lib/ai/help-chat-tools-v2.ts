/**
 * Herramientas del asistente IA — V2 (incluye CRM, Ops, Finanzas, sistema).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAssignedTeamsForUser } from "@/lib/tickets-team-membership";
import { todayChileStr } from "@/lib/fx-date";
import {
  getGuardiasMetrics,
  getPendingRendicionesForApproval,
  getUfUtmIndicators,
  searchGuardiasByNameOrRut,
} from "@/lib/ai/help-chat-tools";
import { getFileBuffer } from "@/lib/storage";
import { extractText } from "@/lib/knowledge/extract";
import {
  createLeadSchema,
  createAccountSchema,
  createContactSchema,
  createDealSchema,
  createInstallationSchema,
  updateAccountSchema,
  updateContactSchema,
  updateInstallationSchema,
} from "@/lib/validations/crm";
import { createCrmHistoryLog, computeChangedFields } from "@/lib/crm-history";
import {
  resolveStageByName,
  resolveOrCreateInstallation,
  resolveAccountByRutOrName,
  resolveQuoteByCodeOrName,
  resolveDteByFolio,
} from "@/lib/ai/help-chat-resolvers";
import { storePreview, consumePreview } from "@/lib/ai/dte-preview-cache";
import { computeDteAmounts } from "@/modules/finance/billing/dte-amounts.helper";
import {
  createDraftDte,
  type DraftDteInput,
} from "@/modules/finance/billing/dte-draft.service";
import {
  hasFacturacionCapability,
  hasCapability,
  hasModuleAccess,
  canEdit,
  canView,
  type RolePermissions,
} from "@/lib/permissions";
import { z } from "zod";
import { createOpsTicket } from "@/lib/tickets-create";
import { transitionTicketStatus } from "@/lib/tickets-transition";
import {
  claimTicket,
  addTicketComment,
  reassignTicket,
  changeTicketPriority,
} from "@/lib/tickets-mutations";
import type { TicketStatus } from "@/lib/tickets";
import { factoringCompanyInputSchema } from "@/lib/validations/factoring";
import { createFactoringCompany } from "@/modules/finance/factoring/factoring-companies.service";
import { toSentenceCase } from "@/lib/text-format";
import { isUuid } from "@/lib/utils/uuid";
import { formatWeekdaysShort } from "@/lib/cpq/weekdays";
import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";
import {
  aiTool_add_quote_position,
  aiTool_clone_quote,
  aiTool_get_quote_proposal,
  aiTool_manage_quote_includes,
  aiTool_preview_remove_quote_position,
  aiTool_preview_send_quote_proposal,
  aiTool_preview_update_quote_position,
  aiTool_remove_quote_position,
  aiTool_send_quote_proposal,
  aiTool_update_quote_margin,
  aiTool_update_quote_position,
  aiTool_update_quote_status,
} from "@/lib/ai/help-chat-cpq-ai-handlers";
export type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";

function baseToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "search_guardias",
        description: "Busca guardias por nombre, apellido, RUT o código para responder preguntas operativas puntuales.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda (nombre, RUT o código)." },
            limit: { type: "number", description: "Cantidad máxima de resultados (1-20)." },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_guardias_metrics",
        description: "Obtiene métricas agregadas de guardias del tenant actual.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_uf_utm",
        description: "Obtiene UF y UTM actuales desde la base de datos interna del sistema.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_pending_rendiciones",
        description: "Obtiene rendiciones pendientes por aprobar (del aprobador actual o de todo el tenant si tiene permiso).",
        parameters: {
          type: "object",
          properties: {
            scope: { type: "string", enum: ["mine", "all"], description: "mine: solo las mías por aprobar; all: todas las pendientes." },
            limit: { type: "number", description: "Cantidad máxima de resultados (1-20)." },
          },
          additionalProperties: false,
        },
      },
    },
  ];
}

function v2ToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "search_accounts",
        description: "Busca cuentas CRM (clientes/prospectos) por nombre o RUT; devuelve industria y conteos de instalaciones y negocios.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda." },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_deals",
        description: "Busca negocios (deals) del CRM por nombre, cuenta o etapa; incluye monto y fechas.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda (nombre del deal o cuenta)." },
            status: { type: "string", description: "Filtrar por status del deal (ej. open)." },
            limit: { type: "number" },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_deal_pipeline",
        description: "Resumen del pipeline: etapas con conteos/montos y negocios ganados/perdidos recientes (~30 días).",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_installations",
        description:
          "Busca instalaciones por nombre, dirección, ciudad o nombre del cliente (cuenta); incluye supervisor asignado si existe. Acepta filtros accountId/status. Para 'las instalaciones del cliente X' puedes llamarla directo con query: 'X'.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
            accountId: { type: "string", description: "UUID de la cuenta para listar SOLO sus instalaciones (obténlo con search_accounts)." },
            status: { type: "string", enum: ["prospect", "active", "inactive"] },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_daily_attendance",
        description: "Resumen de asistencia diaria por instalación para una fecha (PPC/TE vía snapshot y turnos extra).",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD (Chile). Omite para hoy." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_supervision_visits",
        description: "Visitas de supervisión agrupadas por supervisor y semana.",
        parameters: {
          type: "object",
          properties: {
            weeks_back: { type: "number", description: "Semanas hacia atrás (default 3)." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_rondas_status",
        description: "Estado de rondas: ejecuciones por status, programaciones activas y alertas abiertas para una fecha.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD centrado en ventana del día." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_tickets_summary",
        description: "Resumen GLOBAL de tickets Ops de TODO el sistema (NO filtra por usuario): conteos por estado, vencidos SLA y recientes. Para los tickets DE UN USUARIO usa get_my_tickets.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_my_tickets",
        description: "Tickets Ops ASIGNADOS AL USUARIO ACTUAL (a él o a sus equipos). Úsala SIEMPRE que pregunten por 'mis tickets', 'los míos', 'asignados a mí' o 'qué tengo pendiente'. NO uses get_tickets_summary para eso (esa es del sistema completo).",
        parameters: {
          type: "object",
          properties: {
            estado: { type: "string", enum: ["open", "in_progress", "waiting", "pending_approval", "resolved", "closed", "cancelled"], description: "Filtra por estado; omite para ver los activos." },
            prioridad: { type: "string", enum: ["p1", "p2", "p3", "p4"], description: "Filtra por prioridad." },
            solo_vencidos_sla: { type: "boolean", description: "Sólo tickets con SLA vencido." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_finance_summary",
        description: "Resumen financiero: rendiciones y DTEs por estado en los últimos N días.",
        parameters: {
          type: "object",
          properties: {
            days_back: { type: "number", description: "Días hacia atrás (default 30)." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_user_context",
        description: "Contexto del usuario actual: nombre, rol y plantilla de rol.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_tenant_summary",
        description: "Conteos globales del tenant: usuarios, cuentas, instalaciones, guardias, deals, tickets.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_guardia_detail",
        description:
          "Ficha completa de un guardia: datos personales (RUT, email, teléfono, dirección, fecha nacimiento, AFP, salud), datos previsionales y cuentas bancarias. Buscá por nombre/apellido/RUT/código.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre, apellido, RUT o código del guardia." },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_guardia_documents",
        description:
          "Lista los documentos de un guardia (OS10, contrato, anexos, certificados, etc.). Devuelve link directo al archivo y a la pantalla de la app. Filtrá por tipo si querés.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre, RUT o código del guardia." },
            type: {
              type: "string",
              description:
                "Filtro por tipo de documento (ej: 'OS10', 'contrato', 'anexo', 'certificado'). Opcional.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_account_detail",
        description:
          "Ficha completa de una cuenta CRM (cliente o prospecto): nombre, RUT, razón social, representante legal, dirección, web, industria, contactos principales, instalaciones.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre, razón social o RUT del cliente." },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_account_documents",
        description:
          "Lista los documentos asociados a una cuenta CRM (contratos de servicio, anexos, etc.) con link clickeable a la pantalla del documento y al PDF si existe.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre, razón social o RUT del cliente." },
            category: {
              type: "string",
              description:
                "Filtro por categoría (ej: 'contrato_servicio', 'anexo'). Opcional.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_panic_alerts",
        description:
          "Lista las alertas de pánico (botón de pánico) generadas en una fecha. Incluye instalación, guardia que la activó, mensaje, severidad y estado de resolución.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD. Omite para hoy." },
            days_back: {
              type: "number",
              description: "En vez de una fecha exacta, mira los últimos N días. Default 1 (solo hoy).",
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_daily_absences",
        description:
          "Lista guardias ausentes en una fecha (asistencia con status 'ausente' o sin check-in). Incluye instalación, puesto y nombre del guardia esperado.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD. Omite para hoy." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_extra_shifts",
        description:
          "Lista turnos extra del día con guardia, instalación, monto y estado (pending/approved/paid).",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD. Omite para hoy." },
            status: { type: "string", description: "Filtrar por estado (pending|approved|paid|rejected)." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_quotes",
        description:
          "Busca cotizaciones (CPQ) por código, nombre, cliente o estado. Devuelve link clickeable a la cotización en la app.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto a buscar (código, nombre o cliente). Opcional." },
            status: { type: "string", description: "Filtrar por estado (draft, sent, accepted, etc.). Opcional." },
            limit: { type: "number", description: "Cantidad máxima (1-25)." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_quote_detail",
        description:
          "Obtiene el detalle operativo/comercial de UNA cotización CPQ (puestos, costeo, margen, incluye lista de ítems 'incluye'). Si el usuario está en la ficha de la cotización (contexto página cpq_quote) y no pasa código, usa el ID del contexto. Usa después de search_quotes o cuando el usuario pida un resumen económico de la cotización.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: {
              type: "string",
              description:
                "Código CPQ (ej. CPQ-2026-001), texto de búsqueda o UUID. Opcional cuando hay página de cotización abierta.",
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_contacts",
        description: "Busca contactos CRM por nombre, email o cargo; incluye la cuenta asociada.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda (nombre, email o cargo)." },
            limit: { type: "number", description: "Cantidad máxima de resultados (1-20)." },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_all",
        description:
          "Búsqueda unificada: busca un término en TODAS las entidades del CRM en paralelo (cuentas, deals, cotizaciones, instalaciones, contactos y guardias). Úsala cuando el usuario escriba un nombre, código o término suelto y quieras encontrar TODO lo relacionado de una sola vez.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda." },
            limit: { type: "number", description: "Máximo de resultados por tipo (1-10). Default 5." },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_entity_documents",
        description:
          "Lista los documentos asociados a una entidad (cliente, deal, instalación, contacto). Útil cuando el usuario pide ver o resumir contratos, anexos u órdenes de un cliente. Devuelve documentId, título, categoría, estado y fecha. Para leer el contenido de un documento usa read_document.",
        parameters: {
          type: "object",
          properties: {
            entityType: {
              type: "string",
              enum: ["crm_account", "crm_deal", "crm_installation", "crm_contact"],
              description: "Tipo de entidad. Si el usuario está viendo una ficha y dice 'este cliente' / 'este deal', usa el contexto de página.",
            },
            entityId: { type: "string", description: "UUID de la entidad." },
            limit: { type: "number", description: "Máximo 20." },
          },
          required: ["entityType", "entityId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "read_document",
        description:
          "Lee el contenido de texto plano de un documento (contrato, anexo, protocolo) almacenado en OPAI. Úsalo cuando el usuario pida resumir, explicar o buscar información dentro de un documento. Devuelve título, categoría, estado y el texto completo extraído. El texto puede estar truncado a 12.000 caracteres.",
        parameters: {
          type: "object",
          properties: {
            documentId: { type: "string", description: "UUID del documento (obtenido de get_entity_documents)." },
          },
          required: ["documentId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_dtes",
        description:
          "Busca DTEs emitidos (facturas/boletas/NC/ND) por folio, RUT, nombre del receptor (razón social), nombre de la cuenta CRM (nombre de fantasía), monto exacto, rango de monto 'min-max', o período YYYY-MM. Devuelve lista paginada con datos clave (folio, fecha, receptor, accountName, monto, estado SII, estado de pago).",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Búsqueda fuzzy: folio, RUT, nombre o monto." },
            periodo: { type: "string", description: "Formato YYYY-MM para filtrar por mes." },
            status: { type: "string", enum: ["all", "draft", "issued"], description: "Default issued." },
            accountId: { type: "string" },
            installationId: { type: "string" },
            limit: { type: "number", description: "Máximo 50, default 15." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_dte_detail",
        description:
          "Obtiene el detalle completo de un DTE por folio o por id. Incluye sus notas de crédito y notas de débito asociadas (vía referencedBy). Útil para preguntas como '¿la factura 1234 tiene NC?', '¿cuándo se emitió la factura X?', '¿está pagada?'.",
        parameters: {
          type: "object",
          properties: {
            folio: { type: "number" },
            dteId: { type: "string", description: "UUID alternativo a folio." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_sales_report",
        description:
          "Reporte de ventas por cliente en un período. Retorna matriz mes×cliente con totales y subtotales. Útil para 'ventas por cliente en Q1', 'top clientes del año', 'ventas de Bauwerk en 2026'.",
        parameters: {
          type: "object",
          properties: {
            from: { type: "string", description: "Fecha inicio YYYY-MM-DD." },
            to: { type: "string", description: "Fecha fin YYYY-MM-DD." },
            periodLabel: { type: "string", description: "Etiqueta legible (ej: 'Q1 2026', 'Año 2026')." },
            crmAccountIds: { type: "array", items: { type: "string" }, description: "Filtrar por accounts." },
            installationIds: { type: "array", items: { type: "string" } },
          },
          required: ["from", "to"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_income_statement",
        description:
          "Estado de resultados (P&L) del período. Ingresos, costos, gastos, EBITDA, utilidad neta. Si withComparison=true, incluye comparación contra el período anterior.",
        parameters: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            withComparison: { type: "boolean" },
          },
          required: ["from", "to"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_balance_sheet",
        description:
          "Balance general a una fecha de corte. Activos, pasivos, patrimonio. Si withPriorMonth=true, incluye saldos del mes anterior para comparación.",
        parameters: {
          type: "object",
          properties: {
            asOf: { type: "string", description: "Fecha de corte YYYY-MM-DD." },
            withPriorMonth: { type: "boolean" },
          },
          required: ["asOf"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_finance_dashboard_kpis",
        description:
          "KPIs financieros del período: ventas totales, IVA débito/crédito, % cobranza, días promedio de pago, margen.",
        parameters: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
          },
          required: ["from", "to"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_profitability",
        description:
          "Rentabilidad por cliente/instalación: ingresos − costos directos − gastos asignados = margen. opexAllocationMethod controla cómo se asignan los OpEx a cada cliente (default by_revenue).",
        parameters: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            opexAllocationMethod: {
              type: "string",
              enum: ["by_revenue", "by_invoices_count", "none"],
            },
          },
          required: ["from", "to"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "slack_channel_context",
        description:
          "Lee las últimas ~50 mensajes de un canal de Slack para resumir o responder qué está pasando ahí. Úsala cuando te pregunten '¿qué está pasando en #canal?', 'resume #canal' o similar. No guarda nada. Si OPAI no es miembro del canal, devuelve un mensaje accionable para que lo inviten.",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string", description: "Nombre del canal (con o sin #) o su id. Omítelo solo si te refieres al canal actual." },
            limit: { type: "number", description: "Cantidad de mensajes a leer (5-100, default 50)." },
          },
          required: ["channel"],
          additionalProperties: false,
        },
      },
    },
  ];
}

function writeToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "create_lead",
        description:
          "Crea un nuevo lead/prospecto en el CRM. Usa cuando el usuario pida explícitamente crear/registrar un lead, prospecto o oportunidad nueva. Requiere al menos uno de: companyName, firstName+lastName, email o phone. Si faltan todos, pregunta al usuario antes de llamar.",
        parameters: {
          type: "object",
          properties: {
            companyName: { type: "string", description: "Razón social o nombre de la empresa." },
            firstName: { type: "string", description: "Nombre del contacto." },
            lastName: { type: "string", description: "Apellido del contacto." },
            email: { type: "string", description: "Email de contacto." },
            phone: { type: "string", description: "Teléfono de contacto (formato libre)." },
            source: { type: "string", description: "Origen del lead (ej: web, referido, evento)." },
            industry: { type: "string", description: "Industria/rubro del prospecto." },
            address: { type: "string" },
            commune: { type: "string" },
            city: { type: "string" },
            website: { type: "string" },
            serviceType: { type: "string", description: "Tipo de servicio de seguridad solicitado." },
            notes: { type: "string", description: "Notas u observaciones." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_account",
        description:
          "Crea una nueva cuenta CRM (prospecto o cliente). Usa cuando el usuario pida crear/registrar una cuenta, empresa o cliente nuevo. El campo 'name' es OBLIGATORIO. Si no lo tienes, pregunta antes de llamar.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nombre comercial de la cuenta. OBLIGATORIO." },
            type: { type: "string", enum: ["prospect", "client"], description: "Por defecto prospect." },
            rut: { type: "string", description: "RUT de la empresa." },
            legalName: { type: "string", description: "Razón social legal." },
            industry: { type: "string" },
            segment: { type: "string" },
            website: { type: "string" },
            address: { type: "string" },
            commune: { type: "string" },
            notes: { type: "string" },
          },
          required: ["name"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_contact",
        description:
          "Crea un nuevo contacto asociado a una cuenta CRM existente. Usa cuando el usuario pida agregar un contacto a una cuenta. Requiere accountId (UUID), firstName, lastName y email. Si el usuario menciona la cuenta por nombre y no por ID, llama search_accounts primero para obtener el accountId.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "UUID de la cuenta. OBTÉNLO con search_accounts si el usuario solo dio el nombre." },
            firstName: { type: "string", description: "Nombre. OBLIGATORIO." },
            lastName: { type: "string", description: "Apellido. OBLIGATORIO." },
            email: { type: "string", description: "Email. OBLIGATORIO." },
            phone: { type: "string" },
            roleTitle: { type: "string", description: "Cargo o rol del contacto." },
            isPrimary: { type: "boolean", description: "Si es contacto principal." },
          },
          required: ["accountId", "firstName", "lastName", "email"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_deal",
        description:
          "Crea un nuevo deal/oportunidad de negocio asociado a una cuenta. Requiere accountId (UUID). Si el usuario solo dio el nombre de la cuenta, llama search_accounts primero. Sugiere title si el usuario no lo provee. stageName: nombre de la etapa (ej 'Negociación', 'Propuesta') — la tool la resuelve a stageId. installationName: si lo das, vincula la instalación al deal; si no existe en este cliente, la crea automáticamente con status=prospect.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "UUID de la cuenta. OBLIGATORIO." },
            title: { type: "string", description: "Nombre del deal." },
            amount: { type: "number", description: "Monto en CLP." },
            probability: { type: "number", description: "Probabilidad 0-100." },
            expectedCloseDate: { type: "string", description: "Fecha esperada de cierre (ISO YYYY-MM-DD)." },
            stageName: { type: "string", description: "Nombre de la etapa (ej: 'Negociación', 'Propuesta'). Si no se da, usa la primera etapa activa." },
            installationName: { type: "string", description: "Nombre de la instalación a vincular o crear. Si existe en este cliente, vincula; si no existe, la crea con status=prospect." },
            installationAddress: { type: "string", description: "Dirección de la instalación (solo si installationName se va a crear)." },
            installationCommune: { type: "string", description: "Comuna de la instalación (solo si installationName se va a crear)." },
          },
          required: ["accountId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_quote",
        description:
          "Crea una cotización CPQ en estado borrador. Requiere accountId (busca con search_accounts si solo te dan nombre). Opcionalmente vincula a deal o instalación. La cotización se crea con sus 'includes' por defecto del catálogo CPQ. Genera código único CPQ-YYYY-NNN automáticamente.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "UUID de la cuenta. OBLIGATORIO." },
            name: { type: "string", description: "Nombre descriptivo de la cotización." },
            clientName: { type: "string", description: "Nombre del cliente para mostrar en el PDF (default: usa el nombre del account)." },
            dealId: { type: "string", description: "UUID del deal a vincular (opcional)." },
            installationId: { type: "string", description: "UUID de la instalación (opcional)." },
            validUntil: { type: "string", description: "Fecha de vencimiento ISO YYYY-MM-DD (default: 90 días)." },
            notes: { type: "string" },
          },
          required: ["accountId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "clone_quote",
        description:
          "Clona una cotización CPQ existente como nuevo borrador (mismo contenido económico y puestos). Requiere permiso igual que editar cotizaciones. Opcional newName.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: { type: "string", description: "Código CPQ o UUID. Opcional con página cotización abierta." },
            newName: { type: "string", description: "Nombre de la copia (default: nombre original + (copia))." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_quote_margin",
        description:
          "Actualiza el margen (%) aplicado en la cotización CPQ y recalcula el mensual desde costeo. Requiere permiso CRM quotes o CPQ.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: { type: "string", description: "Código CPQ / UUID." },
            marginPct: { type: "number", description: "Margen objetivo ej. 22.5" },
            marginMode: { type: "string", description: "Modo opcional legacy (si tenant lo usa)." },
          },
          required: ["marginPct"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_quote_status",
        description: "Actualiza estado de la cotización: draft | sent | approved | rejected.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: { type: "string", description: "Código CPQ / UUID." },
            status: { type: "string", enum: ["draft", "sent", "approved", "rejected"] },
          },
          required: ["status"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "add_quote_position",
        description:
          "Agrega uno o más puestos CPQ usando catálogo. Puede expandir patrones conocidos en coveragePattern (24/7, 5x2...) en varios slots, o modo manual weekdays+startTime+endTime.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: { type: "string" },
            coveragePattern: { type: "string", description: "Texto tipo 24x7 / 12x36 / Lun-Vie diurno; si viene, expande desde plantillas." },
            weekdays: {
              type: "array",
              items: { type: "string" },
              description: "Días Lun..Dom cuando no hay coveragePattern.",
            },
            weekdaysText: { type: "string", description: "Alternativo: 'lun-vie'" },
            startTime: { type: "string", description: "HH:MM modo manual." },
            endTime: { type: "string", description: "HH:MM modo manual." },
            numGuards: { type: "number" },
            numPuestos: { type: "number" },
            baseSalary: { type: "number", description: "Sueldo base mensual CPQ/Patrón A." },
            targetNetMonthlyLiquid: { type: "number", description: "Si el usuario dice líquido: se invierte contra payroll." },
            puestoTrabajoName: { type: "string" },
            cargoName: { type: "string" },
            rolName: { type: "string" },
            customName: { type: "string" },
            puestoLabelPrefix: { type: "string", description: "Prefijo si coveragePattern crea varios slots." },
            forceSingleSlot: { type: "boolean", description: "true = sólo primera plantilla resultado." },
            afpName: { type: "string" },
            healthSystem: { type: "string" },
            healthPlanPct: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "preview_update_quote_position",
        description:
          "PASO 1 para editar puesto: muestra vista previa + previewToken. No guarda cambios hasta update_quote_position confirmado.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: { type: "string" },
            positionId: { type: "string" },
            positionIndex: { type: "number" },
            positionNameSnippet: { type: "string" },
            weekdays: { type: "array", items: { type: "string" } },
            startTime: { type: "string" },
            endTime: { type: "string" },
            numGuards: { type: "number" },
            numPuestos: { type: "number" },
            cargoId: { type: "string" },
            rolId: { type: "string" },
            puestoTrabajoId: { type: "string" },
            cargoName: { type: "string" },
            rolName: { type: "string" },
            puestoTrabajoName: { type: "string" },
            baseSalary: { type: "number" },
            afpName: { type: "string" },
            healthSystem: { type: "string" },
            healthPlanPct: { type: "number" },
            customName: { type: "string" },
            description: { type: "string" },
            forceRecalculate: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_quote_position",
        description:
          "PASO 2: guarda cambios en un puesto. Pasa mismo patch que preview o previewToken+mismos datos (patrón DTE). Permiso igual API PATCH.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            quoteIdOrCode: { type: "string" },
            positionId: { type: "string" },
            positionIndex: { type: "number" },
            positionNameSnippet: { type: "string" },
            patch: {
              type: "object",
              description: "Objeto opcional cuando no vienes campo plano desde el modelo.",
              additionalProperties: true,
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "preview_remove_quote_position",
        description:
          "PASO 1 para borrar puesto: mismo permiso que DELETE API (solo rol CPQ con nivel eliminar/full). Preview + token.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: { type: "string" },
            positionId: { type: "string" },
            positionIndex: { type: "number" },
            positionNameSnippet: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "remove_quote_position",
        description: "PASO 2 borra posición después de preview_remove_quote_position y OK explícito del usuario.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            quoteIdOrCode: { type: "string" },
            positionId: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_quote_proposal",
        description:
          "Resume la propuesta comercial técnica (PDF) lista en CPQ sin enviar correo (totales formateados, ítems, PDF relativo API). Solo lectura.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "manage_quote_includes",
        description:
          "Lista o edita bullets 'Incluye' de la cotización (tabla quote_includes_items + sync lista quote). Permiso igual editar cotizaciones.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: { type: "string" },
            action: { type: "string", enum: ["list", "add", "remove", "toggle_show_pdf"] },
            text: { type: "string", description: "add" },
            showInPdf: { type: "boolean", description: "add o toggle_show_pdf" },
            itemId: { type: "string", description: "remove/toggle cuando ya conoces UUID" },
            textSnippet: { type: "string", description: "remove/toggle texto único" },
          },
          required: ["action"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "preview_send_quote_proposal",
        description:
          "PASO 1 envío cotización/PIN portal: valida cuenta+deal+email y devuelve resumen sin enviar correo/whatsapp. Acción delicada igual facturación.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: { type: "string" },
            recipientContactId: { type: "string", description: "UUID contacto mismo account; opcional usa contacto cotización." },
            includeProposalPdf: { type: "boolean" },
            includeQuotationPdf: { type: "boolean" },
            attachmentIds: { type: "array", items: { type: "string" } },
            ccContactIds: { type: "array", items: { type: "string" } },
            ccEmails: { type: "array", items: { type: "string" } },
            bccEmails: { type: "array", items: { type: "string" } },
            emailSubject: { type: "string" },
            followUpTargetStageId: { type: "string", description: "UUID pipeline stage opcional para seguimiento post envío." },
            followUpInclude: { type: "boolean", description: "Por defecto true si viene stage." },
            followUpSkipAll: { type: "boolean", description: "skipAll del motor follow-up igual UI." },
            previewEmailDraft: { type: "string", description: "Solo muestra snippet informativo — no cambia backend aún." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "send_quote_proposal",
        description:
          "PASO 2: ejecuta envío igual send-portal después de preview_send_quote_proposal y confirmación usuario. Mantén mismo payload + previewToken opcional.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            quoteIdOrCode: { type: "string" },
            recipientContactId: { type: "string" },
            includeProposalPdf: { type: "boolean" },
            includeQuotationPdf: { type: "boolean" },
            attachmentIds: { type: "array", items: { type: "string" } },
            ccContactIds: { type: "array", items: { type: "string" } },
            ccEmails: { type: "array", items: { type: "string" } },
            bccEmails: { type: "array", items: { type: "string" } },
            emailSubject: { type: "string" },
            followUpTargetStageId: { type: "string" },
            followUpInclude: { type: "boolean" },
            followUpSkipAll: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_installation",
        description:
          "Crea una nueva instalación CRM asociada a una cuenta. Requiere accountId (UUID) y name. Si el usuario solo dio el nombre del cliente, llama search_accounts/search_all primero. Status default 'prospect' (la activación viene cuando hay contrato firmado).",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "UUID de la cuenta. OBTÉNLO con search_accounts si el usuario solo dio el nombre." },
            name: { type: "string", description: "Nombre de la instalación. OBLIGATORIO." },
            address: { type: "string" },
            city: { type: "string" },
            commune: { type: "string" },
            status: { type: "string", enum: ["prospect", "active", "inactive"], description: "Default prospect." },
            notes: { type: "string" },
            teMontoClp: { type: "number", description: "Monto base de turnos extra en CLP." },
          },
          required: ["accountId", "name"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_account",
        description:
          "Actualiza una cuenta CRM existente. Requiere id (UUID). Si el usuario menciona la cuenta por nombre, llama search_accounts primero para obtener el id real. Pasa SOLO los campos que el usuario pidió cambiar — patch parcial. NUNCA inventes UUIDs.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "UUID de la cuenta. OBLIGATORIO." },
            name: { type: "string", description: "Nombre comercial." },
            type: { type: "string", enum: ["prospect", "client"] },
            rut: { type: "string" },
            legalName: { type: "string", description: "Razón social." },
            legalRepresentativeName: { type: "string" },
            legalRepresentativeRut: { type: "string" },
            industry: { type: "string" },
            giro: { type: "string", description: "Giro/actividad económica SII." },
            segment: { type: "string" },
            status: { type: "string", enum: ["prospect", "client_active", "client_inactive", "active", "inactive"] },
            isActive: { type: "boolean" },
            website: { type: "string" },
            address: { type: "string" },
            commune: { type: "string" },
            city: { type: "string" },
            notes: { type: "string" },
          },
          required: ["id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_contact",
        description:
          "Actualiza un contacto CRM existente. Requiere id (UUID). Si el usuario menciona el contacto por nombre, llama search_contacts primero (incluye el nombre de la cuenta para desambiguar cuando hay varios). Patch parcial: solo pasa los campos que cambian. Útil para actualizar cargo (roleTitle), email, teléfono, marcar como contacto principal, o moverlo a otra cuenta (accountId).",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "UUID del contacto. OBLIGATORIO." },
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            roleTitle: { type: "string", description: "Cargo o rol (ej: 'Administrador de Contrato', 'Jefe de Terreno')." },
            isPrimary: { type: "boolean", description: "Si pasa a ser contacto principal de la cuenta." },
            accountId: { type: "string", description: "Solo si se quiere mover el contacto a otra cuenta. UUID válido del tenant." },
          },
          required: ["id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_lead",
        description:
          "Actualiza un lead/prospecto existente. Requiere id (UUID). Si el usuario lo menciona por nombre/empresa, llama search_all primero (los leads aparecen en la búsqueda general). Patch parcial: solo pasa los campos que cambian. No usar para aprobar/rechazar leads (esos tienen tools dedicadas en el módulo CRM).",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "UUID del lead. OBLIGATORIO." },
            companyName: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            source: { type: "string" },
            industry: { type: "string" },
            address: { type: "string" },
            commune: { type: "string" },
            city: { type: "string" },
            website: { type: "string" },
            serviceType: { type: "string" },
            notes: { type: "string" },
            status: { type: "string", enum: ["pending", "in_review", "approved", "rejected"] },
          },
          required: ["id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_deal",
        description:
          "Actualiza un deal/negocio existente. Requiere id (UUID). Patch parcial: solo pasa los campos que cambian. Para cambiar de etapa puedes pasar stageId (UUID) o stageName (la tool lo resuelve). NO uses esta tool para vincular cotizaciones (usa las tools CPQ específicas).",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "UUID del deal. OBLIGATORIO." },
            title: { type: "string" },
            amount: { type: "number", description: "Monto en CLP." },
            probability: { type: "number", description: "0-100." },
            expectedCloseDate: { type: "string", description: "ISO YYYY-MM-DD." },
            stageId: { type: "string", description: "UUID de la etapa." },
            stageName: { type: "string", description: "Nombre de la etapa (la tool la resuelve a id). Alternativa a stageId." },
            primaryContactId: { type: "string", description: "UUID del contacto principal." },
            proposalLink: { type: "string", description: "URL externa de propuesta." },
          },
          required: ["id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_installation",
        description:
          "Actualiza una instalación CRM existente. Requiere id (UUID). Si el usuario la menciona por nombre, llama search_installations primero. Patch parcial: solo pasa los campos que cambian. Para cambiar status a 'inactive' confirma con el usuario primero — implica afectar pauta y costos.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "UUID de la instalación. OBLIGATORIO." },
            name: { type: "string" },
            address: { type: "string" },
            city: { type: "string" },
            commune: { type: "string" },
            lat: { type: "number" },
            lng: { type: "number" },
            status: { type: "string", enum: ["prospect", "active", "inactive"] },
            geoRadiusM: { type: "number", description: "Radio del geofence en metros (10-1000)." },
            teMontoClp: { type: "number", description: "Monto base TE en CLP." },
            notes: { type: "string" },
            nocturnoEnabled: { type: "boolean" },
            chatEnabled: { type: "boolean" },
          },
          required: ["id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "preview_invoice_draft",
        description:
          "PASO 1 (obligatorio antes de crear). Calcula los montos de un borrador de factura SIN persistir nada. Devuelve neto, IVA, total + previewToken (vence en 5 min). Soporta factura tipo 33 (afecta), 34 (exenta) y boleta 39. Líneas con cantidad y precio unitario en CLP. El receptor se identifica por RUT, por nombre del cliente CRM (lo busca con resolveAccount) o por RUT+nombre explícitos.",
        parameters: {
          type: "object",
          properties: {
            dteType: { type: "number", enum: [33, 34, 39], description: "33=Factura afecta, 34=Factura exenta, 39=Boleta." },
            receiverNameOrRut: { type: "string", description: "Nombre del cliente o RUT para resolver desde CRM." },
            receiverRut: { type: "string", description: "RUT explícito del receptor (si no está en CRM)." },
            receiverName: { type: "string", description: "Razón social explícita del receptor (si no está en CRM)." },
            receiverEmail: { type: "string" },
            installationId: { type: "string", description: "UUID instalación (cost center)." },
            currency: { type: "string", enum: ["CLP", "UF"], description: "Default CLP." },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  itemName: { type: "string" },
                  quantity: { type: "number" },
                  unitPrice: { type: "number", description: "Precio unitario CLP (sin IVA si afecta, total si exento)." },
                  isExempt: { type: "boolean" },
                  discountPct: { type: "number" },
                },
                required: ["itemName", "quantity", "unitPrice"],
              },
              minItems: 1,
            },
            notes: { type: "string" },
            additionalReferences: {
              type: "array",
              description: "Referencias adicionales del DTE (NO la referencia principal SII de NC/ND): orden de compra, HES, contrato, resolución, guía, etc. El usuario suele decir 'según OC 1234', 'contrato CT-9', 'HES 555'. Si menciona una, agrégala acá.",
              items: {
                type: "object",
                properties: {
                  tipoDocRef: {
                    type: "string",
                    description: "Tipo de documento referenciado: 'OC' (orden de compra), 'HES', 'Contrato', 'Resolución', 'Guía', 'OT' (orden de trabajo), o el código SII numérico si lo conoces (33, 34, 52, 56, 61, 801=OC, 802=HES, etc.).",
                  },
                  folioRef: {
                    type: "string",
                    description: "Número/folio/código del documento referenciado (ej: '1234', 'CT-9', 'HES-555').",
                  },
                  fchRef: {
                    type: "string",
                    description: "Fecha del documento referenciado en YYYY-MM-DD. Si el usuario no la menciona, usa la fecha de hoy.",
                  },
                  razonRef: {
                    type: "string",
                    description: "Texto libre describiendo la referencia (opcional). Ej: 'Servicios mes octubre', 'Trabajo terminado'.",
                  },
                },
                required: ["tipoDocRef", "folioRef", "fchRef"],
              },
              maxItems: 40,
            },
          },
          required: ["dteType", "lines"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_invoice_draft",
        description:
          "PASO 2 (después de preview_invoice_draft Y confirmación del usuario). Crea el borrador de factura. IMPORTANTE: SIEMPRE pasa los MISMOS args que usaste en preview_invoice_draft (dteType, receiverNameOrRut/Rut/Name, lines, etc.). Si tienes el previewToken a mano, pásalo también — la tool intentará usar el cache; si expiró o se reinició, recomputa desde los args. Esto hace el flujo robusto a serverless cold starts.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string", description: "Token devuelto por preview_invoice_draft (opcional, best-effort). Si está vencido o el cache se reinició, los args completos hacen el trabajo." },
            dteType: { type: "number", enum: [33, 34, 39], description: "33=Factura afecta, 34=Factura exenta, 39=Boleta." },
            receiverNameOrRut: { type: "string", description: "Nombre del cliente o RUT para resolver desde CRM." },
            receiverRut: { type: "string", description: "RUT explícito del receptor (si no está en CRM)." },
            receiverName: { type: "string", description: "Razón social explícita del receptor (si no está en CRM)." },
            receiverEmail: { type: "string" },
            installationId: { type: "string", description: "UUID instalación (cost center)." },
            currency: { type: "string", enum: ["CLP", "UF"], description: "Default CLP." },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  itemName: { type: "string" },
                  quantity: { type: "number" },
                  unitPrice: { type: "number" },
                  isExempt: { type: "boolean" },
                  discountPct: { type: "number" },
                },
                required: ["itemName", "quantity", "unitPrice"],
              },
              minItems: 1,
            },
            notes: { type: "string" },
            additionalReferences: {
              type: "array",
              description: "Igual al campo de preview_invoice_draft. Pasa los MISMOS valores que usaste en el preview.",
              items: {
                type: "object",
                properties: {
                  tipoDocRef: { type: "string" },
                  folioRef: { type: "string" },
                  fchRef: { type: "string" },
                  razonRef: { type: "string" },
                },
                required: ["tipoDocRef", "folioRef", "fchRef"],
              },
              maxItems: 40,
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "preview_credit_note_draft",
        description:
          "PASO 1 (obligatorio). Calcula montos de una NC borrador SIN persistir. La NC debe referenciar un DTE original (factura/boleta emitida). El usuario puede dar el folio de la factura (recomendado) o el ID. referenceCode: 1=anula totalmente, 2=corrige texto, 3=corrige montos.",
        parameters: {
          type: "object",
          properties: {
            referenceFolio: { type: "number", description: "Folio del DTE original. Si lo das, la tool lo resuelve." },
            referenceDteId: { type: "string", description: "UUID del DTE original (alternativa a referenceFolio)." },
            referenceCode: { type: "number", enum: [1, 2, 3], description: "1=anula, 2=corrige texto, 3=corrige montos. Default 1." },
            reason: { type: "string", description: "Razón de la NC. OBLIGATORIA." },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  itemName: { type: "string" },
                  quantity: { type: "number" },
                  unitPrice: { type: "number" },
                  isExempt: { type: "boolean" },
                },
                required: ["itemName", "quantity", "unitPrice"],
              },
              minItems: 1,
              description: "Líneas de la NC. Si referenceCode=1 (anula), suelen ser idénticas a las del DTE original.",
            },
          },
          required: ["reason", "lines"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_credit_note_draft",
        description:
          "PASO 2 (después de preview_credit_note_draft Y confirmación). Crea el borrador de NC. SIEMPRE pasa los MISMOS args usados en el preview (referenceFolio, reason, lines, referenceCode); el previewToken es opcional y se usa como fast-path.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string", description: "Opcional. Token devuelto por preview_credit_note_draft." },
            referenceFolio: { type: "number" },
            referenceDteId: { type: "string" },
            referenceCode: { type: "number", enum: [1, 2, 3] },
            reason: { type: "string" },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  itemName: { type: "string" },
                  quantity: { type: "number" },
                  unitPrice: { type: "number" },
                  isExempt: { type: "boolean" },
                },
                required: ["itemName", "quantity", "unitPrice"],
              },
              minItems: 1,
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "preview_debit_note_draft",
        description:
          "PASO 1. Calcula montos de una ND (tipo 56) SIN persistir. Requiere referencia a DTE original (folio o ID) y razón. Útil para cobrar intereses por mora, recargos, o ampliación de monto.",
        parameters: {
          type: "object",
          properties: {
            referenceFolio: { type: "number" },
            referenceDteId: { type: "string" },
            reason: { type: "string", description: "Razón de la ND. OBLIGATORIA." },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  itemName: { type: "string" },
                  quantity: { type: "number" },
                  unitPrice: { type: "number" },
                  isExempt: { type: "boolean" },
                },
                required: ["itemName", "quantity", "unitPrice"],
              },
              minItems: 1,
            },
          },
          required: ["reason", "lines"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_debit_note_draft",
        description:
          "PASO 2 (después de preview_debit_note_draft Y confirmación). Crea el borrador de ND. SIEMPRE pasa los MISMOS args usados en el preview (referenceFolio, reason, lines); el previewToken es opcional y se usa como fast-path.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string", description: "Opcional. Token devuelto por preview_debit_note_draft." },
            referenceFolio: { type: "number" },
            referenceDteId: { type: "string" },
            reason: { type: "string" },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  itemName: { type: "string" },
                  quantity: { type: "number" },
                  unitPrice: { type: "number" },
                  isExempt: { type: "boolean" },
                },
                required: ["itemName", "quantity", "unitPrice"],
              },
              minItems: 1,
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "preview_recurring_invoice",
        description:
          "PASO 1. Crea un PREVIEW (sin persistir) de plantilla de facturación recurrente. Calcula la primera fecha de ejecución y montos estimados. Solo soporta tipo 33 (afecta) y 34 (exenta). Frequency: 'monthly' (con dayOfMonth 1-31 o -1 para último), 'weekly'/'biweekly' (con dayOfWeek 0=Domingo..6=Sábado), 'yearly' (con monthOfYear 1-12 + dayOfMonth).",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nombre interno de la plantilla. OBLIGATORIO." },
            dteType: { type: "number", enum: [33, 34] },
            receiverNameOrRut: { type: "string" },
            receiverRut: { type: "string" },
            receiverName: { type: "string" },
            installationId: { type: "string" },
            currency: { type: "string", enum: ["CLP", "UF"] },
            frequency: { type: "string", enum: ["monthly", "biweekly", "weekly", "yearly"] },
            dayOfMonth: { type: "number", description: "1-31 o -1 para último día (monthly/yearly)." },
            dayOfWeek: { type: "number", description: "0=Domingo .. 6=Sábado (weekly/biweekly)." },
            monthOfYear: { type: "number", description: "1-12 (yearly)." },
            startDate: { type: "string", description: "YYYY-MM-DD. OBLIGATORIO." },
            endDate: { type: "string", description: "YYYY-MM-DD opcional." },
            ufFixingPolicy: {
              type: "string",
              enum: ["RUN_DAY", "LAST_DAY_PREV_MONTH", "FIRST_DAY_MONTH", "LAST_DAY_MONTH", "CUSTOM_DAY"],
              description: "Solo si currency=UF. Default RUN_DAY.",
            },
            ufFixingDay: { type: "number", description: "Día 1-31 si ufFixingPolicy=CUSTOM_DAY." },
            periodPolicy: {
              type: "string",
              enum: ["CURRENT_MONTH", "PREVIOUS_MONTH", "NEXT_MONTH"],
              description: "Resolución del placeholder {{periodo}}. Default CURRENT_MONTH.",
            },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  itemName: { type: "string" },
                  quantity: { type: "number" },
                  unitPrice: { type: "number" },
                  unitPriceUf: { type: "number" },
                  isExempt: { type: "boolean" },
                  discountPct: { type: "number" },
                },
                required: ["itemName", "quantity"],
              },
              minItems: 1,
            },
            notes: { type: "string" },
            autoSendEmail: { type: "boolean", description: "Default true." },
            additionalReferences: {
              type: "array",
              description: "Referencias adicionales del DTE (OC, HES, contrato, resolución, etc.). Se aplicarán a CADA borrador que genere la plantilla. Soporta placeholders en folioRef y razonRef como {{periodo}} (mes-año del run).",
              items: {
                type: "object",
                properties: {
                  tipoDocRef: { type: "string" },
                  folioRef: { type: "string" },
                  fchRef: { type: "string", description: "YYYY-MM-DD. Si quieres que sea la fecha del run, usa el placeholder o déjalo en blanco." },
                  razonRef: { type: "string" },
                },
                required: ["tipoDocRef", "folioRef", "fchRef"],
              },
              maxItems: 40,
            },
          },
          required: ["name", "dteType", "frequency", "startDate", "lines"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_recurring_invoice",
        description:
          "PASO 2 (después de preview_recurring_invoice Y confirmación). Crea la plantilla recurrente persistente usando el previewToken.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
          },
          required: ["previewToken"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_factoring_company",
        description:
          "Crea una empresa de factoring en el catálogo (sin preview, no genera DTEs). Requiere name (razón social) y rut. Falla con mensaje claro si ya existe una empresa con el mismo RUT.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            rut: { type: "string" },
            executiveName: { type: "string" },
            executiveEmail: { type: "string" },
            executivePhone: { type: "string" },
            defaultAdvanceRate: { type: "number", description: "Tasa de anticipo % default (0-100)." },
            defaultInterestRate: { type: "number", description: "Tasa de interés mensual % default (0-100)." },
            defaultCommissionAmount: { type: "number", description: "Comisión default en CLP (monto fijo). Ej: 15000." },
            notes: { type: "string" },
          },
          required: ["name", "rut"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_ticket",
        description:
          "Crea un ticket OPS. Requiere title. Si el usuario menciona instalación o guardia por nombre, llama search_installations / search_guardias primero para obtener el id. Si no viene ticketTypeId, se usa el primer tipo activo del tenant.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Asunto del ticket. OBLIGATORIO." },
            description: { type: "string" },
            ticketTypeId: { type: "string", description: "UUID del tipo de ticket (opcional)." },
            priority: { type: "string", enum: ["p1", "p2", "p3", "p4"] },
            assignedTeam: { type: "string", description: "Equipo asignado (ej: ops, postventa, it_admin)." },
            assignedTo: { type: "string", description: "UUID del admin responsable (opcional)." },
            installationId: { type: "string" },
            guardiaId: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["title"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "transition_ticket",
        description: "Cambia el estado de un ticket OPS según la máquina de estados. Identifica por ticketId (UUID) o code (TK-…).",
        parameters: {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            code: { type: "string", description: "Código TK-1234." },
            targetStatus: {
              type: "string",
              enum: ["pending_approval", "open", "in_progress", "waiting", "resolved", "closed", "rejected", "cancelled"],
            },
          },
          required: ["targetStatus"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "take_ticket",
        description: "Toma un ticket sin responsable asignándolo al usuario actual. Identifica por ticketId o code.",
        parameters: {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            code: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "comment_ticket",
        description: "Agrega un comentario público a un ticket. Identifica por ticketId o code.",
        parameters: {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            code: { type: "string" },
            body: { type: "string", description: "Texto del comentario. OBLIGATORIO." },
          },
          required: ["body"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "reassign_ticket",
        description: "Reasigna responsable y/o equipo de un ticket. Identifica por ticketId o code.",
        parameters: {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            code: { type: "string" },
            assignedTo: { type: "string", description: "UUID del admin responsable; null para desasignar." },
            assignedTeam: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "change_ticket_priority",
        description: "Cambia la prioridad de un ticket (p1–p4). Identifica por ticketId o code.",
        parameters: {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            code: { type: "string" },
            priority: { type: "string", enum: ["p1", "p2", "p3", "p4"] },
          },
          required: ["priority"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "preview_bulk_update_installations",
        description:
          "Lista (máx 50) instalaciones que cambiarían al status destino, excluyendo las que ya lo tienen. Filtra por accountId y/o query en nombre/cuenta. Paso 1 antes de bulk_update_installations.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "UUID de cuenta CRM." },
            query: { type: "string", description: "Texto en nombre de instalación o cuenta." },
            status: { type: "string", enum: ["prospect", "active", "inactive"], description: "Status destino." },
          },
          required: ["status"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "bulk_update_installations",
        description:
          "PASO 2 (tras preview_bulk_update_installations y confirmación). Actualiza en lote el status de instalaciones (máx 50). Mismos filtros que el preview.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            query: { type: "string" },
            status: { type: "string", enum: ["prospect", "active", "inactive"] },
          },
          required: ["status"],
          additionalProperties: false,
        },
      },
    },
  ];
}

/**
 * Mapa explícito preview_* → tool de escritura real (patrón preview/confirm).
 * Fuente única de verdad para transportes externos (Slack) que muestran la
 * vista previa como tarjeta y ejecutan la escritura al confirmar. Evita duplicar
 * strings sueltos por el código.
 */
export const PREVIEW_TO_CONFIRM: Record<string, { confirmToolName: string; label: string }> = {
  preview_invoice_draft: { confirmToolName: "create_invoice_draft", label: "Crear borrador de factura" },
  preview_credit_note_draft: { confirmToolName: "create_credit_note_draft", label: "Crear nota de crédito" },
  preview_debit_note_draft: { confirmToolName: "create_debit_note_draft", label: "Crear nota de débito" },
  preview_recurring_invoice: { confirmToolName: "create_recurring_invoice", label: "Crear plantilla de facturación recurrente" },
  preview_send_quote_proposal: { confirmToolName: "send_quote_proposal", label: "Enviar propuesta de cotización" },
  preview_update_quote_position: { confirmToolName: "update_quote_position", label: "Actualizar puesto de la cotización" },
  preview_remove_quote_position: { confirmToolName: "remove_quote_position", label: "Eliminar puesto de la cotización" },
  preview_bulk_update_installations: { confirmToolName: "bulk_update_installations", label: "Actualizar instalaciones en lote" },
};

/**
 * Tools que persisten/mutan datos. En transportes externos (Slack) NUNCA se
 * ejecutan directas: se difieren a una tarjeta de confirmación. Etiqueta en
 * español para el resumen de la tarjeta. Las `preview_*` NO son escrituras.
 */
export const WRITE_TOOL_LABELS: Record<string, string> = {
  create_lead: "Crear lead",
  create_account: "Crear cuenta / cliente",
  create_contact: "Crear contacto",
  create_deal: "Crear deal",
  create_installation: "Crear instalación",
  update_account: "Actualizar cuenta",
  update_contact: "Actualizar contacto",
  update_lead: "Actualizar lead",
  update_deal: "Actualizar deal",
  update_installation: "Actualizar instalación",
  create_quote: "Crear cotización",
  clone_quote: "Clonar cotización",
  update_quote_margin: "Actualizar margen de la cotización",
  update_quote_status: "Actualizar estado de la cotización",
  add_quote_position: "Agregar puesto a la cotización",
  update_quote_position: "Actualizar puesto de la cotización",
  remove_quote_position: "Eliminar puesto de la cotización",
  manage_quote_includes: "Modificar los incluidos de la cotización",
  send_quote_proposal: "Enviar propuesta de cotización",
  create_invoice_draft: "Crear borrador de factura",
  create_credit_note_draft: "Crear nota de crédito",
  create_debit_note_draft: "Crear nota de débito",
  create_recurring_invoice: "Crear plantilla de facturación recurrente",
  create_factoring_company: "Crear empresa de factoring",
  create_ticket: "Crear ticket",
  transition_ticket: "Cambiar estado de ticket",
  take_ticket: "Tomar ticket",
  comment_ticket: "Comentar ticket",
  reassign_ticket: "Reasignar ticket",
  change_ticket_priority: "Cambiar prioridad de ticket",
  bulk_update_installations: "Actualizar instalaciones en lote",
};

/** Descripción humana corta de una escritura diferida para la tarjeta de Slack. */
export function describeWriteArgs(toolName: string, args: Record<string, unknown>): string {
  const label = WRITE_TOOL_LABELS[toolName] ?? toolName;
  if (toolName === "bulk_update_installations") {
    const status = args.status ?? "?";
    const scope =
      typeof args.accountId === "string" && args.accountId
        ? `cuenta ${args.accountId.slice(0, 8)}…`
        : typeof args.query === "string" && args.query
          ? `"${String(args.query).slice(0, 40)}"`
          : "instalaciones";
    return `${label} · ${scope} → ${status}`;
  }
  const name = [args.name, args.title, args.companyName, args.code]
    .find((v): v is string => typeof v === "string" && !!v.trim());
  const fields = Object.entries(args)
    .filter(([k, v]) => k !== "id" && v !== undefined && v !== null && typeof v !== "object")
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`);
  const detail = [name, fields.join(", ")].filter(Boolean).join(" → ");
  return detail ? `${label} · ${detail}`.slice(0, 140) : label;
}

/** Tools que viven en la sección de escritura pero son de LECTURA (no diferir). */
const WRITE_SECTION_READ_ONLY: ReadonlySet<string> = new Set(["get_quote_proposal"]);

/**
 * Nombres de todas las tools de escritura, DERIVADO de `writeToolDefinitions()`
 * para que ningún write nuevo escape al diferido en transportes externos
 * (Slack). Excluye las `preview_*` (solo calculan, no persisten) y las lecturas
 * de la sección. `WRITE_TOOL_LABELS` queda solo para el texto de la tarjeta.
 */
export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(
  writeToolDefinitions()
    .map((d) => d.function.name)
    .filter((n) => !n.startsWith("preview_") && !WRITE_SECTION_READ_ONLY.has(n)),
);

export function getToolDefinitionsV2(allowDataQuestions: boolean, allowWrites: boolean = false) {
  if (!allowDataQuestions) return [];
  const reads = [...baseToolDefinitions(), ...v2ToolDefinitions()];
  return allowWrites ? [...reads, ...writeToolDefinitions()] : reads;
}

async function executeLegacyTool(
  toolName: string,
  args: Record<string, unknown>,
  tenantId: string,
  userId: string,
  canViewAllRendiciones: boolean,
): Promise<unknown> {
  if (toolName === "search_guardias") {
    const query = typeof args.query === "string" ? args.query : "";
    const limit = typeof args.limit === "number" ? args.limit : 8;
    try {
      return { ok: true, data: await searchGuardiasByNameOrRut(tenantId, query, limit) };
    } catch {
      return { ok: false, error: "No fue posible consultar guardias en este momento." };
    }
  }
  if (toolName === "get_guardias_metrics") {
    try {
      return { ok: true, data: await getGuardiasMetrics(tenantId) };
    } catch {
      return { ok: false, error: "No fue posible consultar métricas en este momento." };
    }
  }
  if (toolName === "get_uf_utm") {
    try {
      return { ok: true, data: await getUfUtmIndicators() };
    } catch {
      return { ok: false, error: "No fue posible consultar UF/UTM en este momento." };
    }
  }
  if (toolName === "get_pending_rendiciones") {
    const scope = args.scope === "all" && canViewAllRendiciones ? "all" : "mine";
    const limit = typeof args.limit === "number" ? args.limit : 8;
    try {
      return {
        ok: true,
        data: await getPendingRendicionesForApproval({ tenantId, userId, includeAll: scope === "all", limit }),
      };
    } catch {
      return { ok: false, error: "No fue posible consultar rendiciones pendientes en este momento." };
    }
  }
  return null;
}

async function toolSearchAccounts(tenantId: string, query: string, limit: number) {
  const q = query.trim();
  const take = Math.max(1, Math.min(limit || 10, 20));
  const where: Prisma.CrmAccountWhereInput = { tenantId };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { legalName: { contains: q, mode: "insensitive" } },
      { rut: { contains: q, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.crmAccount.findMany({
    where,
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      industry: true,
      status: true,
      type: true,
      _count: { select: { installations: true, deals: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    industry: r.industry,
    status: r.status,
    type: r.type,
    installations: r._count.installations,
    deals: r._count.deals,
    url: `/crm/accounts/${r.id}`,
  }));
}

async function toolSearchDeals(tenantId: string, query: string | undefined, status: string | undefined, limit: number) {
  const take = Math.max(1, Math.min(limit || 12, 25));
  const where: Prisma.CrmDealWhereInput = { tenantId };
  if (status) where.status = status;
  const q = (query || "").trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { account: { name: { contains: q, mode: "insensitive" } } },
      { account: { legalName: { contains: q, mode: "insensitive" } } },
    ];
  }
  const rows = await prisma.crmDeal.findMany({
    where,
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      amount: true,
      status: true,
      expectedCloseDate: true,
      updatedAt: true,
      account: { select: { name: true } },
      stage: { select: { name: true, isClosedWon: true, isClosedLost: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    amount: Number(r.amount),
    status: r.status,
    accountName: r.account.name,
    stageName: r.stage.name,
    stageClosedWon: r.stage.isClosedWon,
    stageClosedLost: r.stage.isClosedLost,
    expectedClose: r.expectedCloseDate?.toISOString().slice(0, 10) ?? null,
    updatedAt: r.updatedAt.toISOString(),
    url: `/crm/deals/${r.id}`,
  }));
}

async function toolGetDealPipeline(tenantId: string) {
  const stages = await prisma.crmPipelineStage.findMany({
    where: { tenantId, isActive: true },
    orderBy: { order: "asc" },
    select: { id: true, name: true, color: true, isClosedWon: true, isClosedLost: true },
  });
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [dealsByStage, wonLast30, lostLast30] = await Promise.all([
    prisma.crmDeal.groupBy({
      by: ["stageId"],
      where: { tenantId },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.crmDeal.aggregate({
      where: { tenantId, updatedAt: { gte: since }, stage: { isClosedWon: true } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.crmDeal.aggregate({
      where: { tenantId, updatedAt: { gte: since }, stage: { isClosedLost: true } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const stageMap = new Map(dealsByStage.map((d) => [d.stageId, { count: d._count.id, amount: Number(d._sum.amount ?? 0) }]));

  return {
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      dealCount: stageMap.get(s.id)?.count ?? 0,
      totalAmount: stageMap.get(s.id)?.amount ?? 0,
    })),
    last30Days: {
      won: { count: wonLast30._count._all, amount: Number(wonLast30._sum.amount ?? 0) },
      lost: { count: lostLast30._count._all, amount: Number(lostLast30._sum.amount ?? 0) },
    },
  };
}

async function toolSearchInstallations(
  tenantId: string,
  query: string,
  limit: number,
  accountId?: string,
  status?: string,
) {
  const q = query.trim();
  const take = Math.max(1, Math.min(limit || 10, 20));
  const where: Prisma.CrmInstallationWhereInput = { tenantId };
  // Con accountId y sin texto, listamos TODAS las instalaciones de la cuenta.
  if (q || !accountId) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { account: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (accountId) where.accountId = accountId;
  if (status === "prospect" || status === "active" || status === "inactive") where.status = status;
  const rows = await prisma.crmInstallation.findMany({
    where,
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      city: true,
      address: true,
      accountId: true,
      account: { select: { name: true } },
      supervisorAssignments: {
        where: { isActive: true },
        take: 1,
        select: {
          supervisor: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    city: r.city,
    address: r.address,
    accountId: r.accountId,
    accountName: r.account?.name ?? null,
    supervisor: r.supervisorAssignments[0]?.supervisor
      ? {
          id: r.supervisorAssignments[0].supervisor.id,
          name: r.supervisorAssignments[0].supervisor.name,
          email: r.supervisorAssignments[0].supervisor.email,
        }
      : null,
    url: `/crm/installations/${r.id}`,
  }));
}

async function toolSearchContacts(tenantId: string, query: string, limit: number) {
  const q = query.trim();
  const take = Math.max(1, Math.min(limit || 10, 20));
  const where: Prisma.CrmContactWhereInput = {
    tenantId,
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { roleTitle: { contains: q, mode: "insensitive" } },
      { account: { name: { contains: q, mode: "insensitive" } } },
    ],
  };
  const rows = await prisma.crmContact.findMany({
    where,
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      roleTitle: true,
      isPrimary: true,
      account: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
    email: r.email,
    phone: r.phone,
    role: r.roleTitle,
    isPrimary: r.isPrimary,
    accountId: r.account.id,
    accountName: r.account.name,
    url: `/crm/accounts/${r.account.id}`,
  }));
}

async function toolSearchAll(
  tenantId: string,
  query: string,
  limitPerType: number,
) {
  const q = query.trim();
  if (!q) return { accounts: [], deals: [], quotes: [], installations: [], contacts: [], guardias: [] };
  const lim = Math.max(1, Math.min(limitPerType || 5, 10));

  const [accounts, deals, quotes, installations, contacts, guardias] = await Promise.all([
    toolSearchAccounts(tenantId, q, lim),
    toolSearchDeals(tenantId, q, undefined, lim),
    toolSearchQuotes(tenantId, q, undefined, lim),
    toolSearchInstallations(tenantId, q, lim),
    toolSearchContacts(tenantId, q, lim),
    searchGuardiasByNameOrRut(tenantId, q, lim).catch(() => []),
  ]);

  return { accounts, deals, quotes, installations, contacts, guardias };
}

async function toolGetDailyAttendance(tenantId: string, dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const [byInstallation, ppcSnap, teCounts] = await Promise.all([
    prisma.opsAsistenciaDiaria.groupBy({
      by: ["installationId", "attendanceStatus"],
      where: { tenantId, date: d },
      _count: { id: true },
    }),
    prisma.opsPpcSnapshot.findUnique({
      where: { tenantId_date: { tenantId, date: d } },
    }),
    prisma.opsTurnoExtra.groupBy({
      by: ["status"],
      where: { tenantId, date: d },
      _count: { id: true },
    }),
  ]);

  const instIds = [...new Set(byInstallation.map((x) => x.installationId))];
  const instNames =
    instIds.length > 0
      ? await prisma.crmInstallation.findMany({
          where: { id: { in: instIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = Object.fromEntries(instNames.map((i) => [i.id, i.name]));

  const grouped: Record<string, { installationName: string; byStatus: Record<string, number> }> = {};
  for (const row of byInstallation) {
    const id = row.installationId;
    if (!grouped[id]) {
      grouped[id] = { installationName: nameById[id] ?? id, byStatus: {} };
    }
    grouped[id].byStatus[row.attendanceStatus] = row._count.id;
  }

  return {
    date: dateStr,
    byInstallation: Object.values(grouped),
    ppcSnapshot: ppcSnap
      ? {
          totalPpc: ppcSnap.totalPpc,
          totalGuards: ppcSnap.totalGuards,
          ppcPercentage: ppcSnap.ppcPercentage,
        }
      : null,
    turnosExtraByStatus: Object.fromEntries(teCounts.map((t) => [t.status, t._count.id])),
  };
}

function weekKey(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() - day + 1);
  return x.toISOString().slice(0, 10);
}

async function toolGetSupervisionVisits(tenantId: string, weeksBack: number) {
  const since = new Date();
  since.setDate(since.getDate() - 7 * Math.max(1, Math.min(weeksBack || 3, 12)));

  const visits = await prisma.opsVisitaSupervision.findMany({
    where: { tenantId, checkInAt: { gte: since } },
    select: {
      id: true,
      checkInAt: true,
      supervisorId: true,
      installationId: true,
      status: true,
      supervisor: { select: { name: true } },
    },
    orderBy: { checkInAt: "desc" },
    take: 400,
  });

  const grouped: Record<string, Record<string, number>> = {};
  for (const v of visits) {
    const sup = v.supervisor.name;
    const wk = weekKey(v.checkInAt);
    if (!grouped[sup]) grouped[sup] = {};
    grouped[sup][wk] = (grouped[sup][wk] ?? 0) + 1;
  }

  return { since: since.toISOString(), bySupervisorWeek: grouped, sampleSize: visits.length };
}

async function toolGetRondasStatus(tenantId: string, dateStr: string) {
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const [byStatus, programmed, openAlerts] = await Promise.all([
    prisma.opsRondaEjecucion.groupBy({
      by: ["status"],
      where: {
        tenantId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      _count: { id: true },
    }),
    prisma.opsRondaProgramacion.count({
      where: { tenantId, isActive: true },
    }),
    prisma.opsAlertaRonda.count({
      where: { tenantId, resuelta: false },
    }),
  ]);

  return {
    date: dateStr,
    ejecucionesByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])),
    programacionesActivas: programmed,
    alertasAbiertas: openAlerts,
  };
}

async function toolGetTicketsSummary(tenantId: string) {
  const [byStatus, overdue, recent] = await Promise.all([
    prisma.opsTicket.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { id: true },
    }),
    prisma.opsTicket.count({
      where: {
        tenantId,
        slaBreached: true,
        status: { notIn: ["closed", "resolved", "cancelled"] },
      },
    }),
    prisma.opsTicket.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])),
    slaOverdueOpen: overdue,
    recent: recent.map((t) => ({
      code: t.code,
      title: t.title,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
      url: `/ops/tickets/${t.id}`,
    })),
  };
}

async function toolGetMyTickets(
  tenantId: string,
  userId: string,
  args: { estado?: string; prioridad?: string; solo_vencidos_sla?: boolean },
) {
  const teams = await getAssignedTeamsForUser(tenantId, userId);
  const mine =
    teams.length > 0
      ? { OR: [{ assignedTo: userId }, { assignedTeam: { in: teams } }] }
      : { assignedTo: userId };
  const where: Record<string, unknown> = { tenantId, AND: [mine] };
  if (args.estado) where.status = args.estado;
  else where.status = { in: ["open", "in_progress", "waiting", "pending_approval"] };
  if (args.prioridad) where.priority = args.prioridad;
  if (args.solo_vencidos_sla) where.slaBreached = true;

  const [rows, total] = await Promise.all([
    prisma.opsTicket.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 15,
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        priority: true,
        slaBreached: true,
        slaDueAt: true,
        assignedTeam: true,
      },
    }),
    prisma.opsTicket.count({ where }),
  ]);

  return {
    scope: "asignados al usuario actual (él o sus equipos)",
    total,
    tickets: rows.map((t) => ({
      code: t.code,
      title: t.title,
      status: t.status,
      priority: t.priority,
      slaBreached: t.slaBreached,
      slaDueAt: t.slaDueAt ? t.slaDueAt.toISOString() : null,
      team: t.assignedTeam,
      url: `/ops/tickets/${t.id}`,
    })),
  };
}

async function toolGetFinanceSummary(tenantId: string, daysBack: number) {
  const since = new Date();
  since.setDate(since.getDate() - Math.max(1, Math.min(daysBack || 30, 365)));
  since.setHours(0, 0, 0, 0);

  const [rendByStatus, rendSum, dteByPay, dteSum] = await Promise.all([
    prisma.financeRendicion.groupBy({
      by: ["status"],
      where: { tenantId, createdAt: { gte: since } },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.financeRendicion.aggregate({
      where: { tenantId, createdAt: { gte: since } },
      _sum: { amount: true },
    }),
    prisma.financeDte.groupBy({
      by: ["paymentStatus"],
      where: { tenantId, createdAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.financeDte.aggregate({
      where: { tenantId, createdAt: { gte: since } },
      _sum: { totalAmount: true },
    }),
  ]);

  return {
    since: since.toISOString(),
    rendiciones: {
      byStatus: Object.fromEntries(
        rendByStatus.map((r) => [r.status, { count: r._count.id, amount: r._sum.amount ?? 0 }]),
      ),
      totalAmount: rendSum._sum.amount ?? 0,
    },
    dtes: {
      byPaymentStatus: Object.fromEntries(dteByPay.map((r) => [String(r.paymentStatus), r._count.id])),
      totalAmount: Number(dteSum._sum.totalAmount ?? 0),
    },
  };
}

async function toolGetUserContext(tenantId: string, userId: string) {
  const admin = await prisma.admin.findFirst({
    where: { id: userId, tenantId },
    select: {
      name: true,
      email: true,
      role: true,
      roleTemplate: { select: { name: true, slug: true, permissions: true } },
    },
  });
  if (!admin) return { ok: false, error: "Usuario no encontrado" };
  return {
    ok: true,
    data: {
      name: admin.name,
      email: admin.email,
      role: admin.role,
      roleTemplate: admin.roleTemplate
        ? { name: admin.roleTemplate.name, slug: admin.roleTemplate.slug }
        : null,
      hasCustomPermissions: Boolean(admin.roleTemplate?.permissions),
    },
  };
}

async function toolGetTenantSummary(tenantId: string) {
  const [
    users,
    accounts,
    installations,
    guardias,
    deals,
    tickets,
  ] = await Promise.all([
    prisma.admin.count({ where: { tenantId, status: "active" } }),
    prisma.crmAccount.count({ where: { tenantId } }),
    prisma.crmInstallation.count({ where: { tenantId } }),
    prisma.opsGuardia.count({ where: { tenantId } }),
    prisma.crmDeal.count({ where: { tenantId } }),
    prisma.opsTicket.count({ where: { tenantId } }),
  ]);

  return {
    users,
    crmAccounts: accounts,
    installations,
    guardias,
    deals,
    tickets,
  };
}

/* ───────── Detail / document tools ───────── */

async function findGuardiaByQuery(tenantId: string, query: string) {
  const q = query.trim();
  if (!q) return null;
  return prisma.opsGuardia.findFirst({
    where: {
      tenantId,
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { persona: { firstName: { contains: q, mode: "insensitive" } } },
        { persona: { lastName: { contains: q, mode: "insensitive" } } },
        { persona: { rut: { contains: q, mode: "insensitive" } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      lifecycleStatus: true,
      hiredAt: true,
      currentInstallation: { select: { id: true, name: true } },
      persona: {
        select: {
          firstName: true,
          lastName: true,
          rut: true,
          email: true,
          personalEmail: true,
          phone: true,
          phoneMobile: true,
          addressFormatted: true,
          commune: true,
          city: true,
          region: true,
          birthDate: true,
          sex: true,
          nacionalidad: true,
          afp: true,
          healthSystem: true,
          isapreName: true,
        },
      },
      bankAccounts: {
        orderBy: [{ isDefault: "desc" }],
        select: {
          bankName: true,
          accountType: true,
          accountNumber: true,
          holderName: true,
          holderRut: true,
          isDefault: true,
        },
      },
    },
  });
}

async function toolGetGuardiaDetail(tenantId: string, query: string) {
  const g = await findGuardiaByQuery(tenantId, query);
  if (!g) return { ok: false, error: "No encontré ningún guardia con esa búsqueda." };
  return {
    ok: true,
    data: {
      id: g.id,
      code: g.code,
      url: `/personas/guardias/${g.id}`,
      lifecycleStatus: g.lifecycleStatus,
      hiredAt: g.hiredAt,
      instalacionActual: g.currentInstallation
        ? { id: g.currentInstallation.id, name: g.currentInstallation.name, url: `/crm/installations/${g.currentInstallation.id}` }
        : null,
      persona: {
        nombre: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
        rut: g.persona.rut,
        email: g.persona.email,
        emailPersonal: g.persona.personalEmail,
        telefono: g.persona.phone,
        celular: g.persona.phoneMobile,
        direccion: g.persona.addressFormatted,
        comuna: g.persona.commune,
        ciudad: g.persona.city,
        region: g.persona.region,
        fechaNacimiento: g.persona.birthDate,
        sexo: g.persona.sex,
        nacionalidad: g.persona.nacionalidad,
        afp: g.persona.afp,
        sistemaSalud: g.persona.healthSystem,
        isapre: g.persona.isapreName,
      },
      cuentasBancarias: g.bankAccounts.map((b) => ({
        banco: b.bankName,
        tipoCuenta: b.accountType,
        numeroCuenta: b.accountNumber,
        titular: b.holderName,
        rutTitular: b.holderRut,
        principal: b.isDefault,
      })),
    },
  };
}

async function toolListGuardiaDocuments(tenantId: string, query: string, type?: string) {
  const g = await findGuardiaByQuery(tenantId, query);
  if (!g) return { ok: false, error: "No encontré ningún guardia con esa búsqueda." };
  const where: Prisma.OpsDocumentoPersonaWhereInput = { tenantId, guardiaId: g.id };
  if (type && type.trim()) {
    where.type = { contains: type.trim(), mode: "insensitive" };
  }
  const docs = await prisma.opsDocumentoPersona.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 30,
    select: {
      id: true,
      type: true,
      fileUrl: true,
      fileName: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
    },
  });
  return {
    ok: true,
    data: {
      guardia: {
        id: g.id,
        nombre: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
        rut: g.persona.rut,
        url: `/personas/guardias/${g.id}`,
      },
      documentos: docs.map((d) => ({
        id: d.id,
        tipo: d.type,
        nombreArchivo: d.fileName,
        estado: d.status,
        emitido: d.issuedAt,
        vence: d.expiresAt,
        // Link directo al archivo (R2/storage) y a la pantalla del guardia
        archivoUrl: d.fileUrl,
        verEnApp: `/personas/guardias/${g.id}`,
      })),
    },
  };
}

async function findAccountByQuery(tenantId: string, query: string) {
  const q = query.trim();
  if (!q) return null;
  return prisma.crmAccount.findFirst({
    where: {
      tenantId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { legalName: { contains: q, mode: "insensitive" } },
        { rut: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      rut: true,
      legalName: true,
      legalRepresentativeName: true,
      legalRepresentativeRut: true,
      industry: true,
      segment: true,
      type: true,
      status: true,
      website: true,
      address: true,
      commune: true,
      contacts: {
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, roleTitle: true },
      },
      installations: {
        take: 10,
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true },
      },
    },
  });
}

async function toolGetAccountDetail(tenantId: string, query: string) {
  const a = await findAccountByQuery(tenantId, query);
  if (!a) return { ok: false, error: "No encontré ninguna cuenta con esa búsqueda." };
  return {
    ok: true,
    data: {
      id: a.id,
      url: `/crm/accounts/${a.id}`,
      nombre: a.name,
      rut: a.rut,
      razonSocial: a.legalName,
      representanteLegal: a.legalRepresentativeName,
      rutRepresentanteLegal: a.legalRepresentativeRut,
      industria: a.industry,
      segmento: a.segment,
      tipo: a.type,
      estado: a.status,
      web: a.website,
      direccion: a.address,
      comuna: a.commune,
      contactos: a.contacts.map((c) => ({
        id: c.id,
        nombre: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
        email: c.email,
        telefono: c.phone,
        cargo: c.roleTitle,
      })),
      instalaciones: a.installations.map((i) => ({
        id: i.id,
        nombre: i.name,
        url: `/crm/installations/${i.id}`,
      })),
    },
  };
}

async function toolListAccountDocuments(
  tenantId: string,
  query: string,
  category?: string,
) {
  const a = await findAccountByQuery(tenantId, query);
  if (!a) return { ok: false, error: "No encontré ninguna cuenta con esa búsqueda." };
  const where: Prisma.DocumentWhereInput = {
    tenantId,
    associations: { some: { entityType: "crm_account", entityId: a.id } },
  };
  if (category && category.trim()) where.category = { contains: category.trim(), mode: "insensitive" };
  const docs = await prisma.document.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 25,
    select: {
      id: true,
      title: true,
      module: true,
      category: true,
      status: true,
      effectiveDate: true,
      expirationDate: true,
      pdfUrl: true,
      signatureStatus: true,
    },
  });
  return {
    ok: true,
    data: {
      cuenta: { id: a.id, nombre: a.name, rut: a.rut, url: `/crm/accounts/${a.id}` },
      documentos: docs.map((d) => ({
        id: d.id,
        titulo: d.title,
        modulo: d.module,
        categoria: d.category,
        estado: d.status,
        firma: d.signatureStatus,
        vigenciaDesde: d.effectiveDate,
        vigenciaHasta: d.expirationDate,
        verEnApp: `/opai/documentos/${d.id}`,
        pdfUrl: d.pdfUrl,
      })),
    },
  };
}

function dayBoundsChile(dateStr: string): { gte: Date; lt: Date } {
  // Treat dateStr as a Chile-local date and return a UTC range covering that day.
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  // Chile is UTC-3 (or -4 in summer); use -3 as a safe lower bound. We just want
  // the calendar day, slop is fine for human-facing reports.
  const gte = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const lt = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
  return { gte, lt };
}

async function toolGetPanicAlerts(tenantId: string, dateStr: string, daysBack: number) {
  const { gte, lt } = dayBoundsChile(dateStr);
  const lower = daysBack > 1 ? new Date(gte.getTime() - (daysBack - 1) * 24 * 60 * 60 * 1000) : gte;
  const rows = await prisma.opsAlertaRonda.findMany({
    where: {
      tenantId,
      tipo: "panico",
      createdAt: { gte: lower, lt },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      severidad: true,
      mensaje: true,
      resuelta: true,
      isAcknowledged: true,
      createdAt: true,
      installation: { select: { id: true, name: true } },
      guardia: {
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
    },
  });
  return {
    ok: true,
    data: {
      total: rows.length,
      desde: lower,
      hasta: lt,
      alertas: rows.map((r) => ({
        id: r.id,
        cuando: r.createdAt,
        severidad: r.severidad,
        mensaje: r.mensaje,
        resuelta: r.resuelta,
        reconocida: r.isAcknowledged,
        instalacion: r.installation
          ? { id: r.installation.id, nombre: r.installation.name, url: `/crm/installations/${r.installation.id}` }
          : null,
        guardia: r.guardia
          ? {
              id: r.guardia.id,
              codigo: r.guardia.code,
              nombre: `${r.guardia.persona.firstName} ${r.guardia.persona.lastName}`.trim(),
              rut: r.guardia.persona.rut,
              url: `/personas/guardias/${r.guardia.id}`,
            }
          : null,
      })),
    },
  };
}

async function toolGetDailyAbsences(tenantId: string, dateStr: string) {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  const rows = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      tenantId,
      date,
      deletedAt: null,
      attendanceStatus: { in: ["ausente", "no_marcada"] },
    },
    take: 100,
    orderBy: [{ installationId: "asc" }],
    select: {
      id: true,
      attendanceStatus: true,
      plannedShiftStart: true,
      plannedShiftEnd: true,
      installation: { select: { id: true, name: true } },
      puesto: { select: { id: true, name: true } },
      plannedGuardia: {
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
    },
  });
  return {
    ok: true,
    data: {
      fecha: dateStr,
      total: rows.length,
      ausencias: rows.map((r) => ({
        id: r.id,
        estado: r.attendanceStatus,
        turnoPlanificado:
          r.plannedShiftStart && r.plannedShiftEnd
            ? `${r.plannedShiftStart}-${r.plannedShiftEnd}`
            : null,
        instalacion: {
          id: r.installation.id,
          nombre: r.installation.name,
          url: `/crm/installations/${r.installation.id}`,
        },
        puesto: { id: r.puesto.id, nombre: r.puesto.name },
        guardia: r.plannedGuardia
          ? {
              id: r.plannedGuardia.id,
              codigo: r.plannedGuardia.code,
              nombre: `${r.plannedGuardia.persona.firstName} ${r.plannedGuardia.persona.lastName}`.trim(),
              rut: r.plannedGuardia.persona.rut,
              url: `/personas/guardias/${r.plannedGuardia.id}`,
            }
          : null,
      })),
    },
  };
}

async function toolGetExtraShifts(tenantId: string, dateStr: string, status?: string) {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  const where: Prisma.OpsTurnoExtraWhereInput = { tenantId, date };
  if (status) where.status = status;
  const rows = await prisma.opsTurnoExtra.findMany({
    where,
    take: 100,
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      tipo: true,
      horasExtra: true,
      amountClp: true,
      installation: { select: { id: true, name: true } },
      guardia: {
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
    },
  });
  return {
    ok: true,
    data: {
      fecha: dateStr,
      total: rows.length,
      turnosExtra: rows.map((r) => ({
        id: r.id,
        estado: r.status,
        tipo: r.tipo,
        horasExtra: r.horasExtra ? Number(r.horasExtra) : null,
        montoClp: Number(r.amountClp),
        instalacion: {
          id: r.installation.id,
          nombre: r.installation.name,
          url: `/crm/installations/${r.installation.id}`,
        },
        guardia: {
          id: r.guardia.id,
          codigo: r.guardia.code,
          nombre: `${r.guardia.persona.firstName} ${r.guardia.persona.lastName}`.trim(),
          rut: r.guardia.persona.rut,
          url: `/personas/guardias/${r.guardia.id}`,
        },
      })),
    },
  };
}

async function toolSearchQuotes(
  tenantId: string,
  query: string | undefined,
  status: string | undefined,
  limit: number,
) {
  const take = Math.max(1, Math.min(limit || 12, 25));
  const where: Prisma.CpqQuoteWhereInput = { tenantId };
  if (status) where.status = status;
  const q = (query || "").trim();
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { clientName: { contains: q, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.cpqQuote.findMany({
    where,
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      code: true,
      name: true,
      clientName: true,
      status: true,
      monthlyCost: true,
      currency: true,
      validUntil: true,
      updatedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    nombre: r.name,
    cliente: r.clientName,
    estado: r.status,
    montoMensual: Number(r.monthlyCost),
    moneda: r.currency,
    validaHasta: r.validUntil,
    actualizada: r.updatedAt,
    url: `/crm/cotizaciones/${r.id}`,
  }));
}

function summarizeProposalAiContent(raw: unknown): string[] {
  const out: string[] = [];
  const walk = (val: unknown, depth: number) => {
    if (depth > 4 || out.length >= 12) return;
    if (!val || typeof val !== "object") return;
    if (Array.isArray(val)) {
      for (const item of val) {
        walk(item, depth + 1);
        if (out.length >= 12) return;
      }
      return;
    }
    const o = val as Record<string, unknown>;
    const title =
      typeof o.title === "string"
        ? o.title
        : typeof o.sectionTitle === "string"
          ? o.sectionTitle
          : typeof o.heading === "string"
            ? o.heading
            : typeof o.label === "string"
              ? o.label
              : null;
    if (title?.trim()) {
      const trimmed = title.trim();
      if (!out.includes(trimmed)) out.push(trimmed);
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  walk(raw, 0);
  return out;
}

async function toolGetQuoteDetail(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext?: HelpChatPageContext | null,
): Promise<unknown> {
  if (!canView(perms, "cpq") && !canView(perms, "crm", "quotes")) {
    return { ok: false, error: "No tienes permiso para ver cotizaciones CPQ." };
  }

  let ref = typeof args.quoteIdOrCode === "string" ? args.quoteIdOrCode.trim() : "";
  if (!ref && pageContext?.entityType === "cpq_quote" && pageContext.entityId) {
    ref = pageContext.entityId;
  }
  if (!ref) {
    return {
      ok: false,
      error:
        'Indica el código de la cotización en quoteIdOrCode o abre la ficha de la cotización para usar el contexto automático.',
    };
  }

  try {
    const resolved = await resolveQuoteByCodeOrName(tenantId, ref);
    if (!resolved) {
      return { ok: false, error: `No encontré una cotización que coincida con "${ref}".` };
    }

    const quote = await prisma.cpqQuote.findFirst({
      where: { id: resolved.id, tenantId },
      include: {
        positions: {
          include: { puestoTrabajo: true, cargo: true, rol: true },
          orderBy: { createdAt: "asc" },
        },
        parameters: true,
        installation: { select: { id: true, name: true } },
        includesItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!quote) return { ok: false, error: "Cotización no encontrada para este tenant." };

    const dealRow = quote.dealId
      ? await prisma.crmDeal.findFirst({
          where: { id: quote.dealId, tenantId },
          select: { id: true, title: true },
        })
      : null;
    const { computeCpqQuoteCosts } = await import("@/modules/cpq/costing/compute-quote-costs");
    const costs = await computeCpqQuoteCosts(quote.id);

    const marginPctParam =
      quote.parameters?.marginPct != null ? Number(quote.parameters.marginPct) : 13;

    const positionsOut = quote.positions.map((p, idx) => {
      const nombre = p.customName?.trim() || p.puestoTrabajo?.name || `Puesto ${idx + 1}`;
      const coverage = `${formatWeekdaysShort(p.weekdays)} ${p.startTime}–${p.endTime}`;
      return {
        orden: idx + 1,
        positionId: p.id,
        nombre,
        cargo: p.cargo?.name ?? null,
        rol: p.rol?.name ?? null,
        coverage,
        weekdays: p.weekdays,
        startTime: p.startTime,
        endTime: p.endTime,
        numGuards: p.numGuards,
        numPuestos: p.numPuestos,
        baseSalary: Number(p.baseSalary),
        netSalary: p.netSalary != null ? Number(p.netSalary) : null,
        employerCost: Number(p.employerCost),
        monthlyPositionCost: Number(p.monthlyPositionCost),
      };
    });

    const proposalSections = summarizeProposalAiContent(quote.proposalAiContent ?? null);

    return {
      ok: true,
      data: {
        header: {
          id: quote.id,
          code: quote.code,
          name: quote.name,
          clientName: quote.clientName,
          status: quote.status,
          currency: quote.currency,
          validUntil: quote.validUntil,
          monthlyCostStored: Number(quote.monthlyCost),
          deal: dealRow ? { id: dealRow.id, title: dealRow.title } : null,
          installation: quote.installation
            ? { id: quote.installation.id, name: quote.installation.name }
            : null,
        },
        positions: positionsOut,
        costBreakdown: {
          monthlyPositions: costs.monthlyPositions,
          monthlyHolidayAdjustment: costs.monthlyHolidayAdjustment,
          monthlyUniforms: costs.monthlyUniforms,
          monthlyExams: costs.monthlyExams,
          monthlyMeals: costs.monthlyMeals,
          monthlyVehicles: costs.monthlyVehicles,
          monthlyInfrastructure: costs.monthlyInfrastructure,
          monthlyCostItems: costs.monthlyCostItems,
          laborCost: costs.laborCost,
          costsBase: costs.costsBase,
          monthlyFinancial: costs.monthlyFinancial,
          monthlyPolicy: costs.monthlyPolicy,
          monthlyExtras: costs.monthlyExtras,
          additionalLinesTotalBase: costs.additionalLinesTotalBase,
          additionalLinesTotalWithMargin: costs.additionalLinesTotalWithMargin,
        },
        commercial: {
          marginPctFromParameters: marginPctParam,
          marginMode: costs.marginMode,
          costsBase: costs.costsBase,
          baseWithMargin: costs.baseWithMargin,
          monthlyTotal: costs.monthlyTotal,
          totalGuards: costs.totalGuards,
        },
        includes:
          quote.includesItems?.map((i) => ({
            id: i.id,
            text: i.text,
            sortOrder: i.sortOrder,
            showInPdf: i.showInPdf,
            source: i.source,
          })) ?? [],
        proposalAi: {
          generatedAt: quote.proposalAiGeneratedAt,
          sections: proposalSections.slice(0, 12),
        },
        pdfUrlRelative: `/api/cpq/quotes/${quote.id}/proposal-pdf`,
        url: `/crm/cotizaciones/${quote.id}`,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cotización ambigua.";
    return { ok: false, error: msg };
  }
}


/**
 * Extrae texto plano de un documento Tiptap (JSON).
 * Recorre recursivamente buscando nodos `text` y agregando saltos de línea
 * en bloques (paragraph, heading, listItem, etc).
 */
function tiptapToPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  let out = "";
  if (typeof n.text === "string") out += n.text;
  if (Array.isArray(n.content)) {
    for (const child of n.content) out += tiptapToPlainText(child);
  }
  const blockTypes = new Set([
    "paragraph",
    "heading",
    "listItem",
    "blockquote",
    "codeBlock",
    "tableRow",
    "horizontalRule",
  ]);
  if (typeof n.type === "string" && blockTypes.has(n.type)) {
    out += "\n";
  }
  return out;
}

/**
 * Mapea entityType largo (DocAssociation: "crm_account", "crm_deal"...)
 * al short form usado por CrmFileLink ("account", "deal"...).
 */
function entityTypeToCrmFileLinkType(entityType: string): string | null {
  switch (entityType) {
    case "crm_account": return "account";
    case "crm_deal": return "deal";
    case "crm_installation": return "installation";
    case "crm_contact": return "contact";
    case "ops_guardia": return "guardia";
    default: return null;
  }
}

/**
 * Lista documentos asociados a una entidad. Hace UNION de tres fuentes:
 *  - DocAssociation → Document (Tiptap, contratos generados)
 *  - CrmFileLink → CrmFile (PDFs/DOCX subidos por usuarios: órdenes, facturas, anexos)
 *  - CpqQuoteAttachment (cuando entityType === "cpq_quote")
 *
 * Cada item incluye un `documentId` con prefijo (`doc:`, `file:`, `att:`) para
 * que `read_document` sepa cómo leer cada uno.
 */
async function toolGetEntityDocuments(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit: number,
) {
  const take = Math.max(1, Math.min(limit || 10, 20));

  // Caso especial: cotización CPQ → solo attachments propios
  if (entityType === "cpq_quote") {
    const atts = await prisma.cpqQuoteAttachment.findMany({
      where: { quoteId: entityId, tenantId },
      take,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        publicUrl: true,
        createdAt: true,
      },
    });
    return atts.map((a) => ({
      documentId: `att:${a.id}`,
      title: a.fileName,
      module: "cpq",
      category: "attachment",
      status: "active",
      mimeType: a.mimeType,
      size: a.size,
      pdfUrl: a.publicUrl ?? null,
      updatedAt: a.createdAt.toISOString(),
      url: a.publicUrl ?? `/crm/cotizaciones/${entityId}`,
      source: "cpq_attachment",
    }));
  }

  const linkType = entityTypeToCrmFileLinkType(entityType);

  const [associations, fileLinks] = await Promise.all([
    prisma.docAssociation.findMany({
      where: { entityType, entityId, document: { tenantId } },
      take,
      orderBy: { document: { updatedAt: "desc" } },
      select: {
        role: true,
        document: {
          select: {
            id: true,
            title: true,
            module: true,
            category: true,
            status: true,
            pdfUrl: true,
            updatedAt: true,
          },
        },
      },
    }),
    linkType
      ? prisma.crmFileLink.findMany({
          where: { entityType: linkType, entityId, tenantId },
          take,
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
            file: {
              select: {
                id: true,
                fileName: true,
                mimeType: true,
                size: true,
                storageKey: true,
              },
            },
          },
        })
      : Promise.resolve([] as Array<{ createdAt: Date; file: { id: string; fileName: string; mimeType: string; size: number; storageKey: string } }>),
  ]);

  const docItems = associations.map((a) => ({
    documentId: `doc:${a.document.id}`,
    title: a.document.title,
    module: a.document.module,
    category: a.document.category,
    status: a.document.status,
    role: a.role,
    pdfUrl: a.document.pdfUrl ?? null,
    updatedAt: a.document.updatedAt.toISOString(),
    url: `/docs/${a.document.id}`,
    source: "doc",
  }));

  const fileItems = fileLinks.map((l) => ({
    documentId: `file:${l.file.id}`,
    title: l.file.fileName,
    module: "crm",
    category: "attachment",
    status: "active",
    mimeType: l.file.mimeType,
    size: l.file.size,
    pdfUrl: null,
    updatedAt: l.createdAt.toISOString(),
    url: `/api/crm/files/${l.file.id}/download`,
    source: "crm_file",
  }));

  // Mezcla y ordena por fecha desc, recorta a `take`
  return [...docItems, ...fileItems]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, take);
}

/**
 * Lee el contenido textual de un documento. El `documentId` puede venir con
 * prefijo (`doc:xxx`, `file:xxx`, `att:xxx`) — formato producido por
 * `toolGetEntityDocuments`. Si no trae prefijo, asume `doc:` por compatibilidad.
 */
async function toolReadDocument(tenantId: string, rawDocumentId: string) {
  const id = rawDocumentId.trim();
  if (!id) return { ok: false, error: "documentId requerido." };

  const colon = id.indexOf(":");
  const prefix = colon > 0 ? id.slice(0, colon) : "doc";
  const realId = colon > 0 ? id.slice(colon + 1) : id;

  if (prefix === "doc") {
    const doc = await prisma.document.findFirst({
      where: { id: realId, tenantId },
      select: {
        id: true,
        title: true,
        module: true,
        category: true,
        status: true,
        content: true,
        pdfUrl: true,
        updatedAt: true,
      },
    });
    if (!doc) return { ok: false, error: "Documento no encontrado o sin permiso." };
    const fullText = tiptapToPlainText(doc.content)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const MAX = 12_000;
    const truncated = fullText.length > MAX;
    return {
      ok: true,
      data: {
        id: `doc:${doc.id}`,
        title: doc.title,
        module: doc.module,
        category: doc.category,
        status: doc.status,
        pdfUrl: doc.pdfUrl ?? null,
        updatedAt: doc.updatedAt.toISOString(),
        url: `/docs/${doc.id}`,
        text: truncated ? `${fullText.slice(0, MAX)}\n\n[...documento truncado a ${MAX} caracteres]` : fullText,
        truncated,
        length: fullText.length,
        source: "doc",
      },
    };
  }

  if (prefix === "file") {
    const file = await prisma.crmFile.findFirst({
      where: { id: realId, tenantId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        storageKey: true,
        createdAt: true,
      },
    });
    if (!file) return { ok: false, error: "Archivo no encontrado o sin permiso." };
    return await readBinaryFile({
      idLabel: `file:${file.id}`,
      title: file.fileName,
      mimeType: file.mimeType,
      storageKey: file.storageKey,
      updatedAt: file.createdAt,
      url: `/api/crm/files/${file.id}/download`,
      module: "crm",
    });
  }

  if (prefix === "att") {
    const att = await prisma.cpqQuoteAttachment.findFirst({
      where: { id: realId, tenantId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        storageKey: true,
        publicUrl: true,
        createdAt: true,
      },
    });
    if (!att) return { ok: false, error: "Adjunto no encontrado o sin permiso." };
    return await readBinaryFile({
      idLabel: `att:${att.id}`,
      title: att.fileName,
      mimeType: att.mimeType,
      storageKey: att.storageKey,
      updatedAt: att.createdAt,
      url: att.publicUrl ?? `#`,
      module: "cpq",
    });
  }

  return { ok: false, error: `Prefijo de documentId desconocido: '${prefix}'.` };
}

/**
 * Lee un binario de R2 y extrae texto. Soporta PDF, DOCX, TXT, MD vía
 * `extractText`. Capa tamaño y trunca el texto resultante.
 */
async function readBinaryFile(opts: {
  idLabel: string;
  title: string;
  mimeType: string;
  storageKey: string;
  updatedAt: Date;
  url: string;
  module: string;
}) {
  try {
    const buffer = await getFileBuffer(opts.storageKey);
    let text: string;
    try {
      text = await extractText(buffer, opts.mimeType);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "no soportado";
      return {
        ok: false,
        error: `No fue posible extraer texto del archivo (${opts.mimeType}): ${msg}. Sugerencia: descárgalo desde la app.`,
      };
    }
    const fullText = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    const MAX = 12_000;
    const truncated = fullText.length > MAX;
    return {
      ok: true,
      data: {
        id: opts.idLabel,
        title: opts.title,
        module: opts.module,
        category: "attachment",
        status: "active",
        mimeType: opts.mimeType,
        pdfUrl: null,
        updatedAt: opts.updatedAt.toISOString(),
        url: opts.url,
        text: truncated ? `${fullText.slice(0, MAX)}\n\n[...documento truncado a ${MAX} caracteres]` : fullText,
        truncated,
        length: fullText.length,
        source: opts.idLabel.startsWith("att:") ? "cpq_attachment" : "crm_file",
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error leyendo archivo";
    return { ok: false, error: msg };
  }
}

async function logAiAction(opts: {
  tenantId: string;
  userId: string;
  toolName: string;
  args: unknown;
  status: "success" | "denied" | "validation_error" | "internal_error";
  resultEntityId?: string;
  resultEntityType?: string;
  errorMessage?: string;
  startedAt: number;
}) {
  try {
    await prisma.aiActionLog.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        toolName: opts.toolName,
        args: opts.args as Prisma.InputJsonValue,
        status: opts.status,
        resultEntityId: opts.resultEntityId ?? null,
        resultEntityType: opts.resultEntityType ?? null,
        errorMessage: opts.errorMessage ?? null,
        durationMs: Date.now() - opts.startedAt,
      },
    });
  } catch (e) {
    console.warn("[AiActionLog] Failed to write log:", e);
  }
}

async function toolCreateLead(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "leads")) {
    await logAiAction({ tenantId, userId, toolName: "create_lead", args, status: "denied", errorMessage: "Sin permiso crm.leads.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear leads en este tenant. Contacta a tu administrador." };
  }
  const parsed = createLeadSchema.safeParse(args);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_lead", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const body = parsed.data;
  const hasAnyKey = body.companyName || (body.firstName && body.lastName) || body.email || body.phone;
  if (!hasAnyKey) {
    await logAiAction({ tenantId, userId, toolName: "create_lead", args, status: "validation_error", errorMessage: "Sin campos identificatorios", startedAt: t0 });
    return { ok: false, error: "Faltan datos identificatorios. Necesito al menos uno: empresa, nombre+apellido, email o teléfono." };
  }
  try {
    const firstName = toSentenceCase(body.firstName ?? undefined);
    const lastName = toSentenceCase(body.lastName ?? undefined);
    const lead = await prisma.crmLead.create({
      data: {
        tenantId,
        status: "pending",
        source: body.source || null,
        firstName,
        lastName,
        email: body.email || null,
        phone: body.phone || null,
        companyName: body.companyName || null,
        notes: body.notes || null,
        industry: body.industry || null,
        address: body.address || null,
        commune: body.commune || null,
        city: body.city || null,
        website: body.website || null,
        serviceType: body.serviceType || null,
      },
    });
    await logAiAction({ tenantId, userId, toolName: "create_lead", args, status: "success", resultEntityId: lead.id, resultEntityType: "crm_lead", startedAt: t0 });
    const displayName =
      [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() ||
      lead.companyName ||
      lead.email ||
      lead.phone ||
      "Lead sin nombre";
    // Espeja el evento que emiten los demás flujos de creación (POST
    // /api/crm/leads, cotizador público): sin esto, los leads creados por
    // el asistente no llegan a bell/push/Slack.
    try {
      const { notify } = await import("@/lib/notifications/notify");
      await notify({
        tenantId,
        type: "new_lead",
        title: "Nuevo lead registrado",
        body: `${displayName}${lead.companyName && displayName !== lead.companyName ? ` — ${lead.companyName}` : ""}`,
        link: `/crm/leads/${lead.id}`,
        data: { leadId: lead.id, contacto: displayName, empresa: lead.companyName ?? undefined },
      });
    } catch (err) {
      console.error("[AI] Error notifying new_lead:", err);
    }
    return {
      ok: true,
      data: {
        id: lead.id,
        entityType: "crm_lead",
        name: displayName,
        url: `/crm/leads/${lead.id}`,
        companyName: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_lead", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear el lead: ${msg}` };
  }
}

async function toolCreateAccount(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "accounts")) {
    await logAiAction({ tenantId, userId, toolName: "create_account", args, status: "denied", errorMessage: "Sin permiso crm.accounts.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear cuentas." };
  }
  const parsed = createAccountSchema.safeParse(args);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_account", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const body = parsed.data;
  try {
    const account = await prisma.crmAccount.create({
      data: {
        tenantId,
        name: body.name,
        type: body.type,
        rut: body.rut || null,
        legalName: body.legalName || null,
        legalRepresentativeName: body.legalRepresentativeName || null,
        legalRepresentativeRut: body.legalRepresentativeRut || null,
        industry: body.industry || null,
        segment: body.segment || null,
        status: body.status,
        isActive: body.isActive,
        website: body.website || null,
        address: body.address || null,
        commune: body.commune || null,
        notaryName: body.notaryName || null,
        notaryDate: body.notaryDate || null,
        notes: body.notes || null,
      },
    });
    await logAiAction({ tenantId, userId, toolName: "create_account", args, status: "success", resultEntityId: account.id, resultEntityType: "crm_account", startedAt: t0 });
    return {
      ok: true,
      data: {
        id: account.id,
        entityType: "crm_account",
        name: account.name,
        url: `/crm/accounts/${account.id}`,
        type: account.type,
        rut: account.rut,
        industry: account.industry,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_account", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear la cuenta: ${msg}` };
  }
}

async function toolCreateContact(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "contacts")) {
    await logAiAction({ tenantId, userId, toolName: "create_contact", args, status: "denied", errorMessage: "Sin permiso crm.contacts.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear contactos." };
  }
  const parsed = createContactSchema.safeParse(args);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_contact", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const body = parsed.data;
  const account = await prisma.crmAccount.findFirst({
    where: { id: body.accountId, tenantId },
    select: { id: true, name: true },
  });
  if (!account) {
    await logAiAction({ tenantId, userId, toolName: "create_contact", args, status: "validation_error", errorMessage: "Cuenta no encontrada o no pertenece al tenant", startedAt: t0 });
    return { ok: false, error: "La cuenta indicada no existe o no pertenece a tu organización." };
  }
  try {
    const contact = await prisma.crmContact.create({
      data: {
        tenantId,
        accountId: body.accountId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone || null,
        roleTitle: body.roleTitle || null,
        isPrimary: body.isPrimary,
      },
    });
    await logAiAction({ tenantId, userId, toolName: "create_contact", args, status: "success", resultEntityId: contact.id, resultEntityType: "crm_contact", startedAt: t0 });
    const displayName = `${contact.firstName} ${contact.lastName}`.trim();
    return {
      ok: true,
      data: {
        id: contact.id,
        entityType: "crm_contact",
        name: displayName,
        url: `/crm/contacts/${contact.id}`,
        email: contact.email,
        phone: contact.phone,
        roleTitle: contact.roleTitle,
        accountId: contact.accountId,
        accountName: account.name,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_contact", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear el contacto: ${msg}` };
  }
}

async function toolCreateDeal(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "deals")) {
    await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "denied", errorMessage: "Sin permiso crm.deals.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear deals." };
  }
  const parsed = createDealSchema.safeParse(args);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const body = parsed.data;
  const account = await prisma.crmAccount.findFirst({
    where: { id: body.accountId, tenantId },
    select: { id: true, name: true },
  });
  if (!account) {
    await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "validation_error", errorMessage: "Cuenta no encontrada", startedAt: t0 });
    return { ok: false, error: "La cuenta indicada no existe o no pertenece a tu organización." };
  }

  let stageId = body.stageId;
  let resolvedStageName: string | null = null;
  if (!stageId && body.stageName) {
    try {
      const id = await resolveStageByName(tenantId, body.stageName);
      if (!id) {
        const stages = await prisma.crmPipelineStage.findMany({
          where: { tenantId, isActive: true },
          select: { name: true },
          orderBy: { order: "asc" },
          take: 10,
        });
        await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "validation_error", errorMessage: `Etapa "${body.stageName}" no existe`, startedAt: t0 });
        return {
          ok: false,
          error: `Etapa "${body.stageName}" no existe. Etapas disponibles: ${stages.map(s => s.name).join(", ") || "(ninguna configurada)"}.`,
        };
      }
      stageId = id;
      resolvedStageName = body.stageName;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Etapa ambigua";
      await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
      return { ok: false, error: msg };
    }
  }
  if (!stageId) {
    const firstStage = await prisma.crmPipelineStage.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    });
    if (!firstStage) {
      await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "validation_error", errorMessage: "No hay pipeline configurado", startedAt: t0 });
      return { ok: false, error: "No hay etapas de pipeline configuradas. Configura el pipeline antes de crear deals." };
    }
    stageId = firstStage.id;
    resolvedStageName = firstStage.name;
  }

  let installation: { id: string; name: string; created: boolean } | null = null;
  if (body.installationName) {
    try {
      installation = await resolveOrCreateInstallation(
        tenantId,
        body.accountId,
        body.installationName,
        {
          autoCreate: true,
          address: body.installationAddress,
          commune: body.installationCommune,
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al resolver instalación";
      await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
      return { ok: false, error: msg };
    }
  }

  try {
    const deal = await prisma.crmDeal.create({
      data: {
        tenantId,
        accountId: body.accountId,
        title: body.title || `Deal — ${account.name}`,
        stageId,
        primaryContactId: body.primaryContactId || null,
        amount: body.amount,
        probability: body.probability,
        expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
        proposalLink: body.proposalLink || null,
      },
    });
    await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "success", resultEntityId: deal.id, resultEntityType: "crm_deal", startedAt: t0 });
    return {
      ok: true,
      data: {
        id: deal.id,
        entityType: "crm_deal",
        name: deal.title,
        url: `/crm/deals/${deal.id}`,
        amount: Number(deal.amount),
        probability: deal.probability,
        accountId: deal.accountId,
        accountName: account.name,
        stageName: resolvedStageName,
        installationId: installation?.id ?? null,
        installationName: installation?.name ?? null,
        installationCreated: installation?.created ?? false,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear el deal: ${msg}` };
  }
}

async function toolCreateInstallation(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "installations")) {
    await logAiAction({ tenantId, userId, toolName: "create_installation", args, status: "denied", errorMessage: "Sin permiso crm.installations.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear instalaciones." };
  }
  const parsed = createInstallationSchema.safeParse(args);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_installation", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const body = parsed.data;

  const account = await prisma.crmAccount.findFirst({
    where: { id: body.accountId, tenantId },
    select: { id: true, name: true, isActive: true },
  });
  if (!account) {
    await logAiAction({ tenantId, userId, toolName: "create_installation", args, status: "validation_error", errorMessage: "Cuenta no encontrada", startedAt: t0 });
    return { ok: false, error: "La cuenta indicada no existe o no pertenece a tu organización." };
  }

  const status = body.status ?? "prospect";
  if (status === "active" && !account.isActive) {
    await logAiAction({ tenantId, userId, toolName: "create_installation", args, status: "validation_error", errorMessage: "Cuenta inactiva", startedAt: t0 });
    return { ok: false, error: "No puedes crear una instalación activa para una cuenta inactiva." };
  }

  const installationName = toSentenceCase(body.name) || body.name;
  try {
    const installation = await prisma.crmInstallation.create({
      data: {
        tenantId,
        accountId: body.accountId,
        name: installationName,
        address: body.address ?? null,
        city: body.city ?? null,
        commune: body.commune ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        status,
        geoRadiusM: body.geoRadiusM ?? 1000,
        teMontoClp: body.teMontoClp ?? 0,
        notes: body.notes ?? null,
        nocturnoEnabled: status === "active",
        chatEnabled: status === "active",
      },
      select: {
        id: true,
        name: true,
        address: true,
        commune: true,
        status: true,
        accountId: true,
      },
    });

    if (status === "active") {
      await prisma.financeCostCenter.create({
        data: {
          tenantId,
          name: installation.name,
          installationId: installation.id,
          accountId: installation.accountId ?? null,
          active: true,
        },
      });
    }

    await logAiAction({
      tenantId, userId, toolName: "create_installation", args,
      status: "success",
      resultEntityId: installation.id,
      resultEntityType: "crm_installation",
      startedAt: t0,
    });

    return {
      ok: true,
      data: {
        id: installation.id,
        entityType: "crm_installation",
        name: installation.name,
        url: `/crm/installations/${installation.id}`,
        accountId: installation.accountId,
        accountName: account.name,
        commune: installation.commune,
        address: installation.address,
        status: installation.status,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_installation", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear la instalación: ${msg}` };
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * Update CRM tools
 *
 * Patch parciales (solo los campos que el usuario quiere cambiar). Todas
 * las tools comparten el mismo patrón:
 *   1. Validar permiso canEdit(perms, "crm", "<entidad>").
 *   2. Validar args con el schema parcial existente (createXSchema.partial()
 *      o updateXSchema). Si el cliente pasa un id inválido o un campo
 *      desconocido, devolvemos un error legible.
 *   3. Confirmar que la entidad existe y pertenece al tenant actual.
 *   4. Aplicar el patch con prisma.X.update y registrar el cambio en
 *      CrmHistoryLog (mismo formato que las rutas HTTP /api/crm/.../[id]).
 *   5. Devolver la entidad actualizada en un shape consistente para que el
 *      LLM pueda renderizar la card de confirmación.
 * ────────────────────────────────────────────────────────────────────── */

async function toolUpdateAccount(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "accounts")) {
    await logAiAction({ tenantId, userId, toolName: "update_account", args, status: "denied", errorMessage: "Sin permiso crm.accounts.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para editar cuentas." };
  }
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    await logAiAction({ tenantId, userId, toolName: "update_account", args, status: "validation_error", errorMessage: "Falta id", startedAt: t0 });
    return { ok: false, error: "Falta id de la cuenta. Usa search_accounts para obtenerlo." };
  }
  if (!isUuid(id)) {
    await logAiAction({ tenantId, userId, toolName: "update_account", args, status: "validation_error", errorMessage: "id con formato inválido", startedAt: t0 });
    return { ok: false, error: "El ID indicado no tiene formato válido. Usa la búsqueda correspondiente para obtener el ID correcto." };
  }
  const rest = { ...args };
  delete (rest as Record<string, unknown>).id;
  const parsed = updateAccountSchema.safeParse(rest);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "update_account", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    await logAiAction({ tenantId, userId, toolName: "update_account", args, status: "validation_error", errorMessage: "Sin campos a actualizar", startedAt: t0 });
    return { ok: false, error: "No me pasaste qué campo cambiar." };
  }
  const existing = await prisma.crmAccount.findFirst({ where: { id, tenantId } });
  if (!existing) {
    await logAiAction({ tenantId, userId, toolName: "update_account", args, status: "validation_error", errorMessage: "Cuenta no encontrada", startedAt: t0 });
    return { ok: false, error: "Cuenta no encontrada o no pertenece a tu organización." };
  }
  try {
    const result = await prisma.crmAccount.updateMany({
      where: { id, tenantId },
      data: patch as Prisma.CrmAccountUpdateManyMutationInput,
    });
    if (result.count === 0) {
      return { ok: false, error: "Cuenta no encontrada al aplicar el cambio." };
    }
    const account = await prisma.crmAccount.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        name: true,
        type: true,
        rut: true,
        legalName: true,
        industry: true,
        status: true,
        isActive: true,
        website: true,
        address: true,
        commune: true,
        city: true,
      },
    });
    const diff = computeChangedFields(
      existing as unknown as Record<string, unknown>,
      patch as unknown as Record<string, unknown>,
    );
    await createCrmHistoryLog({
      tenantId,
      entityType: "account",
      entityId: id,
      action: "account_updated",
      details: { changedFields: diff.changedFields, changes: diff.changes, source: "ai_assistant" },
      createdBy: userId,
    });
    await logAiAction({ tenantId, userId, toolName: "update_account", args, status: "success", resultEntityId: id, resultEntityType: "crm_account", startedAt: t0 });
    return {
      ok: true,
      data: {
        id: account!.id,
        entityType: "crm_account",
        name: account!.name,
        url: `/crm/accounts/${account!.id}`,
        type: account!.type,
        rut: account!.rut,
        industry: account!.industry,
        status: account!.status,
        changedFields: diff.changedFields,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "update_account", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo actualizar la cuenta: ${msg}` };
  }
}

async function toolUpdateContact(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "contacts")) {
    await logAiAction({ tenantId, userId, toolName: "update_contact", args, status: "denied", errorMessage: "Sin permiso crm.contacts.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para editar contactos." };
  }
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    await logAiAction({ tenantId, userId, toolName: "update_contact", args, status: "validation_error", errorMessage: "Falta id", startedAt: t0 });
    return { ok: false, error: "Falta id del contacto. Usa search_contacts para obtenerlo." };
  }
  if (!isUuid(id)) {
    await logAiAction({ tenantId, userId, toolName: "update_contact", args, status: "validation_error", errorMessage: "id con formato inválido", startedAt: t0 });
    return { ok: false, error: "El ID indicado no tiene formato válido. Usa la búsqueda correspondiente para obtener el ID correcto." };
  }
  const rest = { ...args };
  delete (rest as Record<string, unknown>).id;
  const parsed = updateContactSchema.safeParse(rest);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "update_contact", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    await logAiAction({ tenantId, userId, toolName: "update_contact", args, status: "validation_error", errorMessage: "Sin campos a actualizar", startedAt: t0 });
    return { ok: false, error: "No me pasaste qué campo cambiar." };
  }
  const existing = await prisma.crmContact.findFirst({ where: { id, tenantId } });
  if (!existing) {
    await logAiAction({ tenantId, userId, toolName: "update_contact", args, status: "validation_error", errorMessage: "Contacto no encontrado", startedAt: t0 });
    return { ok: false, error: "Contacto no encontrado o no pertenece a tu organización." };
  }
  // Si se quiere mover a otra cuenta, verificar que la nueva cuenta exista en el tenant.
  if (patch.accountId && patch.accountId !== existing.accountId) {
    const newAccount = await prisma.crmAccount.findFirst({
      where: { id: patch.accountId, tenantId },
      select: { id: true },
    });
    if (!newAccount) {
      await logAiAction({ tenantId, userId, toolName: "update_contact", args, status: "validation_error", errorMessage: "accountId destino no existe", startedAt: t0 });
      return { ok: false, error: "La cuenta destino no existe en tu organización." };
    }
  }
  try {
    const result = await prisma.crmContact.updateMany({
      where: { id, tenantId },
      data: patch as Prisma.CrmContactUpdateManyMutationInput,
    });
    if (result.count === 0) {
      return { ok: false, error: "Contacto no encontrado al aplicar el cambio." };
    }
    const contact = await prisma.crmContact.findFirst({
      where: { id, tenantId },
      include: { account: { select: { id: true, name: true } } },
    });
    const diff = computeChangedFields(
      existing as unknown as Record<string, unknown>,
      patch as unknown as Record<string, unknown>,
    );
    await createCrmHistoryLog({
      tenantId,
      entityType: "contact",
      entityId: id,
      action: "contact_updated",
      details: { changedFields: diff.changedFields, changes: diff.changes, source: "ai_assistant" },
      createdBy: userId,
    });
    await logAiAction({ tenantId, userId, toolName: "update_contact", args, status: "success", resultEntityId: id, resultEntityType: "crm_contact", startedAt: t0 });
    const displayName = `${contact!.firstName} ${contact!.lastName}`.trim();
    return {
      ok: true,
      data: {
        id: contact!.id,
        entityType: "crm_contact",
        name: displayName,
        url: `/crm/contacts/${contact!.id}`,
        email: contact!.email,
        phone: contact!.phone,
        roleTitle: contact!.roleTitle,
        isPrimary: contact!.isPrimary,
        accountId: contact!.accountId,
        accountName: contact!.account?.name ?? null,
        changedFields: diff.changedFields,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "update_contact", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo actualizar el contacto: ${msg}` };
  }
}

async function toolUpdateLead(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "leads")) {
    await logAiAction({ tenantId, userId, toolName: "update_lead", args, status: "denied", errorMessage: "Sin permiso crm.leads.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para editar leads." };
  }
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    await logAiAction({ tenantId, userId, toolName: "update_lead", args, status: "validation_error", errorMessage: "Falta id", startedAt: t0 });
    return { ok: false, error: "Falta id del lead. Usa search_all para obtenerlo." };
  }
  if (!isUuid(id)) {
    await logAiAction({ tenantId, userId, toolName: "update_lead", args, status: "validation_error", errorMessage: "id con formato inválido", startedAt: t0 });
    return { ok: false, error: "El ID indicado no tiene formato válido. Usa la búsqueda correspondiente para obtener el ID correcto." };
  }
  const rest = { ...args };
  delete (rest as Record<string, unknown>).id;
  const parsed = createLeadSchema.partial().safeParse(rest);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "update_lead", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const payload = parsed.data;
  if (Object.keys(payload).length === 0) {
    await logAiAction({ tenantId, userId, toolName: "update_lead", args, status: "validation_error", errorMessage: "Sin campos a actualizar", startedAt: t0 });
    return { ok: false, error: "No me pasaste qué campo cambiar." };
  }
  const existing = await prisma.crmLead.findFirst({ where: { id, tenantId } });
  if (!existing) {
    await logAiAction({ tenantId, userId, toolName: "update_lead", args, status: "validation_error", errorMessage: "Lead no encontrado", startedAt: t0 });
    return { ok: false, error: "Lead no encontrado o no pertenece a tu organización." };
  }
  const normalized: Record<string, unknown> = {
    ...payload,
    firstName:
      payload.firstName === undefined ? undefined : toSentenceCase(payload.firstName ?? undefined) ?? null,
    lastName:
      payload.lastName === undefined ? undefined : toSentenceCase(payload.lastName ?? undefined) ?? null,
  };
  try {
    const result = await prisma.crmLead.updateMany({
      where: { id, tenantId },
      data: normalized as Prisma.CrmLeadUpdateManyMutationInput,
    });
    if (result.count === 0) {
      return { ok: false, error: "Lead no encontrado al aplicar el cambio." };
    }
    const lead = await prisma.crmLead.findFirst({ where: { id, tenantId } });
    const diff = computeChangedFields(
      existing as unknown as Record<string, unknown>,
      normalized,
    );
    await createCrmHistoryLog({
      tenantId,
      entityType: "lead",
      entityId: id,
      action: "lead_updated",
      details: { changedFields: diff.changedFields, changes: diff.changes, source: "ai_assistant" },
      createdBy: userId,
    });
    await logAiAction({ tenantId, userId, toolName: "update_lead", args, status: "success", resultEntityId: id, resultEntityType: "crm_lead", startedAt: t0 });
    const displayName =
      [lead!.firstName, lead!.lastName].filter(Boolean).join(" ").trim() ||
      lead!.companyName ||
      lead!.email ||
      lead!.phone ||
      "Lead sin nombre";
    return {
      ok: true,
      data: {
        id: lead!.id,
        entityType: "crm_lead",
        name: displayName,
        url: `/crm/leads/${lead!.id}`,
        companyName: lead!.companyName,
        email: lead!.email,
        phone: lead!.phone,
        status: lead!.status,
        changedFields: diff.changedFields,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "update_lead", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo actualizar el lead: ${msg}` };
  }
}

async function toolUpdateDeal(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "deals")) {
    await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "denied", errorMessage: "Sin permiso crm.deals.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para editar deals." };
  }
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "validation_error", errorMessage: "Falta id", startedAt: t0 });
    return { ok: false, error: "Falta id del deal. Usa search_deals para obtenerlo." };
  }
  if (!isUuid(id)) {
    await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "validation_error", errorMessage: "id con formato inválido", startedAt: t0 });
    return { ok: false, error: "El ID indicado no tiene formato válido. Usa la búsqueda correspondiente para obtener el ID correcto." };
  }
  // Construir patch a partir de los campos soportados. Usamos validación
  // manual aquí porque createDealSchema.partial() permitiría sobreescribir
  // accountId — explícitamente bloqueamos eso (mover deals de cuenta no es
  // una operación que debamos exponer al asistente sin más controles).
  const patch: Record<string, unknown> = {};
  if (typeof args.title === "string") patch.title = args.title.trim();
  if (typeof args.amount === "number") patch.amount = args.amount;
  if (typeof args.probability === "number") patch.probability = args.probability;
  if (typeof args.expectedCloseDate === "string" && args.expectedCloseDate.length >= 8) {
    const date = new Date(args.expectedCloseDate);
    if (Number.isNaN(date.getTime())) {
      await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "validation_error", errorMessage: "expectedCloseDate inválida", startedAt: t0 });
      return { ok: false, error: "expectedCloseDate inválida (usa YYYY-MM-DD)." };
    }
    patch.expectedCloseDate = date;
  }
  if (typeof args.primaryContactId === "string") patch.primaryContactId = args.primaryContactId;
  if (typeof args.proposalLink === "string") patch.proposalLink = args.proposalLink;
  let resolvedStageName: string | null = null;
  if (typeof args.stageId === "string" && args.stageId.length > 0) {
    const stage = await prisma.crmPipelineStage.findFirst({
      where: { id: args.stageId, tenantId },
      select: { id: true, name: true },
    });
    if (!stage) {
      await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "validation_error", errorMessage: "stageId no existe", startedAt: t0 });
      return { ok: false, error: "La etapa indicada no existe en este tenant." };
    }
    patch.stageId = stage.id;
    resolvedStageName = stage.name;
  } else if (typeof args.stageName === "string" && args.stageName.trim().length > 0) {
    try {
      const stageId = await resolveStageByName(tenantId, args.stageName);
      if (!stageId) {
        const stages = await prisma.crmPipelineStage.findMany({
          where: { tenantId, isActive: true },
          select: { name: true },
          orderBy: { order: "asc" },
          take: 10,
        });
        await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "validation_error", errorMessage: `Etapa "${args.stageName}" no existe`, startedAt: t0 });
        return {
          ok: false,
          error: `Etapa "${args.stageName}" no existe. Etapas disponibles: ${stages.map((s) => s.name).join(", ") || "(ninguna configurada)"}.`,
        };
      }
      patch.stageId = stageId;
      resolvedStageName = args.stageName;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Etapa ambigua";
      await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
      return { ok: false, error: msg };
    }
  }
  if (Object.keys(patch).length === 0) {
    await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "validation_error", errorMessage: "Sin campos a actualizar", startedAt: t0 });
    return { ok: false, error: "No me pasaste qué campo cambiar." };
  }
  const existing = await prisma.crmDeal.findFirst({ where: { id, tenantId } });
  if (!existing) {
    await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "validation_error", errorMessage: "Deal no encontrado", startedAt: t0 });
    return { ok: false, error: "Deal no encontrado o no pertenece a tu organización." };
  }
  try {
    const result = await prisma.crmDeal.updateMany({
      where: { id, tenantId },
      data: patch as Prisma.CrmDealUpdateManyMutationInput,
    });
    if (result.count === 0) {
      return { ok: false, error: "Deal no encontrado al aplicar el cambio." };
    }
    const deal = await prisma.crmDeal.findFirst({
      where: { id, tenantId },
      include: {
        account: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    });
    const diff = computeChangedFields(
      existing as unknown as Record<string, unknown>,
      patch,
    );
    await createCrmHistoryLog({
      tenantId,
      entityType: "deal",
      entityId: id,
      action: "deal_updated",
      details: { changedFields: diff.changedFields, changes: diff.changes, source: "ai_assistant" },
      createdBy: userId,
    });
    await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "success", resultEntityId: id, resultEntityType: "crm_deal", startedAt: t0 });
    return {
      ok: true,
      data: {
        id: deal!.id,
        entityType: "crm_deal",
        name: deal!.title,
        url: `/crm/deals/${deal!.id}`,
        amount: Number(deal!.amount),
        probability: deal!.probability,
        accountId: deal!.accountId,
        accountName: deal!.account?.name ?? null,
        stageId: deal!.stageId,
        stageName: resolvedStageName ?? deal!.stage?.name ?? null,
        expectedCloseDate: deal!.expectedCloseDate?.toISOString().slice(0, 10) ?? null,
        changedFields: diff.changedFields,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "update_deal", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo actualizar el deal: ${msg}` };
  }
}

async function toolUpdateInstallation(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "installations")) {
    await logAiAction({ tenantId, userId, toolName: "update_installation", args, status: "denied", errorMessage: "Sin permiso crm.installations.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para editar instalaciones." };
  }
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    await logAiAction({ tenantId, userId, toolName: "update_installation", args, status: "validation_error", errorMessage: "Falta id", startedAt: t0 });
    return { ok: false, error: "Falta id de la instalación. Usa search_installations para obtenerlo." };
  }
  if (!isUuid(id)) {
    await logAiAction({ tenantId, userId, toolName: "update_installation", args, status: "validation_error", errorMessage: "id con formato inválido", startedAt: t0 });
    return { ok: false, error: "El ID indicado no tiene formato válido. Usa la búsqueda correspondiente para obtener el ID correcto." };
  }
  const rest = { ...args };
  delete (rest as Record<string, unknown>).id;
  const parsed = updateInstallationSchema.safeParse(rest);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "update_installation", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    await logAiAction({ tenantId, userId, toolName: "update_installation", args, status: "validation_error", errorMessage: "Sin campos a actualizar", startedAt: t0 });
    return { ok: false, error: "No me pasaste qué campo cambiar." };
  }
  const existing = await prisma.crmInstallation.findFirst({ where: { id, tenantId } });
  if (!existing) {
    await logAiAction({ tenantId, userId, toolName: "update_installation", args, status: "validation_error", errorMessage: "Instalación no encontrada", startedAt: t0 });
    return { ok: false, error: "Instalación no encontrada o no pertenece a tu organización." };
  }
  if (patch.name) {
    patch.name = toSentenceCase(patch.name) || patch.name;
  }
  try {
    const result = await prisma.crmInstallation.updateMany({
      where: { id, tenantId },
      data: patch as Prisma.CrmInstallationUpdateManyMutationInput,
    });
    if (result.count === 0) {
      return { ok: false, error: "Instalación no encontrada al aplicar el cambio." };
    }
    const installation = await prisma.crmInstallation.findFirst({
      where: { id, tenantId },
      include: { account: { select: { id: true, name: true } } },
    });
    const diff = computeChangedFields(
      existing as unknown as Record<string, unknown>,
      patch as unknown as Record<string, unknown>,
    );
    await createCrmHistoryLog({
      tenantId,
      entityType: "installation",
      entityId: id,
      action: "installation_updated",
      details: { changedFields: diff.changedFields, changes: diff.changes, source: "ai_assistant" },
      createdBy: userId,
    });
    await logAiAction({ tenantId, userId, toolName: "update_installation", args, status: "success", resultEntityId: id, resultEntityType: "crm_installation", startedAt: t0 });
    return {
      ok: true,
      data: {
        id: installation!.id,
        entityType: "crm_installation",
        name: installation!.name,
        url: `/crm/installations/${installation!.id}`,
        address: installation!.address,
        commune: installation!.commune,
        city: installation!.city,
        status: installation!.status,
        accountId: installation!.accountId,
        accountName: installation!.account?.name ?? null,
        changedFields: diff.changedFields,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "update_installation", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo actualizar la instalación: ${msg}` };
  }
}

const TICKET_STATUS_VALUES = [
  "pending_approval", "open", "in_progress", "waiting", "resolved", "closed", "rejected", "cancelled",
] as const;

const createTicketToolSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  ticketTypeId: z.string().uuid().optional(),
  priority: z.enum(["p1", "p2", "p3", "p4"]).optional(),
  assignedTeam: z.string().optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  installationId: z.string().uuid().optional(),
  guardiaId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});

function ensureOpsTickets(perms: RolePermissions): boolean {
  return hasModuleAccess(perms, "ops");
}

async function resolveTicketIdForTool(
  tenantId: string,
  args: Record<string, unknown>,
): Promise<{ id: string; code?: string } | { error: string }> {
  const ticketId = typeof args.ticketId === "string" ? args.ticketId.trim() : "";
  const codeRaw = typeof args.code === "string" ? args.code.trim() : "";
  if (ticketId) {
    if (!isUuid(ticketId)) return { error: "ticketId con formato inválido." };
    const row = await prisma.opsTicket.findFirst({ where: { id: ticketId, tenantId }, select: { id: true, code: true } });
    if (!row) return { error: "Ticket no encontrado." };
    return { id: row.id, code: row.code };
  }
  if (codeRaw) {
    const code = codeRaw.toUpperCase();
    const row = await prisma.opsTicket.findFirst({ where: { code, tenantId }, select: { id: true, code: true } });
    if (!row) return { error: `Ticket ${code} no encontrado.` };
    return { id: row.id, code: row.code };
  }
  return { error: "Indica ticketId (UUID) o code (TK-…)." };
}

async function resolveBulkInstallationTargets(
  tenantId: string,
  args: Record<string, unknown>,
  targetStatus: "prospect" | "active" | "inactive",
): Promise<
  | { ok: true; installations: Array<{ id: string; name: string; statusActual: string; accountName: string | null }> }
  | { ok: false; error: string }
> {
  const accountId = typeof args.accountId === "string" ? args.accountId.trim() : "";
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!accountId && !query) {
    return { ok: false, error: "Indica accountId o query para acotar las instalaciones." };
  }
  if (accountId && !isUuid(accountId)) {
    return { ok: false, error: "accountId con formato inválido." };
  }
  const where: Prisma.CrmInstallationWhereInput = {
    tenantId,
    status: { not: targetStatus },
  };
  if (accountId) where.accountId = accountId;
  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { account: { name: { contains: query, mode: "insensitive" } } },
    ];
  }
  const rows = await prisma.crmInstallation.findMany({
    where,
    take: 51,
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true, account: { select: { name: true } } },
  });
  if (rows.length > 50) {
    return { ok: false, error: "Hay más de 50 instalaciones; acota con accountId o un query más específico." };
  }
  return {
    ok: true,
    installations: rows.map((r) => ({
      id: r.id,
      name: r.name,
      statusActual: r.status,
      accountName: r.account?.name ?? null,
    })),
  };
}

async function toolCreateTicket(tenantId: string, userId: string, perms: RolePermissions, args: Record<string, unknown>) {
  const t0 = Date.now();
  if (!ensureOpsTickets(perms)) {
    await logAiAction({ tenantId, userId, toolName: "create_ticket", args, status: "denied", errorMessage: "Sin módulo ops", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para el módulo Operaciones (tickets)." };
  }
  const parsed = createTicketToolSchema.safeParse(args);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_ticket", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  try {
    const result = await createOpsTicket({
      tenantId,
      actorId: userId,
      reportedBy: userId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      ticketTypeId: parsed.data.ticketTypeId ?? null,
      priority: parsed.data.priority ?? null,
      source: "manual",
      assignedTeam: parsed.data.assignedTeam ?? null,
      assignedTo: parsed.data.assignedTo ?? null,
      installationId: parsed.data.installationId ?? null,
      guardiaId: parsed.data.guardiaId ?? null,
      tags: parsed.data.tags ?? [],
    });
    if ("error" in result) {
      await logAiAction({ tenantId, userId, toolName: "create_ticket", args, status: "validation_error", errorMessage: result.error, startedAt: t0 });
      return { ok: false, error: result.error };
    }
    await logAiAction({ tenantId, userId, toolName: "create_ticket", args, status: "success", resultEntityId: result.id, resultEntityType: "ops_ticket", startedAt: t0 });
    return { ok: true, data: { ...result, entityType: "ops_ticket", url: `/ops/tickets/${result.id}` } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_ticket", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear el ticket: ${msg}` };
  }
}

async function toolTransitionTicket(tenantId: string, userId: string, perms: RolePermissions, args: Record<string, unknown>) {
  const t0 = Date.now();
  if (!ensureOpsTickets(perms)) {
    await logAiAction({ tenantId, userId, toolName: "transition_ticket", args, status: "denied", errorMessage: "Sin módulo ops", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para el módulo Operaciones (tickets)." };
  }
  const target = typeof args.targetStatus === "string" ? args.targetStatus : "";
  if (!TICKET_STATUS_VALUES.includes(target as (typeof TICKET_STATUS_VALUES)[number])) {
    await logAiAction({ tenantId, userId, toolName: "transition_ticket", args, status: "validation_error", errorMessage: "targetStatus inválido", startedAt: t0 });
    return { ok: false, error: "targetStatus inválido." };
  }
  const resolved = await resolveTicketIdForTool(tenantId, args);
  if ("error" in resolved) {
    await logAiAction({ tenantId, userId, toolName: "transition_ticket", args, status: "validation_error", errorMessage: resolved.error, startedAt: t0 });
    return { ok: false, error: resolved.error };
  }
  try {
    const result = await transitionTicketStatus({
      tenantId,
      actorId: userId,
      ticketId: resolved.id,
      targetStatus: target as TicketStatus,
      source: "ai_assistant",
    });
    if (!result.ok) {
      await logAiAction({ tenantId, userId, toolName: "transition_ticket", args, status: "validation_error", errorMessage: result.error, startedAt: t0 });
      return { ok: false, error: result.error };
    }
    await logAiAction({ tenantId, userId, toolName: "transition_ticket", args, status: "success", resultEntityId: result.ticket.id, resultEntityType: "ops_ticket", startedAt: t0 });
    return { ok: true, data: { ...result.ticket, entityType: "ops_ticket", url: `/ops/tickets/${result.ticket.id}` } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "transition_ticket", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo cambiar el estado: ${msg}` };
  }
}

async function toolTakeTicket(tenantId: string, userId: string, perms: RolePermissions, args: Record<string, unknown>) {
  const t0 = Date.now();
  if (!ensureOpsTickets(perms)) {
    await logAiAction({ tenantId, userId, toolName: "take_ticket", args, status: "denied", errorMessage: "Sin módulo ops", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para el módulo Operaciones (tickets)." };
  }
  const resolved = await resolveTicketIdForTool(tenantId, args);
  if ("error" in resolved) {
    await logAiAction({ tenantId, userId, toolName: "take_ticket", args, status: "validation_error", errorMessage: resolved.error, startedAt: t0 });
    return { ok: false, error: resolved.error };
  }
  try {
    const result = await claimTicket({ tenantId, actorId: userId, ticketId: resolved.id });
    if (!result.ok) {
      await logAiAction({ tenantId, userId, toolName: "take_ticket", args, status: "validation_error", errorMessage: result.error, startedAt: t0 });
      return { ok: false, error: result.error };
    }
    await logAiAction({ tenantId, userId, toolName: "take_ticket", args, status: "success", resultEntityId: resolved.id, resultEntityType: "ops_ticket", startedAt: t0 });
    return { ok: true, data: { code: result.code, title: result.title, id: resolved.id, entityType: "ops_ticket", url: `/ops/tickets/${resolved.id}` } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "take_ticket", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo tomar el ticket: ${msg}` };
  }
}

async function toolCommentTicket(tenantId: string, userId: string, perms: RolePermissions, args: Record<string, unknown>) {
  const t0 = Date.now();
  if (!ensureOpsTickets(perms)) {
    await logAiAction({ tenantId, userId, toolName: "comment_ticket", args, status: "denied", errorMessage: "Sin módulo ops", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para el módulo Operaciones (tickets)." };
  }
  const body = typeof args.body === "string" ? args.body.trim() : "";
  if (!body) {
    await logAiAction({ tenantId, userId, toolName: "comment_ticket", args, status: "validation_error", errorMessage: "body vacío", startedAt: t0 });
    return { ok: false, error: "El comentario no puede estar vacío." };
  }
  const resolved = await resolveTicketIdForTool(tenantId, args);
  if ("error" in resolved) {
    await logAiAction({ tenantId, userId, toolName: "comment_ticket", args, status: "validation_error", errorMessage: resolved.error, startedAt: t0 });
    return { ok: false, error: resolved.error };
  }
  try {
    const result = await addTicketComment({ tenantId, actorId: userId, ticketId: resolved.id, body });
    if (!result.ok) {
      await logAiAction({ tenantId, userId, toolName: "comment_ticket", args, status: "validation_error", errorMessage: result.error, startedAt: t0 });
      return { ok: false, error: result.error };
    }
    await logAiAction({ tenantId, userId, toolName: "comment_ticket", args, status: "success", resultEntityId: resolved.id, resultEntityType: "ops_ticket", startedAt: t0 });
    return { ok: true, data: { code: result.code, commentId: result.commentId, id: resolved.id, entityType: "ops_ticket", url: `/ops/tickets/${resolved.id}` } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "comment_ticket", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo comentar el ticket: ${msg}` };
  }
}

async function toolReassignTicket(tenantId: string, userId: string, perms: RolePermissions, args: Record<string, unknown>) {
  const t0 = Date.now();
  if (!ensureOpsTickets(perms)) {
    await logAiAction({ tenantId, userId, toolName: "reassign_ticket", args, status: "denied", errorMessage: "Sin módulo ops", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para el módulo Operaciones (tickets)." };
  }
  const resolved = await resolveTicketIdForTool(tenantId, args);
  if ("error" in resolved) {
    await logAiAction({ tenantId, userId, toolName: "reassign_ticket", args, status: "validation_error", errorMessage: resolved.error, startedAt: t0 });
    return { ok: false, error: resolved.error };
  }
  const assignedTo = args.assignedTo === null ? null : typeof args.assignedTo === "string" ? args.assignedTo.trim() || null : undefined;
  const assignedTeam = typeof args.assignedTeam === "string" ? args.assignedTeam.trim() : undefined;
  if (assignedTo === undefined && !assignedTeam) {
    await logAiAction({ tenantId, userId, toolName: "reassign_ticket", args, status: "validation_error", errorMessage: "Sin campos de reasignación", startedAt: t0 });
    return { ok: false, error: "Indica assignedTo y/o assignedTeam." };
  }
  try {
    const result = await reassignTicket({
      tenantId,
      actorId: userId,
      ticketId: resolved.id,
      assignedTo,
      assignedTeam: assignedTeam || undefined,
    });
    if (!result.ok) {
      await logAiAction({ tenantId, userId, toolName: "reassign_ticket", args, status: "validation_error", errorMessage: result.error, startedAt: t0 });
      return { ok: false, error: result.error };
    }
    await logAiAction({ tenantId, userId, toolName: "reassign_ticket", args, status: "success", resultEntityId: resolved.id, resultEntityType: "ops_ticket", startedAt: t0 });
    return { ok: true, data: { code: result.code, id: resolved.id, entityType: "ops_ticket", url: `/ops/tickets/${resolved.id}` } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "reassign_ticket", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo reasignar el ticket: ${msg}` };
  }
}

async function toolChangeTicketPriority(tenantId: string, userId: string, perms: RolePermissions, args: Record<string, unknown>) {
  const t0 = Date.now();
  if (!ensureOpsTickets(perms)) {
    await logAiAction({ tenantId, userId, toolName: "change_ticket_priority", args, status: "denied", errorMessage: "Sin módulo ops", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para el módulo Operaciones (tickets)." };
  }
  const priority = typeof args.priority === "string" ? args.priority : "";
  if (!["p1", "p2", "p3", "p4"].includes(priority)) {
    await logAiAction({ tenantId, userId, toolName: "change_ticket_priority", args, status: "validation_error", errorMessage: "priority inválida", startedAt: t0 });
    return { ok: false, error: "priority debe ser p1, p2, p3 o p4." };
  }
  const resolved = await resolveTicketIdForTool(tenantId, args);
  if ("error" in resolved) {
    await logAiAction({ tenantId, userId, toolName: "change_ticket_priority", args, status: "validation_error", errorMessage: resolved.error, startedAt: t0 });
    return { ok: false, error: resolved.error };
  }
  try {
    const result = await changeTicketPriority({ tenantId, actorId: userId, ticketId: resolved.id, priority });
    if (!result.ok) {
      await logAiAction({ tenantId, userId, toolName: "change_ticket_priority", args, status: "validation_error", errorMessage: result.error, startedAt: t0 });
      return { ok: false, error: result.error };
    }
    await logAiAction({ tenantId, userId, toolName: "change_ticket_priority", args, status: "success", resultEntityId: resolved.id, resultEntityType: "ops_ticket", startedAt: t0 });
    return { ok: true, data: { code: result.code, priority, id: resolved.id, entityType: "ops_ticket", url: `/ops/tickets/${resolved.id}` } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "change_ticket_priority", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo cambiar la prioridad: ${msg}` };
  }
}

async function toolPreviewBulkUpdateInstallations(tenantId: string, userId: string, perms: RolePermissions, args: Record<string, unknown>) {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "installations")) {
    await logAiAction({ tenantId, userId, toolName: "preview_bulk_update_installations", args, status: "denied", errorMessage: "Sin permiso crm.installations.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para editar instalaciones." };
  }
  const status = args.status;
  if (status !== "prospect" && status !== "active" && status !== "inactive") {
    await logAiAction({ tenantId, userId, toolName: "preview_bulk_update_installations", args, status: "validation_error", errorMessage: "status inválido", startedAt: t0 });
    return { ok: false, error: "status debe ser prospect, active o inactive." };
  }
  const resolved = await resolveBulkInstallationTargets(tenantId, args, status);
  if (!resolved.ok) {
    await logAiAction({ tenantId, userId, toolName: "preview_bulk_update_installations", args, status: "validation_error", errorMessage: resolved.error, startedAt: t0 });
    return { ok: false, error: resolved.error };
  }
  await logAiAction({ tenantId, userId, toolName: "preview_bulk_update_installations", args, status: "success", startedAt: t0 });
  return { ok: true, data: { count: resolved.installations.length, targetStatus: status, installations: resolved.installations } };
}

async function toolBulkUpdateInstallations(tenantId: string, userId: string, perms: RolePermissions, args: Record<string, unknown>) {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "installations")) {
    await logAiAction({ tenantId, userId, toolName: "bulk_update_installations", args, status: "denied", errorMessage: "Sin permiso crm.installations.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para editar instalaciones." };
  }
  const status = args.status;
  if (status !== "prospect" && status !== "active" && status !== "inactive") {
    await logAiAction({ tenantId, userId, toolName: "bulk_update_installations", args, status: "validation_error", errorMessage: "status inválido", startedAt: t0 });
    return { ok: false, error: "status debe ser prospect, active o inactive." };
  }
  const resolved = await resolveBulkInstallationTargets(tenantId, args, status);
  if (!resolved.ok) {
    await logAiAction({ tenantId, userId, toolName: "bulk_update_installations", args, status: "validation_error", errorMessage: resolved.error, startedAt: t0 });
    return { ok: false, error: resolved.error };
  }
  if (resolved.installations.length === 0) {
    await logAiAction({ tenantId, userId, toolName: "bulk_update_installations", args, status: "validation_error", errorMessage: "Sin instalaciones", startedAt: t0 });
    return { ok: false, error: "No hay instalaciones que actualizar con esos filtros." };
  }
  const ids = resolved.installations.map((i) => i.id);
  try {
    await prisma.crmInstallation.updateMany({ where: { id: { in: ids }, tenantId }, data: { status } });
    for (const inst of resolved.installations) {
      await createCrmHistoryLog({
        tenantId,
        entityType: "installation",
        entityId: inst.id,
        action: "installation_updated",
        details: { changedFields: ["status"], changes: { status: { from: inst.statusActual, to: status } }, source: "ai_assistant" },
        createdBy: userId,
      });
    }
    await logAiAction({
      tenantId,
      userId,
      toolName: "bulk_update_installations",
      args: { ...args, count: ids.length },
      status: "success",
      startedAt: t0,
    });
    return { ok: true, data: { count: ids.length, targetStatus: status, installationIds: ids } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "bulk_update_installations", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo actualizar en lote: ${msg}` };
  }
}

async function toolCreateQuote(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  const canViaCrm = canEdit(perms, "crm", "quotes");
  const canViaCpq = canEdit(perms, "cpq");
  if (!canViaCrm && !canViaCpq) {
    await logAiAction({ tenantId, userId, toolName: "create_quote", args, status: "denied", errorMessage: "Sin permiso crm.quotes/cpq", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear cotizaciones." };
  }

  const accountId = typeof args.accountId === "string" ? args.accountId.trim() : "";
  if (!accountId) {
    await logAiAction({ tenantId, userId, toolName: "create_quote", args, status: "validation_error", errorMessage: "Falta accountId", startedAt: t0 });
    return { ok: false, error: "Falta accountId. Usa search_accounts para obtenerlo." };
  }
  if (!isUuid(accountId)) {
    await logAiAction({ tenantId, userId, toolName: "create_quote", args, status: "validation_error", errorMessage: "accountId con formato inválido", startedAt: t0 });
    return { ok: false, error: "El accountId no tiene formato válido. Usa search_accounts para obtener el ID correcto." };
  }

  const account = await prisma.crmAccount.findFirst({
    where: { id: accountId, tenantId },
    select: { id: true, name: true },
  });
  if (!account) {
    await logAiAction({ tenantId, userId, toolName: "create_quote", args, status: "validation_error", errorMessage: "Cuenta no encontrada", startedAt: t0 });
    return { ok: false, error: "La cuenta indicada no existe o no pertenece a tu organización." };
  }

  const dealId = typeof args.dealId === "string" && args.dealId.trim() ? args.dealId.trim() : null;
  if (dealId && !isUuid(dealId)) {
    await logAiAction({ tenantId, userId, toolName: "create_quote", args, status: "validation_error", errorMessage: "dealId con formato inválido", startedAt: t0 });
    return { ok: false, error: "El dealId no tiene formato válido. Omítelo o usa search_deals." };
  }
  if (dealId) {
    const dealExists = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId },
      select: { id: true },
    });
    if (!dealExists) {
      await logAiAction({ tenantId, userId, toolName: "create_quote", args, status: "validation_error", errorMessage: "Deal no encontrado", startedAt: t0 });
      return { ok: false, error: "El deal indicado no existe o no pertenece a tu organización." };
    }
  }

  const installationId =
    typeof args.installationId === "string" && args.installationId.trim()
      ? args.installationId.trim()
      : null;
  if (installationId && !isUuid(installationId)) {
    await logAiAction({ tenantId, userId, toolName: "create_quote", args, status: "validation_error", errorMessage: "installationId con formato inválido", startedAt: t0 });
    return { ok: false, error: "El installationId no tiene formato válido. Omítelo o usa search_installations." };
  }
  if (installationId) {
    const inst = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId },
      select: { id: true },
    });
    if (!inst) {
      await logAiAction({ tenantId, userId, toolName: "create_quote", args, status: "validation_error", errorMessage: "Instalación no encontrada", startedAt: t0 });
      return { ok: false, error: "La instalación indicada no existe o no pertenece a tu organización." };
    }
  }

  const name = typeof args.name === "string" && args.name.trim() ? args.name.trim() : null;
  const clientName =
    typeof args.clientName === "string" && args.clientName.trim()
      ? args.clientName.trim()
      : account.name;
  const validUntil =
    typeof args.validUntil === "string" && args.validUntil.trim()
      ? new Date(args.validUntil)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + 90);
          return d;
        })();
  const notes = typeof args.notes === "string" && args.notes.trim() ? args.notes.trim() : null;

  try {
    const year = new Date().getFullYear();
    let quote: { id: string; code: string; name: string | null; validUntil: Date | null; status: string; accountId: string | null } | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (!quote && attempts < maxAttempts) {
      attempts++;
      const count = await prisma.cpqQuote.count({ where: { tenantId } });
      const code = `CPQ-${year}-${String(count + attempts).padStart(3, "0")}`;
      try {
        quote = await prisma.cpqQuote.create({
          data: {
            tenantId,
            code,
            name,
            status: "draft",
            clientName,
            validUntil,
            notes,
            insurancePolicyUF: 1500,
            accountId,
            ...(dealId ? { dealId } : {}),
            ...(installationId ? { installationId } : {}),
          },
          select: { id: true, code: true, name: true, validUntil: true, status: true, accountId: true },
        });
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code: string }).code
            : "";
        if (code === "P2002" && attempts < maxAttempts) continue;
        throw err;
      }
    }

    if (!quote) throw new Error("No se pudo generar código único");

    try {
      const { applyDefaultQuoteIncludes } = await import("@/lib/cpq/apply-default-quote-includes");
      await applyDefaultQuoteIncludes(prisma, quote.id, tenantId);
    } catch (err) {
      console.error("[ai] applyDefaultQuoteIncludes failed:", err);
    }

    try {
      const { createCrmHistoryLog } = await import("@/lib/crm-history");
      await createCrmHistoryLog({
        tenantId,
        entityType: "quote",
        entityId: quote.id,
        action: "quote_created",
        details: { code: quote.code, clientName },
        createdBy: userId,
      });
    } catch (err) {
      console.error("[ai] createCrmHistoryLog failed:", err);
    }

    if (dealId) {
      try {
        await prisma.crmDealQuote.create({
          data: { tenantId, dealId, quoteId: quote.id },
        });
        const { computeCpqQuoteCosts } = await import("@/modules/cpq/costing/compute-quote-costs");
        const costs = await computeCpqQuoteCosts(quote.id);
        if (costs.monthlyTotal > 0) {
          await prisma.crmDeal.update({
            where: { id: dealId },
            data: { amount: costs.monthlyTotal, totalPuestos: costs.totalGuards },
          });
        }
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code: string }).code
            : "";
        if (code !== "P2002") {
          console.error("[ai] linkDealQuote failed:", err);
        }
      }
    }

    await logAiAction({
      tenantId, userId, toolName: "create_quote", args,
      status: "success",
      resultEntityId: quote.id,
      resultEntityType: "cpq_quote",
      startedAt: t0,
    });

    return {
      ok: true,
      data: {
        id: quote.id,
        entityType: "cpq_quote",
        code: quote.code,
        name: quote.name ?? quote.code,
        url: `/crm/cotizaciones/${quote.id}`,
        accountId: quote.accountId,
        accountName: account.name,
        validUntil: quote.validUntil,
        status: quote.status,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_quote", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear la cotización: ${msg}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// FINANZAS: helpers compartidos por preview/create de DTEs
// ─────────────────────────────────────────────────────────────────────────

type DteLineInput = {
  itemName: string;
  quantity: number;
  unitPrice: number;
  unitPriceUf?: number;
  discountPct?: number;
  isExempt?: boolean;
};

async function resolveDteReceiver(
  tenantId: string,
  rutOrName?: string,
  explicitRut?: string,
  explicitName?: string,
): Promise<{
  rut: string;
  name: string;
  accountId: string | null;
  email: string | null;
  giro: string | null;
  address: string | null;
  commune: string | null;
  ciudad: string | null;
}> {
  if (explicitRut && explicitName) {
    return {
      rut: explicitRut,
      name: explicitName,
      accountId: null,
      email: null,
      giro: null,
      address: null,
      commune: null,
      ciudad: null,
    };
  }
  if (rutOrName) {
    const acc = await resolveAccountByRutOrName(tenantId, rutOrName);
    if (acc) {
      const full = await prisma.crmAccount.findFirst({
        where: { id: acc.id, tenantId },
        select: {
          id: true, name: true, legalName: true, rut: true, address: true,
          commune: true, city: true, giro: true,
        },
      });
      if (full) {
        return {
          rut: full.rut ?? "",
          name: full.legalName ?? full.name,
          accountId: full.id,
          email: null,
          giro: full.giro,
          address: full.address,
          commune: full.commune,
          ciudad: full.city,
        };
      }
    }
  }
  throw new Error(
    "No pude identificar el receptor del DTE. Dame RUT y razón social, o el nombre del cliente para buscarlo en el CRM.",
  );
}

function dteTypeLabel(dteType: number): string {
  switch (dteType) {
    case 33: return "Factura afecta";
    case 34: return "Factura exenta";
    case 39: return "Boleta";
    case 41: return "Boleta exenta";
    case 56: return "Nota de débito";
    case 61: return "Nota de crédito";
    default: return `DTE tipo ${dteType}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// preview_invoice_draft + create_invoice_draft
// ─────────────────────────────────────────────────────────────────────────

async function toolPreviewInvoiceDraft(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue")
  ) {
    await logAiAction({ tenantId, userId, toolName: "preview_invoice_draft", args, status: "denied", errorMessage: "Sin permiso facturacion_create_draft", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear borradores de factura." };
  }

  const dteType = Number(args.dteType);
  if (![33, 34, 39].includes(dteType)) {
    return { ok: false, error: "dteType debe ser 33, 34 o 39." };
  }
  const lines = Array.isArray(args.lines) ? (args.lines as DteLineInput[]) : [];
  if (lines.length === 0) {
    return { ok: false, error: "Necesito al menos una línea con item, cantidad y precio." };
  }

  let receiver: Awaited<ReturnType<typeof resolveDteReceiver>>;
  try {
    receiver = await resolveDteReceiver(
      tenantId,
      typeof args.receiverNameOrRut === "string" ? args.receiverNameOrRut : undefined,
      typeof args.receiverRut === "string" ? args.receiverRut : undefined,
      typeof args.receiverName === "string" ? args.receiverName : undefined,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al resolver receptor" };
  }

  const currency: "CLP" | "UF" = (args.currency as "CLP" | "UF") ?? "CLP";

  let computed: Awaited<ReturnType<typeof computeDteAmounts>>;
  try {
    computed = await computeDteAmounts(
      {
        dteType,
        currency,
        lines: lines.map((l) => ({
          itemName: l.itemName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unitPriceUf: l.unitPriceUf,
          discountPct: l.discountPct ?? 0,
          isExempt: l.isExempt ?? (dteType === 34),
        })),
      } as never,
      { strict: false },
    );
  } catch (e) {
    return {
      ok: false,
      error: `No pude calcular los montos: ${e instanceof Error ? e.message : "error desconocido"}`,
    };
  }

  const additionalReferences = sanitizeAdditionalReferences(args.additionalReferences);

  const token = storePreview({
    tenantId,
    userId,
    toolName: "create_invoice_draft",
    args: {
      dteType,
      receiverRut: receiver.rut,
      receiverName: receiver.name,
      receiverEmail: typeof args.receiverEmail === "string" ? args.receiverEmail : null,
      receiverGiro: receiver.giro,
      receiverDireccion: receiver.address,
      receiverComuna: receiver.commune,
      receiverCiudad: receiver.ciudad,
      crmAccountId: receiver.accountId,
      installationId: typeof args.installationId === "string" ? args.installationId : null,
      currency,
      lines,
      notes: typeof args.notes === "string" ? args.notes : null,
      additionalReferences,
    },
    computed: {
      netAmount: computed.totalNet,
      exemptAmount: computed.totalExempt,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      currency,
      receiverRut: receiver.rut,
      receiverName: receiver.name,
    },
  });

  await logAiAction({
    tenantId, userId, toolName: "preview_invoice_draft", args,
    status: "success",
    resultEntityType: "dte_preview",
    startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken: token,
      entityType: "dte_preview",
      requiresConfirmation: true,
      dteType,
      dteTypeLabel: dteTypeLabel(dteType),
      receiverRut: receiver.rut,
      receiverName: receiver.name,
      lines: computed.lines.map((l) => ({
        itemName: l.itemName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        netAmount: l.netAmount,
        isExempt: l.isExempt,
      })),
      netAmount: computed.totalNet,
      exemptAmount: computed.totalExempt,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      currency,
      validUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
  };
}

/**
 * Resuelve el receptor + calcula montos a partir de args sueltos (mismo
 * shape que preview_invoice_draft). Se usa como fallback en create_* cuando
 * el previewToken expiró o el cache en memoria se reinició (Vercel
 * serverless). Falla con Error si los args no son válidos.
 */
async function buildInvoiceDraftInputFromArgs(
  tenantId: string,
  args: Record<string, unknown>,
): Promise<DraftDteInput> {
  const dteType = Number(args.dteType);
  if (![33, 34, 39].includes(dteType)) {
    throw new Error("dteType debe ser 33, 34 o 39.");
  }
  const lines = Array.isArray(args.lines) ? (args.lines as DteLineInput[]) : [];
  if (lines.length === 0) {
    throw new Error("Necesito al menos una línea con item, cantidad y precio.");
  }
  const receiver = await resolveDteReceiver(
    tenantId,
    typeof args.receiverNameOrRut === "string" ? args.receiverNameOrRut : undefined,
    typeof args.receiverRut === "string" ? args.receiverRut : undefined,
    typeof args.receiverName === "string" ? args.receiverName : undefined,
  );
  const currency: "CLP" | "UF" = (args.currency as "CLP" | "UF") ?? "CLP";
  const additionalReferences = sanitizeAdditionalReferences(args.additionalReferences);
  return {
    dteType,
    receiverRut: receiver.rut,
    receiverName: receiver.name,
    receiverEmail: typeof args.receiverEmail === "string" ? args.receiverEmail : null,
    receiverGiro: receiver.giro ?? null,
    receiverDireccion: receiver.address ?? null,
    receiverComuna: receiver.commune ?? null,
    receiverCiudad: receiver.ciudad ?? null,
    crmAccountId: receiver.accountId ?? null,
    installationId: typeof args.installationId === "string" ? args.installationId : null,
    currency,
    lines,
    notes: typeof args.notes === "string" ? args.notes : null,
    additionalReferences,
  } as unknown as DraftDteInput;
}

/**
 * Normaliza el array additionalReferences que llega desde el LLM. Filtra
 * entradas inválidas (sin tipoDocRef o folioRef), corta a 40 (límite SII),
 * y rellena fchRef con hoy si viene vacía.
 */
function sanitizeAdditionalReferences(raw: unknown): Array<{
  tipoDocRef: string;
  folioRef: string;
  fchRef: string;
  razonRef: string;
}> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const today = new Date().toISOString().split("T")[0];
  const cleaned = raw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      tipoDocRef: typeof r.tipoDocRef === "string" ? r.tipoDocRef.trim() : "",
      folioRef: typeof r.folioRef === "string" ? r.folioRef.trim() : "",
      fchRef: typeof r.fchRef === "string" && r.fchRef.trim() ? r.fchRef.trim() : today,
      razonRef: typeof r.razonRef === "string" ? r.razonRef.trim() : "",
    }))
    .filter((r) => r.tipoDocRef && r.folioRef)
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : undefined;
}

async function toolCreateInvoiceDraft(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue")
  ) {
    return { ok: false, error: "No tienes permiso para crear borradores de factura." };
  }

  // Estrategia: aceptar previewToken (path feliz) O fallback a args
  // completos. El cache en memoria no sobrevive entre invocaciones de
  // funciones serverless (Vercel) ni HMR de Next dev, así que confiar
  // exclusivamente en el token rompe el flujo. El sistema prompt instruye
  // al LLM a pasar SIEMPRE los mismos args usados en preview, y el token
  // si lo tiene a mano.
  const token = typeof args.previewToken === "string" ? args.previewToken : "";
  let draftInput: DraftDteInput | null = null;
  if (token) {
    const payload = consumePreview(token, tenantId, userId, "create_invoice_draft");
    if (payload) draftInput = payload.args as unknown as DraftDteInput;
  }
  if (!draftInput) {
    try {
      draftInput = await buildInvoiceDraftInputFromArgs(tenantId, args);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Faltan datos para crear el borrador.",
      };
    }
  }

  try {
    const draft = await createDraftDte(tenantId, userId, draftInput);

    await logAiAction({
      tenantId, userId, toolName: "create_invoice_draft", args,
      status: "success",
      resultEntityId: draft.id,
      resultEntityType: "finance_dte_draft",
      startedAt: t0,
    });

    const label = dteTypeLabel(draft.dteType);
    return {
      ok: true,
      data: {
        id: draft.id,
        entityType: "finance_dte_draft",
        name: `${label} borrador`,
        dteType: draft.dteType,
        dteTypeLabel: label,
        folio: draft.folio,
        code: draft.code,
        receiverRut: draft.receiverRut,
        receiverName: draft.receiverName,
        netAmount: Number(draft.netAmount),
        taxAmount: Number(draft.taxAmount),
        totalAmount: Number(draft.totalAmount),
        currency: draft.currency,
        url: `/finanzas/facturacion/emitir?draftId=${draft.id}`,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error desconocido";
    await logAiAction({
      tenantId, userId, toolName: "create_invoice_draft", args,
      status: "internal_error", errorMessage: msg, startedAt: t0,
    });
    return { ok: false, error: `No pude crear el borrador: ${msg}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// preview/create credit note (NC tipo 61)
// ─────────────────────────────────────────────────────────────────────────

async function resolveDteReferenceForNcNd(
  tenantId: string,
  args: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      original: {
        id: string;
        folio: number;
        dteType: number;
        date: Date;
        receiverRut: string;
        receiverName: string;
      };
    }
  | { ok: false; error: string }
> {
  const refFolio = typeof args.referenceFolio === "number" ? args.referenceFolio : null;
  const refId = typeof args.referenceDteId === "string" ? args.referenceDteId : null;
  if (!refFolio && !refId) {
    return { ok: false, error: "Falta referenceFolio o referenceDteId del DTE original." };
  }
  let dte;
  if (refId) {
    dte = await prisma.financeDte.findFirst({
      where: { id: refId, tenantId, direction: "ISSUED", siiStatus: { not: "DRAFT" } },
      select: {
        id: true, folio: true, dteType: true, date: true,
        receiverRut: true, receiverName: true,
      },
    });
  } else if (refFolio) {
    const found = await resolveDteByFolio(tenantId, refFolio);
    if (found) {
      dte = {
        id: found.id, folio: found.folio, dteType: found.dteType, date: found.date,
        receiverRut: found.receiverRut, receiverName: found.receiverName,
      };
    }
  }
  if (!dte) {
    return { ok: false, error: `No encontré el DTE referenciado (folio ${refFolio ?? "?"}).` };
  }
  return { ok: true, original: dte };
}

async function toolPreviewCreditNoteDraft(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_credit_note") &&
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue")
  ) {
    await logAiAction({ tenantId, userId, toolName: "preview_credit_note_draft", args, status: "denied", errorMessage: "Sin permiso", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear notas de crédito." };
  }
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  if (!reason) return { ok: false, error: "Necesito una razón para la NC (campo reason)." };
  const lines = Array.isArray(args.lines) ? (args.lines as DteLineInput[]) : [];
  if (lines.length === 0) return { ok: false, error: "Necesito al menos una línea." };
  const referenceCode = ([1, 2, 3] as const).includes(args.referenceCode as 1 | 2 | 3)
    ? (args.referenceCode as 1 | 2 | 3)
    : 1;

  const ref = await resolveDteReferenceForNcNd(tenantId, args);
  if (!ref.ok) return { ok: false, error: ref.error };
  const original = ref.original;

  // Receptor de la NC = receptor del DTE original (siempre).
  const accountFull = await prisma.crmAccount.findFirst({
    where: { tenantId, rut: original.receiverRut },
    select: { id: true, address: true, commune: true, city: true, giro: true },
  });

  let computed: Awaited<ReturnType<typeof computeDteAmounts>>;
  try {
    computed = await computeDteAmounts(
      {
        dteType: 61,
        currency: "CLP",
        lines: lines.map((l) => ({
          itemName: l.itemName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPct: 0,
          isExempt: l.isExempt ?? false,
        })),
      } as never,
      { strict: false },
    );
  } catch (e) {
    return { ok: false, error: `No pude calcular los montos: ${e instanceof Error ? e.message : "?"}` };
  }

  const token = storePreview({
    tenantId,
    userId,
    toolName: "create_credit_note_draft",
    args: {
      dteType: 61,
      receiverRut: original.receiverRut,
      receiverName: original.receiverName,
      receiverGiro: accountFull?.giro ?? null,
      receiverDireccion: accountFull?.address ?? null,
      receiverComuna: accountFull?.commune ?? null,
      receiverCiudad: accountFull?.city ?? null,
      crmAccountId: accountFull?.id ?? null,
      currency: "CLP",
      lines,
      notes: null,
      reference: {
        docId: original.id,
        type: original.dteType,
        folio: original.folio,
        date: original.date.toISOString().slice(0, 10),
        code: referenceCode,
        reason,
      },
    },
    computed: {
      netAmount: computed.totalNet,
      exemptAmount: computed.totalExempt,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      currency: "CLP",
      receiverRut: original.receiverRut,
      receiverName: original.receiverName,
      referenceFolio: original.folio,
      reason,
    },
  });

  await logAiAction({
    tenantId, userId, toolName: "preview_credit_note_draft", args,
    status: "success", resultEntityType: "dte_preview", startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken: token,
      entityType: "dte_preview",
      requiresConfirmation: true,
      dteType: 61,
      dteTypeLabel: "Nota de crédito",
      receiverRut: original.receiverRut,
      receiverName: original.receiverName,
      referenceFolio: original.folio,
      referenceCode,
      reason,
      lines: computed.lines.map((l) => ({
        itemName: l.itemName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        netAmount: l.netAmount,
        isExempt: l.isExempt,
      })),
      netAmount: computed.totalNet,
      exemptAmount: computed.totalExempt,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      currency: "CLP",
      validUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
  };
}

async function buildNcNdDraftInputFromArgs(
  tenantId: string,
  args: Record<string, unknown>,
  noteType: 56 | 61,
): Promise<{ input: DraftDteInput; referenceFolio: number; reason: string }> {
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  if (!reason) throw new Error("Necesito una razón para la nota.");
  const lines = Array.isArray(args.lines) ? (args.lines as DteLineInput[]) : [];
  if (lines.length === 0) throw new Error("Necesito al menos una línea.");
  const referenceCode = ([1, 2, 3] as const).includes(args.referenceCode as 1 | 2 | 3)
    ? (args.referenceCode as 1 | 2 | 3)
    : 1;
  const ref = await resolveDteReferenceForNcNd(tenantId, args);
  if (!ref.ok) throw new Error(ref.error);
  const original = ref.original;
  const accountFull = await prisma.crmAccount.findFirst({
    where: { tenantId, rut: original.receiverRut },
    select: { id: true, address: true, commune: true, city: true, giro: true },
  });
  return {
    referenceFolio: original.folio,
    reason,
    input: {
      dteType: noteType,
      receiverRut: original.receiverRut,
      receiverName: original.receiverName,
      receiverGiro: accountFull?.giro ?? null,
      receiverDireccion: accountFull?.address ?? null,
      receiverComuna: accountFull?.commune ?? null,
      receiverCiudad: accountFull?.city ?? null,
      crmAccountId: accountFull?.id ?? null,
      currency: "CLP",
      lines,
      notes: null,
      reference: {
        docId: original.id,
        type: original.dteType,
        folio: original.folio,
        date: original.date.toISOString().slice(0, 10),
        code: noteType === 61 ? referenceCode : (1 as 1),
        reason,
      },
    } as unknown as DraftDteInput,
  };
}

async function toolCreateCreditNoteDraft(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_credit_note") &&
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue")
  ) {
    return { ok: false, error: "No tienes permiso para crear notas de crédito." };
  }
  const token = typeof args.previewToken === "string" ? args.previewToken : "";
  let draftInput: DraftDteInput | null = null;
  let referenceFolio: number | null = null;
  let reason = "";
  if (token) {
    const payload = consumePreview(token, tenantId, userId, "create_credit_note_draft");
    if (payload) {
      draftInput = payload.args as unknown as DraftDteInput;
      referenceFolio = (payload.computed.referenceFolio as number) ?? null;
      reason = (payload.computed.reason as string) ?? "";
    }
  }
  if (!draftInput) {
    try {
      const built = await buildNcNdDraftInputFromArgs(tenantId, args, 61);
      draftInput = built.input;
      referenceFolio = built.referenceFolio;
      reason = built.reason;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Faltan datos para crear la NC." };
    }
  }
  try {
    const draft = await createDraftDte(tenantId, userId, draftInput);
    await logAiAction({
      tenantId, userId, toolName: "create_credit_note_draft", args,
      status: "success", resultEntityId: draft.id, resultEntityType: "finance_dte_credit_note",
      startedAt: t0,
    });
    return {
      ok: true,
      data: {
        id: draft.id,
        entityType: "finance_dte_credit_note",
        name: `NC borrador para Factura #${referenceFolio}`,
        dteType: 61,
        dteTypeLabel: "Nota de crédito",
        folio: draft.folio,
        code: draft.code,
        receiverRut: draft.receiverRut,
        receiverName: draft.receiverName,
        referenceFolio,
        reason,
        netAmount: Number(draft.netAmount),
        taxAmount: Number(draft.taxAmount),
        totalAmount: Number(draft.totalAmount),
        url: `/finanzas/facturacion/emitir?draftId=${draft.id}`,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    await logAiAction({
      tenantId, userId, toolName: "create_credit_note_draft", args,
      status: "internal_error", errorMessage: msg, startedAt: t0,
    });
    return { ok: false, error: `No pude crear la NC: ${msg}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// preview/create debit note (ND tipo 56)
// ─────────────────────────────────────────────────────────────────────────

async function toolPreviewDebitNoteDraft(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_credit_note") &&
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue")
  ) {
    await logAiAction({ tenantId, userId, toolName: "preview_debit_note_draft", args, status: "denied", errorMessage: "Sin permiso", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear notas de débito." };
  }
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  if (!reason) return { ok: false, error: "Necesito una razón para la ND (campo reason)." };
  const lines = Array.isArray(args.lines) ? (args.lines as DteLineInput[]) : [];
  if (lines.length === 0) return { ok: false, error: "Necesito al menos una línea." };

  const ref = await resolveDteReferenceForNcNd(tenantId, args);
  if (!ref.ok) return { ok: false, error: ref.error };
  const original = ref.original;

  const accountFull = await prisma.crmAccount.findFirst({
    where: { tenantId, rut: original.receiverRut },
    select: { id: true, address: true, commune: true, city: true, giro: true },
  });

  let computed: Awaited<ReturnType<typeof computeDteAmounts>>;
  try {
    computed = await computeDteAmounts(
      {
        dteType: 56,
        currency: "CLP",
        lines: lines.map((l) => ({
          itemName: l.itemName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPct: 0,
          isExempt: l.isExempt ?? false,
        })),
      } as never,
      { strict: false },
    );
  } catch (e) {
    return { ok: false, error: `No pude calcular los montos: ${e instanceof Error ? e.message : "?"}` };
  }

  const token = storePreview({
    tenantId,
    userId,
    toolName: "create_debit_note_draft",
    args: {
      dteType: 56,
      receiverRut: original.receiverRut,
      receiverName: original.receiverName,
      receiverGiro: accountFull?.giro ?? null,
      receiverDireccion: accountFull?.address ?? null,
      receiverComuna: accountFull?.commune ?? null,
      receiverCiudad: accountFull?.city ?? null,
      crmAccountId: accountFull?.id ?? null,
      currency: "CLP",
      lines,
      notes: null,
      reference: {
        docId: original.id,
        type: original.dteType,
        folio: original.folio,
        date: original.date.toISOString().slice(0, 10),
        // ND no usa CodRef en sentido estricto; SII acepta 1.
        code: 1 as 1,
        reason,
      },
    },
    computed: {
      netAmount: computed.totalNet,
      exemptAmount: computed.totalExempt,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      currency: "CLP",
      receiverRut: original.receiverRut,
      receiverName: original.receiverName,
      referenceFolio: original.folio,
      reason,
    },
  });

  await logAiAction({
    tenantId, userId, toolName: "preview_debit_note_draft", args,
    status: "success", resultEntityType: "dte_preview", startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken: token,
      entityType: "dte_preview",
      requiresConfirmation: true,
      dteType: 56,
      dteTypeLabel: "Nota de débito",
      receiverRut: original.receiverRut,
      receiverName: original.receiverName,
      referenceFolio: original.folio,
      reason,
      lines: computed.lines.map((l) => ({
        itemName: l.itemName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        netAmount: l.netAmount,
        isExempt: l.isExempt,
      })),
      netAmount: computed.totalNet,
      exemptAmount: computed.totalExempt,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      currency: "CLP",
      validUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
  };
}

async function toolCreateDebitNoteDraft(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_credit_note") &&
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue")
  ) {
    return { ok: false, error: "No tienes permiso para crear notas de débito." };
  }
  const token = typeof args.previewToken === "string" ? args.previewToken : "";
  let draftInput: DraftDteInput | null = null;
  let referenceFolio: number | null = null;
  let reason = "";
  if (token) {
    const payload = consumePreview(token, tenantId, userId, "create_debit_note_draft");
    if (payload) {
      draftInput = payload.args as unknown as DraftDteInput;
      referenceFolio = (payload.computed.referenceFolio as number) ?? null;
      reason = (payload.computed.reason as string) ?? "";
    }
  }
  if (!draftInput) {
    try {
      const built = await buildNcNdDraftInputFromArgs(tenantId, args, 56);
      draftInput = built.input;
      referenceFolio = built.referenceFolio;
      reason = built.reason;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Faltan datos para crear la ND." };
    }
  }
  try {
    const draft = await createDraftDte(tenantId, userId, draftInput);
    await logAiAction({
      tenantId, userId, toolName: "create_debit_note_draft", args,
      status: "success", resultEntityId: draft.id, resultEntityType: "finance_dte_debit_note",
      startedAt: t0,
    });
    return {
      ok: true,
      data: {
        id: draft.id,
        entityType: "finance_dte_debit_note",
        name: `ND borrador para Factura #${referenceFolio}`,
        dteType: 56,
        dteTypeLabel: "Nota de débito",
        folio: draft.folio,
        code: draft.code,
        receiverRut: draft.receiverRut,
        receiverName: draft.receiverName,
        referenceFolio,
        reason,
        netAmount: Number(draft.netAmount),
        taxAmount: Number(draft.taxAmount),
        totalAmount: Number(draft.totalAmount),
        url: `/finanzas/facturacion/emitir?draftId=${draft.id}`,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    await logAiAction({
      tenantId, userId, toolName: "create_debit_note_draft", args,
      status: "internal_error", errorMessage: msg, startedAt: t0,
    });
    return { ok: false, error: `No pude crear la ND: ${msg}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// preview/create recurring invoice template
// ─────────────────────────────────────────────────────────────────────────

async function toolPreviewRecurringInvoice(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue") &&
    !hasFacturacionCapability(perms, "facturacion_configure")
  ) {
    await logAiAction({ tenantId, userId, toolName: "preview_recurring_invoice", args, status: "denied", errorMessage: "Sin permiso", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear plantillas recurrentes." };
  }

  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (!name) return { ok: false, error: "Necesito un nombre para la plantilla." };
  const dteType = Number(args.dteType);
  if (![33, 34].includes(dteType)) return { ok: false, error: "dteType debe ser 33 o 34 para recurrentes." };
  const frequency = typeof args.frequency === "string" ? args.frequency : "";
  if (!["monthly", "biweekly", "weekly", "yearly"].includes(frequency)) {
    return { ok: false, error: "frequency debe ser monthly, biweekly, weekly o yearly." };
  }
  const startDate = typeof args.startDate === "string" ? args.startDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { ok: false, error: "startDate debe estar en formato YYYY-MM-DD." };
  }
  const lines = Array.isArray(args.lines) ? (args.lines as DteLineInput[]) : [];
  if (lines.length === 0) return { ok: false, error: "Necesito al menos una línea." };

  let receiver: Awaited<ReturnType<typeof resolveDteReceiver>>;
  try {
    receiver = await resolveDteReceiver(
      tenantId,
      typeof args.receiverNameOrRut === "string" ? args.receiverNameOrRut : undefined,
      typeof args.receiverRut === "string" ? args.receiverRut : undefined,
      typeof args.receiverName === "string" ? args.receiverName : undefined,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al resolver receptor" };
  }

  const currency: "CLP" | "UF" = (args.currency as "CLP" | "UF") ?? "CLP";

  let computed: Awaited<ReturnType<typeof computeDteAmounts>>;
  try {
    computed = await computeDteAmounts(
      {
        dteType,
        currency,
        lines: lines.map((l) => ({
          itemName: l.itemName,
          quantity: l.quantity,
          unitPrice: l.unitPrice ?? 0,
          unitPriceUf: l.unitPriceUf,
          discountPct: l.discountPct ?? 0,
          isExempt: l.isExempt ?? (dteType === 34),
        })),
      } as never,
      { strict: false },
    );
  } catch (e) {
    return { ok: false, error: `No pude calcular los montos: ${e instanceof Error ? e.message : "?"}` };
  }

  const dayOfMonth = typeof args.dayOfMonth === "number" ? args.dayOfMonth : null;
  const dayOfWeek = typeof args.dayOfWeek === "number" ? args.dayOfWeek : null;
  const monthOfYear = typeof args.monthOfYear === "number" ? args.monthOfYear : null;
  const endDate = typeof args.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.endDate) ? args.endDate : null;

  const { computeNextRunAt } = await import("@/modules/finance/billing/dte-recurring.service");
  const nextRunAt = computeNextRunAt({
    frequency,
    dayOfMonth,
    dayOfWeek,
    monthOfYear,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    lastRunAt: null,
  } as never);

  const token = storePreview({
    tenantId,
    userId,
    toolName: "create_recurring_invoice",
    args: {
      name,
      dteType,
      receiverRut: receiver.rut,
      receiverName: receiver.name,
      receiverEmail: typeof args.receiverEmail === "string" ? args.receiverEmail : null,
      receiverGiro: receiver.giro,
      receiverDireccion: receiver.address,
      receiverComuna: receiver.commune,
      receiverCiudad: receiver.ciudad,
      crmAccountId: receiver.accountId,
      installationId: typeof args.installationId === "string" ? args.installationId : null,
      currency,
      frequency,
      dayOfMonth,
      dayOfWeek,
      monthOfYear,
      startDate,
      endDate,
      lines,
      notes: typeof args.notes === "string" ? args.notes : null,
      autoSendEmail: typeof args.autoSendEmail === "boolean" ? args.autoSendEmail : true,
      ufFixingPolicy: typeof args.ufFixingPolicy === "string" ? args.ufFixingPolicy : "RUN_DAY",
      ufFixingDay: typeof args.ufFixingDay === "number" ? args.ufFixingDay : null,
      periodPolicy: typeof args.periodPolicy === "string" ? args.periodPolicy : "CURRENT_MONTH",
      additionalReferences: sanitizeAdditionalReferences(args.additionalReferences),
    },
    computed: {
      netAmount: computed.totalNet,
      exemptAmount: computed.totalExempt,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      currency,
      receiverRut: receiver.rut,
      receiverName: receiver.name,
      nextRunAt: nextRunAt ? nextRunAt.toISOString().slice(0, 10) : null,
    },
  });

  await logAiAction({
    tenantId, userId, toolName: "preview_recurring_invoice", args,
    status: "success", resultEntityType: "dte_preview", startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken: token,
      entityType: "dte_preview",
      requiresConfirmation: true,
      name,
      dteType,
      dteTypeLabel: dteTypeLabel(dteType),
      frequency,
      dayOfMonth,
      dayOfWeek,
      monthOfYear,
      startDate,
      endDate,
      receiverRut: receiver.rut,
      receiverName: receiver.name,
      currency,
      netAmount: computed.totalNet,
      exemptAmount: computed.totalExempt,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      nextRunAt: nextRunAt ? nextRunAt.toISOString().slice(0, 10) : null,
      validUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
  };
}

async function toolCreateRecurringInvoice(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue") &&
    !hasFacturacionCapability(perms, "facturacion_configure")
  ) {
    return { ok: false, error: "No tienes permiso para crear plantillas recurrentes." };
  }
  const token = typeof args.previewToken === "string" ? args.previewToken : "";
  if (!token) return { ok: false, error: "Falta previewToken. Llama primero preview_recurring_invoice." };
  const payload = consumePreview(token, tenantId, userId, "create_recurring_invoice");
  if (!payload) {
    return { ok: false, error: "El previewToken no existe o expiró. Vuelve a llamar preview_recurring_invoice." };
  }

  const p = payload.args as {
    name: string;
    dteType: number;
    receiverRut: string;
    receiverName: string;
    receiverEmail: string | null;
    receiverGiro: string | null;
    receiverDireccion: string | null;
    receiverComuna: string | null;
    receiverCiudad: string | null;
    crmAccountId: string | null;
    installationId: string | null;
    currency: string;
    frequency: string;
    dayOfMonth: number | null;
    dayOfWeek: number | null;
    monthOfYear: number | null;
    startDate: string;
    endDate: string | null;
    lines: DteLineInput[];
    notes: string | null;
    autoSendEmail: boolean;
    ufFixingPolicy: string;
    ufFixingDay: number | null;
    periodPolicy: string;
    additionalReferences?: Array<{
      tipoDocRef: string;
      folioRef: string;
      fchRef: string;
      razonRef: string;
    }>;
  };

  try {
    const startDate = new Date(p.startDate);
    const endDate = p.endDate ? new Date(p.endDate) : null;
    const { computeNextRunAt } = await import("@/modules/finance/billing/dte-recurring.service");
    const nextRunAt = computeNextRunAt({
      frequency: p.frequency,
      dayOfMonth: p.dayOfMonth,
      dayOfWeek: p.dayOfWeek,
      monthOfYear: p.monthOfYear,
      startDate,
      endDate,
      lastRunAt: null,
    } as never);

    const template = await prisma.financeDteRecurringTemplate.create({
      data: {
        tenantId,
        name: p.name,
        dteType: p.dteType,
        receiverRut: p.receiverRut,
        receiverName: p.receiverName,
        receiverEmail: p.receiverEmail,
        receiverGiro: p.receiverGiro,
        receiverDireccion: p.receiverDireccion,
        receiverComuna: p.receiverComuna,
        receiverCiudad: p.receiverCiudad,
        crmAccountId: p.crmAccountId,
        installationId: p.installationId,
        currency: p.currency,
        lines: p.lines as unknown as Prisma.InputJsonValue,
        notes: p.notes,
        frequency: p.frequency,
        dayOfMonth: p.dayOfMonth,
        dayOfWeek: p.dayOfWeek,
        monthOfYear: p.monthOfYear,
        startDate,
        endDate,
        nextRunAt,
        autoSendEmail: p.autoSendEmail,
        ufFixingPolicy: p.ufFixingPolicy,
        ufFixingDay: p.ufFixingDay,
        periodPolicy: p.periodPolicy,
        additionalReferences:
          p.additionalReferences && p.additionalReferences.length > 0
            ? (p.additionalReferences as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        createdBy: userId,
      },
      select: {
        id: true, name: true, dteType: true, frequency: true,
        receiverName: true, nextRunAt: true,
      },
    });

    await logAiAction({
      tenantId, userId, toolName: "create_recurring_invoice", args,
      status: "success", resultEntityId: template.id, resultEntityType: "finance_dte_recurring",
      startedAt: t0,
    });

    const freqLabel: Record<string, string> = {
      monthly: "Mensual",
      biweekly: "Quincenal",
      weekly: "Semanal",
      yearly: "Anual",
    };
    return {
      ok: true,
      data: {
        id: template.id,
        entityType: "finance_dte_recurring",
        name: template.name,
        frequencyLabel: freqLabel[template.frequency] ?? template.frequency,
        receiverName: template.receiverName,
        nextRunAt: template.nextRunAt,
        totalAmount: payload.computed.totalAmount,
        currency: payload.computed.currency,
        url: `/finanzas/facturacion/recurrentes`,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    await logAiAction({
      tenantId, userId, toolName: "create_recurring_invoice", args,
      status: "internal_error", errorMessage: msg, startedAt: t0,
    });
    return { ok: false, error: `No pude crear la plantilla recurrente: ${msg}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// create_factoring_company
// ─────────────────────────────────────────────────────────────────────────

async function toolCreateFactoringCompany(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hasFacturacionCapability(perms, "facturacion_configure")) {
    await logAiAction({ tenantId, userId, toolName: "create_factoring_company", args, status: "denied", errorMessage: "Sin permiso facturacion_configure", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear empresas de factoring." };
  }
  const input = {
    rut: typeof args.rut === "string" ? args.rut : "",
    razonSocial: typeof args.name === "string" ? args.name : "",
    contactName: typeof args.executiveName === "string" ? args.executiveName : null,
    contactEmail: typeof args.executiveEmail === "string" ? args.executiveEmail : null,
    contactPhone: typeof args.executivePhone === "string" ? args.executivePhone : null,
    defaultAdvanceRate: typeof args.defaultAdvanceRate === "number" ? args.defaultAdvanceRate : null,
    defaultInterestRate: typeof args.defaultInterestRate === "number" ? args.defaultInterestRate : null,
    defaultCommissionAmount:
      typeof args.defaultCommissionAmount === "number"
        ? args.defaultCommissionAmount
        : null,
    notes: typeof args.notes === "string" ? args.notes : null,
  };
  const parsed = factoringCompanyInputSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_factoring_company", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  try {
    const created = await createFactoringCompany(tenantId, parsed.data);
    await logAiAction({
      tenantId, userId, toolName: "create_factoring_company", args,
      status: "success", resultEntityId: created.id,
      resultEntityType: "finance_factoring_company", startedAt: t0,
    });
    return {
      ok: true,
      data: {
        id: created.id,
        entityType: "finance_factoring_company",
        name: created.razonSocial,
        rut: created.rutFormatted,
        executiveName: created.contactName,
        url: `/finanzas/facturacion/cesiones/factorings`,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    await logAiAction({
      tenantId, userId, toolName: "create_factoring_company", args,
      status: "internal_error", errorMessage: msg, startedAt: t0,
    });
    return { ok: false, error: `No pude crear la empresa de factoring: ${msg}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// search_dtes + get_dte_detail
// ─────────────────────────────────────────────────────────────────────────

async function toolSearchDtes(tenantId: string, args: Record<string, unknown>) {
  const search = typeof args.search === "string" ? args.search.trim() : "";
  const periodo = typeof args.periodo === "string" ? args.periodo : "";
  const status = typeof args.status === "string" ? args.status : "issued";
  const accountId = typeof args.accountId === "string" ? args.accountId : "";
  const installationId = typeof args.installationId === "string" ? args.installationId : "";
  const limitRaw = typeof args.limit === "number" ? args.limit : 15;
  const limit = Math.min(Math.max(1, limitRaw), 50);

  const where: Prisma.FinanceDteWhereInput = {
    tenantId,
    direction: "ISSUED",
  };
  if (status === "draft") where.siiStatus = "DRAFT";
  else if (status === "issued") where.siiStatus = { not: "DRAFT" };
  if (accountId) where.crmAccountId = accountId;
  if (installationId) where.installationId = installationId;
  if (periodo && /^\d{4}-\d{2}$/.test(periodo)) {
    const [y, m] = periodo.split("-").map((s) => parseInt(s, 10));
    where.date = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }
  if (search) {
    const rutNeedle = search.replace(/[.\-\s]/g, "");
    // Match DTEs por nombre/razón social de la cuenta CRM enlazada. No hay
    // relación Prisma directa entre FinanceDte y CrmAccount (sólo el FK
    // crmAccountId como String), así que pre-buscamos los IDs y filtramos
    // por crmAccountId IN (...). Esto permite que "Ametel" (nombre de
    // fantasía) matchee facturas cuyo receiverName es la razón social.
    const matchingAccounts = await prisma.crmAccount.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { legalName: { contains: search, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 50,
    });
    const orClauses: Prisma.FinanceDteWhereInput[] = [
      { receiverName: { contains: search, mode: "insensitive" } },
      { receiverRut: { contains: rutNeedle, mode: "insensitive" } },
    ];
    if (matchingAccounts.length > 0) {
      orClauses.push({ crmAccountId: { in: matchingAccounts.map((a) => a.id) } });
    }
    if (/^\d+$/.test(search)) {
      const folioNum = parseInt(search, 10);
      if (!Number.isNaN(folioNum)) orClauses.push({ folio: folioNum });
    }
    const amountStr = search.replace(/[.\s]/g, "").replace(",", ".");
    if (/^\d+(\.\d+)?$/.test(amountStr)) {
      const amountNum = parseFloat(amountStr);
      if (amountNum > 0) orClauses.push({ totalAmount: amountNum });
    }
    const rangeMatch = search.match(/^([\d.]+)\s*-\s*([\d.]+)$/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1].replace(/\./g, ""));
      const max = parseFloat(rangeMatch[2].replace(/\./g, ""));
      if (!Number.isNaN(min) && !Number.isNaN(max) && min <= max) {
        orClauses.push({ totalAmount: { gte: min, lte: max } });
      }
    }
    where.OR = orClauses;
  }

  const dtes = await prisma.financeDte.findMany({
    where,
    orderBy: [{ date: "desc" }, { folio: "desc" }],
    take: limit,
    select: {
      id: true, folio: true, dteType: true, date: true,
      receiverRut: true, receiverName: true, totalAmount: true,
      siiStatus: true, paymentStatus: true, currency: true,
      crmAccountId: true,
    },
  });

  // Resolver nombres de cuenta CRM en una sola consulta (no hay relation).
  const accountIds = Array.from(
    new Set(dtes.map((d) => d.crmAccountId).filter((x): x is string => Boolean(x))),
  );
  const accounts = accountIds.length > 0
    ? await prisma.crmAccount.findMany({
        where: { tenantId, id: { in: accountIds } },
        select: { id: true, name: true },
      })
    : [];
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

  return dtes.map((d) => ({
    id: d.id,
    folio: d.folio,
    dteType: d.dteType,
    dteTypeLabel: dteTypeLabel(d.dteType),
    date: d.date,
    receiverRut: d.receiverRut,
    receiverName: d.receiverName,
    accountName: d.crmAccountId ? accountNameById.get(d.crmAccountId) ?? null : null,
    totalAmount: Number(d.totalAmount),
    currency: d.currency,
    siiStatus: d.siiStatus,
    paymentStatus: d.paymentStatus,
    url: `/finanzas/facturacion/emitidos`,
  }));
}

async function toolGetDteDetail(tenantId: string, args: Record<string, unknown>) {
  const folio = typeof args.folio === "number" ? args.folio : null;
  const dteId = typeof args.dteId === "string" ? args.dteId : null;
  if (!folio && !dteId) return { ok: false, error: "Dame folio o dteId." };

  const dte = await prisma.financeDte.findFirst({
    where: {
      tenantId,
      direction: "ISSUED",
      ...(folio ? { folio, siiStatus: { not: "DRAFT" } } : { id: dteId! }),
    },
    include: {
      lines: { orderBy: { lineNumber: "asc" } },
      referencedBy: {
        where: { dteType: { in: [56, 61] } },
        select: {
          id: true, folio: true, dteType: true, totalAmount: true,
          siiStatus: true, date: true, referenceReason: true, referenceCode: true,
        },
        orderBy: { date: "desc" },
      },
      paymentAllocations: {
        select: {
          id: true, amount: true,
          payment: { select: { id: true, amount: true, date: true } },
        },
      },
      factoringOps: {
        select: {
          id: true, code: true, status: true, advanceAmount: true,
          factoringCompany: true,
          factoringCompanyRel: { select: { id: true, razonSocial: true } },
        },
      },
    },
  });
  if (!dte) return { ok: false, error: "DTE no encontrado." };

  const account = dte.crmAccountId
    ? await prisma.crmAccount.findFirst({
        where: { id: dte.crmAccountId, tenantId },
        select: { id: true, name: true },
      })
    : null;
  const installation = dte.installationId
    ? await prisma.crmInstallation.findFirst({
        where: { id: dte.installationId, tenantId },
        select: { id: true, name: true, commune: true },
      })
    : null;

  const creditNotes = dte.referencedBy.filter((r) => r.dteType === 61);
  const debitNotes = dte.referencedBy.filter((r) => r.dteType === 56);

  return {
    ok: true,
    data: {
      id: dte.id,
      folio: dte.folio,
      dteType: dte.dteType,
      dteTypeLabel: dteTypeLabel(dte.dteType),
      date: dte.date,
      dueDate: dte.dueDate,
      receiverRut: dte.receiverRut,
      receiverName: dte.receiverName,
      totalAmount: Number(dte.totalAmount),
      netAmount: Number(dte.netAmount),
      taxAmount: Number(dte.taxAmount),
      exemptAmount: Number(dte.exemptAmount),
      currency: dte.currency,
      siiStatus: dte.siiStatus,
      paymentStatus: dte.paymentStatus,
      amountPaid: Number(dte.amountPaid),
      amountPending: Number(dte.amountPending),
      account,
      installation,
      lines: dte.lines.map((l) => ({
        lineNumber: l.lineNumber,
        itemName: l.itemName,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        netAmount: Number(l.netAmount),
        isExempt: l.isExempt,
      })),
      creditNotes: creditNotes.map((nc) => ({
        id: nc.id,
        folio: nc.folio,
        date: nc.date,
        totalAmount: Number(nc.totalAmount),
        siiStatus: nc.siiStatus,
        referenceCode: nc.referenceCode,
        reason: nc.referenceReason,
      })),
      debitNotes: debitNotes.map((nd) => ({
        id: nd.id,
        folio: nd.folio,
        date: nd.date,
        totalAmount: Number(nd.totalAmount),
        siiStatus: nd.siiStatus,
        reason: nd.referenceReason,
      })),
      hasCreditNote: creditNotes.length > 0,
      hasDebitNote: debitNotes.length > 0,
      payments: dte.paymentAllocations.map((pa) => ({
        id: pa.payment.id,
        amount: Number(pa.amount),
        paymentDate: pa.payment.date,
      })),
      factoring: dte.factoringOps.map((f) => ({
        id: f.id,
        code: f.code,
        status: f.status,
        advanceAmount: f.advanceAmount ? Number(f.advanceAmount) : null,
        factoringCompany: f.factoringCompanyRel?.razonSocial ?? f.factoringCompany,
      })),
      url: `/finanzas/facturacion/emitidos`,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Reports: ventas / income statement / balance / dashboard / profitability
// ─────────────────────────────────────────────────────────────────────────

function buildReportPeriod(from: string, to: string, label?: string) {
  return {
    type: "custom" as const,
    from,
    to,
    label: label ?? `${from} a ${to}`,
  };
}

function ensureCanViewFinanceReports(perms: RolePermissions) {
  return (
    canView(perms, "finance", "reportes") ||
    hasCapability(perms, "finance_reports_view") ||
    hasFacturacionCapability(perms, "facturacion_view")
  );
}

async function toolGetSalesReport(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (!ensureCanViewFinanceReports(perms)) {
    return { ok: false, error: "No tienes permiso para ver reportes financieros." };
  }
  const from = typeof args.from === "string" ? args.from : "";
  const to = typeof args.to === "string" ? args.to : "";
  if (!from || !to) return { ok: false, error: "from y to (YYYY-MM-DD) son obligatorios." };
  const period = buildReportPeriod(from, to, typeof args.periodLabel === "string" ? args.periodLabel : undefined);
  const filters = {
    crmAccountIds: Array.isArray(args.crmAccountIds) ? (args.crmAccountIds as string[]) : undefined,
    installationIds: Array.isArray(args.installationIds) ? (args.installationIds as string[]) : undefined,
  };
  const { getSalesMatrix } = await import("@/modules/finance/reports/sales-matrix.service");
  const data = await getSalesMatrix(tenantId, period, filters);
  const top5 = [...data.rows]
    .filter((r) => r.id !== "__no_client__")
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((r) => ({ id: r.id, label: r.label, total: r.total }));
  return { ok: true, data: { ...data, top5 } };
}

async function toolGetIncomeStatement(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (!ensureCanViewFinanceReports(perms)) {
    return { ok: false, error: "No tienes permiso para ver reportes financieros." };
  }
  const from = typeof args.from === "string" ? args.from : "";
  const to = typeof args.to === "string" ? args.to : "";
  if (!from || !to) return { ok: false, error: "from y to (YYYY-MM-DD) son obligatorios." };
  const period = buildReportPeriod(from, to);
  const { getIncomeStatement } = await import("@/modules/finance/reports/income-statement.service");
  const withComparison = args.withComparison === true;
  const data = await getIncomeStatement(tenantId, period, {}, { withComparison });
  return { ok: true, data };
}

async function toolGetBalanceSheet(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (!ensureCanViewFinanceReports(perms)) {
    return { ok: false, error: "No tienes permiso para ver reportes financieros." };
  }
  const asOf = typeof args.asOf === "string" ? args.asOf : "";
  if (!asOf) return { ok: false, error: "asOf (YYYY-MM-DD) es obligatorio." };
  const { getBalanceSheet } = await import("@/modules/finance/reports/balance-sheet.service");
  const data = await getBalanceSheet(tenantId, asOf, {}, { withPriorMonth: args.withPriorMonth === true });
  return { ok: true, data };
}

async function toolGetFinanceDashboardKpis(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (!ensureCanViewFinanceReports(perms)) {
    return { ok: false, error: "No tienes permiso para ver reportes financieros." };
  }
  const from = typeof args.from === "string" ? args.from : "";
  const to = typeof args.to === "string" ? args.to : "";
  if (!from || !to) return { ok: false, error: "from y to (YYYY-MM-DD) son obligatorios." };
  const period = buildReportPeriod(from, to);
  const { getDashboardKpis } = await import("@/modules/finance/reports/dashboard.service");
  const data = await getDashboardKpis(tenantId, period, {});
  return { ok: true, data };
}

async function toolGetProfitability(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (!ensureCanViewFinanceReports(perms)) {
    return { ok: false, error: "No tienes permiso para ver reportes financieros." };
  }
  const from = typeof args.from === "string" ? args.from : "";
  const to = typeof args.to === "string" ? args.to : "";
  if (!from || !to) return { ok: false, error: "from y to (YYYY-MM-DD) son obligatorios." };
  const period = buildReportPeriod(from, to);
  const opexAllocationMethod =
    typeof args.opexAllocationMethod === "string" &&
    ["by_revenue", "by_invoices_count", "none"].includes(args.opexAllocationMethod)
      ? (args.opexAllocationMethod as "by_revenue" | "by_invoices_count" | "none")
      : "by_revenue";
  const { getProfitability } = await import("@/modules/finance/reports/profitability.service");
  const data = await getProfitability(tenantId, period, {}, { opexAllocationMethod });
  return { ok: true, data };
}

export async function executeToolCallV2(
  toolName: string,
  args: Record<string, unknown>,
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  canViewAllRendiciones: boolean,
  pageContext: HelpChatPageContext | null = null,
): Promise<unknown> {
  const legacy = await executeLegacyTool(toolName, args, tenantId, userId, canViewAllRendiciones);
  if (legacy !== null) return legacy;

  if (toolName === "create_lead") return await toolCreateLead(tenantId, userId, perms, args);
  if (toolName === "create_account") return await toolCreateAccount(tenantId, userId, perms, args);
  if (toolName === "create_contact") return await toolCreateContact(tenantId, userId, perms, args);
  if (toolName === "create_deal") return await toolCreateDeal(tenantId, userId, perms, args);
  if (toolName === "create_installation") return await toolCreateInstallation(tenantId, userId, perms, args);
  if (toolName === "update_account") return await toolUpdateAccount(tenantId, userId, perms, args);
  if (toolName === "update_contact") return await toolUpdateContact(tenantId, userId, perms, args);
  if (toolName === "update_lead") return await toolUpdateLead(tenantId, userId, perms, args);
  if (toolName === "update_deal") return await toolUpdateDeal(tenantId, userId, perms, args);
  if (toolName === "update_installation") return await toolUpdateInstallation(tenantId, userId, perms, args);
  if (toolName === "create_quote") return await toolCreateQuote(tenantId, userId, perms, args);
  if (toolName === "clone_quote") return await aiTool_clone_quote(tenantId, userId, perms, args, pageContext);
  if (toolName === "update_quote_margin") return await aiTool_update_quote_margin(tenantId, userId, perms, args, pageContext);
  if (toolName === "update_quote_status") return await aiTool_update_quote_status(tenantId, userId, perms, args, pageContext);
  if (toolName === "add_quote_position") return await aiTool_add_quote_position(tenantId, userId, perms, args, pageContext);
  if (toolName === "preview_update_quote_position")
    return await aiTool_preview_update_quote_position(tenantId, userId, perms, args, pageContext);
  if (toolName === "update_quote_position") return await aiTool_update_quote_position(tenantId, userId, perms, args, pageContext);
  if (toolName === "preview_remove_quote_position")
    return await aiTool_preview_remove_quote_position(tenantId, userId, perms, args, pageContext);
  if (toolName === "remove_quote_position") return await aiTool_remove_quote_position(tenantId, userId, perms, args, pageContext);
  if (toolName === "get_quote_proposal") return await aiTool_get_quote_proposal(tenantId, userId, perms, args, pageContext);
  if (toolName === "manage_quote_includes") return await aiTool_manage_quote_includes(tenantId, userId, perms, args, pageContext);
  if (toolName === "preview_send_quote_proposal")
    return await aiTool_preview_send_quote_proposal(tenantId, userId, perms, args, pageContext);
  if (toolName === "send_quote_proposal") return await aiTool_send_quote_proposal(tenantId, userId, perms, args, pageContext);
  if (toolName === "preview_invoice_draft") return await toolPreviewInvoiceDraft(tenantId, userId, perms, args);
  if (toolName === "create_invoice_draft") return await toolCreateInvoiceDraft(tenantId, userId, perms, args);
  if (toolName === "preview_credit_note_draft") return await toolPreviewCreditNoteDraft(tenantId, userId, perms, args);
  if (toolName === "create_credit_note_draft") return await toolCreateCreditNoteDraft(tenantId, userId, perms, args);
  if (toolName === "preview_debit_note_draft") return await toolPreviewDebitNoteDraft(tenantId, userId, perms, args);
  if (toolName === "create_debit_note_draft") return await toolCreateDebitNoteDraft(tenantId, userId, perms, args);
  if (toolName === "preview_recurring_invoice") return await toolPreviewRecurringInvoice(tenantId, userId, perms, args);
  if (toolName === "create_recurring_invoice") return await toolCreateRecurringInvoice(tenantId, userId, perms, args);
  if (toolName === "create_factoring_company") return await toolCreateFactoringCompany(tenantId, userId, perms, args);
  if (toolName === "create_ticket") return await toolCreateTicket(tenantId, userId, perms, args);
  if (toolName === "transition_ticket") return await toolTransitionTicket(tenantId, userId, perms, args);
  if (toolName === "take_ticket") return await toolTakeTicket(tenantId, userId, perms, args);
  if (toolName === "comment_ticket") return await toolCommentTicket(tenantId, userId, perms, args);
  if (toolName === "reassign_ticket") return await toolReassignTicket(tenantId, userId, perms, args);
  if (toolName === "change_ticket_priority") return await toolChangeTicketPriority(tenantId, userId, perms, args);
  if (toolName === "preview_bulk_update_installations") return await toolPreviewBulkUpdateInstallations(tenantId, userId, perms, args);
  if (toolName === "bulk_update_installations") return await toolBulkUpdateInstallations(tenantId, userId, perms, args);
  if (toolName === "search_dtes") return { ok: true, data: await toolSearchDtes(tenantId, args) };
  if (toolName === "get_dte_detail") return await toolGetDteDetail(tenantId, args);
  if (toolName === "get_sales_report") return await toolGetSalesReport(tenantId, perms, args);
  if (toolName === "get_income_statement") return await toolGetIncomeStatement(tenantId, perms, args);
  if (toolName === "get_balance_sheet") return await toolGetBalanceSheet(tenantId, perms, args);
  if (toolName === "get_finance_dashboard_kpis") return await toolGetFinanceDashboardKpis(tenantId, perms, args);
  if (toolName === "get_profitability") return await toolGetProfitability(tenantId, perms, args);
  if (toolName === "slack_channel_context") {
    const { readChannelContextForTool } = await import("@/lib/integrations/slack/presence");
    return await readChannelContextForTool(tenantId, {
      channel: typeof args.channel === "string" ? args.channel : undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
  }

  try {
    switch (toolName) {
      case "search_accounts":
        return {
          ok: true,
          data: await toolSearchAccounts(
            tenantId,
            typeof args.query === "string" ? args.query : "",
            typeof args.limit === "number" ? args.limit : 10,
          ),
        };
      case "search_deals":
        return {
          ok: true,
          data: await toolSearchDeals(
            tenantId,
            typeof args.query === "string" ? args.query : undefined,
            typeof args.status === "string" ? args.status : undefined,
            typeof args.limit === "number" ? args.limit : 12,
          ),
        };
      case "get_deal_pipeline":
        return { ok: true, data: await toolGetDealPipeline(tenantId) };
      case "search_installations":
        return {
          ok: true,
          data: await toolSearchInstallations(
            tenantId,
            typeof args.query === "string" ? args.query : "",
            typeof args.limit === "number" ? args.limit : 10,
            typeof args.accountId === "string" ? args.accountId : undefined,
            typeof args.status === "string" ? args.status : undefined,
          ),
        };
      case "get_daily_attendance": {
        const dateStr =
          typeof args.date === "string" && args.date.length >= 8 ? args.date : todayChileStr();
        return { ok: true, data: await toolGetDailyAttendance(tenantId, dateStr) };
      }
      case "get_supervision_visits": {
        const w = typeof args.weeks_back === "number" ? args.weeks_back : 3;
        return { ok: true, data: await toolGetSupervisionVisits(tenantId, w) };
      }
      case "get_rondas_status": {
        const dateStr =
          typeof args.date === "string" && args.date.length >= 8 ? args.date : todayChileStr();
        return { ok: true, data: await toolGetRondasStatus(tenantId, dateStr) };
      }
      case "get_tickets_summary":
        return { ok: true, data: await toolGetTicketsSummary(tenantId) };
      case "get_my_tickets":
        return {
          ok: true,
          data: await toolGetMyTickets(tenantId, userId, {
            estado: typeof args.estado === "string" ? args.estado : undefined,
            prioridad: typeof args.prioridad === "string" ? args.prioridad : undefined,
            solo_vencidos_sla: args.solo_vencidos_sla === true,
          }),
        };
      case "get_finance_summary": {
        const days = typeof args.days_back === "number" ? args.days_back : 30;
        return { ok: true, data: await toolGetFinanceSummary(tenantId, days) };
      }
      case "get_user_context":
        return await toolGetUserContext(tenantId, userId);
      case "get_tenant_summary":
        return { ok: true, data: await toolGetTenantSummary(tenantId) };
      case "get_guardia_detail":
        return await toolGetGuardiaDetail(
          tenantId,
          typeof args.query === "string" ? args.query : "",
        );
      case "list_guardia_documents":
        return await toolListGuardiaDocuments(
          tenantId,
          typeof args.query === "string" ? args.query : "",
          typeof args.type === "string" ? args.type : undefined,
        );
      case "get_account_detail":
        return await toolGetAccountDetail(
          tenantId,
          typeof args.query === "string" ? args.query : "",
        );
      case "list_account_documents":
        return await toolListAccountDocuments(
          tenantId,
          typeof args.query === "string" ? args.query : "",
          typeof args.category === "string" ? args.category : undefined,
        );
      case "get_panic_alerts": {
        const dateStr =
          typeof args.date === "string" && args.date.length >= 8 ? args.date : todayChileStr();
        const daysBack = typeof args.days_back === "number" ? args.days_back : 1;
        return await toolGetPanicAlerts(tenantId, dateStr, daysBack);
      }
      case "get_daily_absences": {
        const dateStr =
          typeof args.date === "string" && args.date.length >= 8 ? args.date : todayChileStr();
        return await toolGetDailyAbsences(tenantId, dateStr);
      }
      case "get_extra_shifts": {
        const dateStr =
          typeof args.date === "string" && args.date.length >= 8 ? args.date : todayChileStr();
        const status = typeof args.status === "string" ? args.status : undefined;
        return await toolGetExtraShifts(tenantId, dateStr, status);
      }
      case "search_contacts":
        return {
          ok: true,
          data: await toolSearchContacts(
            tenantId,
            typeof args.query === "string" ? args.query : "",
            typeof args.limit === "number" ? args.limit : 10,
          ),
        };
      case "search_all":
        return {
          ok: true,
          data: await toolSearchAll(
            tenantId,
            typeof args.query === "string" ? args.query : "",
            typeof args.limit === "number" ? args.limit : 5,
          ),
        };
      case "search_quotes":
        return {
          ok: true,
          data: await toolSearchQuotes(
            tenantId,
            typeof args.query === "string" ? args.query : undefined,
            typeof args.status === "string" ? args.status : undefined,
            typeof args.limit === "number" ? args.limit : 12,
          ),
        };
      case "get_quote_detail":
        return await toolGetQuoteDetail(tenantId, perms, args, pageContext);
      case "get_entity_documents":
        return {
          ok: true,
          data: await toolGetEntityDocuments(
            tenantId,
            typeof args.entityType === "string" ? args.entityType : "",
            typeof args.entityId === "string" ? args.entityId : "",
            typeof args.limit === "number" ? args.limit : 10,
          ),
        };
      case "read_document":
        return await toolReadDocument(
          tenantId,
          typeof args.documentId === "string" ? args.documentId : "",
        );
      default:
        return { ok: false, error: "Herramienta no soportada" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al ejecutar herramienta";
    return { ok: false, error: msg };
  }
}
