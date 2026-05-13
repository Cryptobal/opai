/**
 * WA Template Seeds — Plantillas WhatsApp por defecto por slug.
 *
 * Cada slug tiene un body en formato Tiptap JSON simplificado (paragraphs con texto).
 * Estos defaults se siembran como DocTemplate (module="whatsapp", usageSlug=slug)
 * cuando se crea un tenant nuevo o cuando se ejecuta el endpoint de re-seed.
 *
 * Los tenants existentes pueden re-sembrar slugs faltantes sin sobrescribir
 * los que ya tienen plantillas activas (lógica en seedWaTemplatesForTenant).
 */

export interface WaTemplateSeed {
  slug: string;
  name: string;
  body: string; // texto plano con tokens {{module.field}}
}

/** Convierte texto plano con saltos de línea a Tiptap JSON. */
export function plainTextToTiptapJson(text: string): unknown {
  const paragraphs = text.split("\n").map((line) => {
    if (line.trim() === "") {
      return { type: "paragraph", content: [] };
    }
    return {
      type: "paragraph",
      content: [{ type: "text", text: line }],
    };
  });
  return { type: "doc", content: paragraphs };
}

export const WA_TEMPLATE_SEEDS: WaTemplateSeed[] = [
  // ── CRM ──
  {
    slug: "lead_commercial",
    name: "Nuevo lead — Comercial al cliente",
    // NOTA: este slug se renderiza en `/api/public/leads` (formulario público
    // del cotizador), donde NO hay usuario logueado al momento de generar el
    // mensaje. Por eso este seed evita tokens `{{actor.*}}` (quedarían como
    // literal en el WA prellenado del email). Si un tenant edita la plantilla
    // y agrega `{{actor.*}}`, esos tokens NO van a resolverse en este flow.
    body: `Hola {{lead.firstName}}, te escribo desde el equipo comercial de {{tenant.commercialName}}.

Vi tu solicitud para {{lead.companyName}} en {{lead.address}}: {{lead.serviceLabel}}, dotación {{lead.dotacionResumen}}. Estoy preparando tu cotización ahora.

¿Tienes 10 minutos hoy para una llamada y te explico cómo lo abordaríamos? Puedo llamarte ya o agendar para más tarde — tú decides.

Si prefieres avanzar por aquí, también puedo enviarte la propuesta directo por este chat.

{{tenant.website}}`,
  },
  {
    slug: "lead_client",
    name: "Nuevo lead — Cliente al proveedor",
    body: `Hola, soy {{lead.firstName}} {{lead.lastName}} de la empresa {{lead.companyName}}, les solicité una cotización por la página.

{{system.mapsLink}}`,
  },
  {
    slug: "proposal_sent",
    name: "Propuesta enviada",
    body: `Hola {{contact.firstName}}, te envío la propuesta para {{account.name}}:

{{deal.proposalLink}}`,
  },
  {
    slug: "followup_first",
    name: "1er seguimiento",
    body: `Hola {{contact.firstName}}, ¿cómo estás?

Te hago seguimiento a la propuesta de {{deal.title}} enviada el {{deal.proposalSentDate}}. Puedes revisarla en el Portal del Cliente:

{{deal.proposalLink}}

Cualquier duda quedo atento. Saludos!`,
  },
  {
    slug: "followup_second",
    name: "2do seguimiento",
    body: `Hola {{contact.firstName}}, ¿cómo estás?

Te escribo nuevamente respecto a la propuesta de {{deal.title}} que te enviamos el {{deal.proposalSentDate}}.

¿Has tenido oportunidad de revisarla? Si necesitas que ajustemos algo, estoy disponible. Te dejo el acceso al Portal del Cliente:

{{deal.proposalLink}}

Saludos!`,
  },
  {
    slug: "followup_third",
    name: "3er seguimiento",
    body: `Hola {{contact.firstName}}, ¿cómo estás?

Este es nuestro último seguimiento sobre la propuesta de {{deal.title}} enviada el {{deal.proposalSentDate}}. Te dejo nuevamente el acceso al Portal del Cliente:

{{deal.proposalLink}}

Si te interesa continuar, te leo y avanzamos de inmediato.`,
  },
  {
    slug: "deal_adjudicado",
    name: "Negocio adjudicado",
    body: `*NEGOCIO ADJUDICADO*

{{blocks.dealAdjudicacionDatos}}

{{blocks.dealAdjudicacionDotacion}}

*Ver negocio en OPAI*
{{system.opaiUrl}}

---
Mensaje generado automáticamente desde {{tenant.commercialName}}`,
  },
  {
    slug: "onboarding_summary",
    name: "Resumen de onboarding",
    body: `*ONBOARDING DEL CLIENTE*

{{blocks.onboardingDatos}}

{{blocks.onboardingDotacion}}

{{blocks.onboardingTickets}}

*Ver tickets*
{{system.ticketsUrl}}

*Ver negocio en OPAI*
{{system.opaiUrl}}

---
Mensaje generado automáticamente desde {{tenant.commercialName}}`,
  },
  {
    slug: "lead_first_contact",
    name: "Primer contacto al lead",
    body: `Hola {{lead.firstName}}, te escribo desde el equipo comercial de {{tenant.commercialName}}.

Hemos recibido tu consulta para {{lead.companyName}}. La vamos a trabajar con mucho gusto.

Quería confirmar contigo que el servicio requerido es:

{{lead.notes}}

¿Es correcto? Así avanzamos de inmediato.

{{tenant.website}}`,
  },
  {
    slug: "first_contact_generic",
    name: "Saludo genérico",
    body: `Hola {{contact.firstName}}, te escribo desde {{tenant.commercialName}}.`,
  },
  {
    slug: "hub_hot",
    name: "Hub Cierre — Propuesta caliente",
    body: `Hola {{contact.firstName}}, soy {{actor.fullName}} de {{tenant.commercialName}}.

Vi que revisaste nuestra propuesta para {{account.name}}. ¿Qué te parece? ¿Tienes dudas o quieres que ajustemos algo?

Estoy disponible para ayudarte cuando lo necesites.`,
  },
  {
    slug: "hub_stale",
    name: "Hub Cierre — Sin actividad",
    body: `Hola {{contact.firstName}}, soy {{actor.fullName}} de {{tenant.commercialName}}.

Paso a saludarte y ver si aún tienes interés en nuestra propuesta de seguridad para {{account.name}}.

¿Te gustaría retomar la conversación? Quedo atento a tu respuesta.`,
  },

  // ── CPQ ──
  {
    slug: "cpq_proposal_with_credentials",
    name: "Propuesta enviada con PIN portal",
    body: `{{blocks.cpqProposalHeader}}

Hola {{contact.firstName}}, soy *{{actor.fullName}}* de *{{tenant.commercialName}}*.

Te envié por correo una propuesta de seguridad personalizada. En tu portal privado podrás revisar todo el detalle y chatear directamente conmigo.

*Ingresa al portal desde este link* (tu correo ya está prellenado):
{{system.portalUrl}}

*Credenciales de acceso:*
Correo: {{contact.email}}
PIN: {{system.portalPin}}

Solo ingresa el PIN y listo.

¿Quieres que agendemos una llamada para revisarla juntos? Responde aquí.`,
  },
  {
    slug: "cpq_proposal_short",
    name: "Mensaje corto en email portal",
    body: `Hola {{contact.firstName}}, soy {{actor.firstName}} de {{tenant.commercialName}}. Cotización {{quote.code}}. Tengo una consulta.`,
  },
  {
    slug: "cpq_visita_tecnica_supervisor",
    name: "Visita técnica al supervisor",
    body: `Hola {{contact.firstName}}, se te asignó una visita técnica

{{system.todayLong}}

{{installation.name}}
{{system.mapsLink}}

{{blocks.cpqVisitaPuestos}}

Cotización: {{quote.code}}

Revisa los detalles en tu portal de supervisor.`,
  },

  // ── Operaciones ──
  {
    slug: "ops_guardia_invite_turno_extra",
    name: "Invitación formulario Turno Extra",
    body: `Hola, te invitamos a completar tu registro como guardia de Turno Extra de {{tenant.commercialName}}. Ingresa aquí: {{system.formUrl}}`,
  },
  {
    slug: "ops_guardia_invite_postulacion",
    name: "Invitación formulario Postulación",
    body: `Hola, te invitamos a postularte como guardia en {{tenant.commercialName}}. Completa el formulario aquí: {{system.formUrl}}`,
  },
  {
    slug: "ops_guardia_docs_pendientes",
    name: "Solicitud de documentos al guardia",
    body: `Hola {{guardia.firstName}}, necesitamos tus documentos pendientes (antecedentes, OS-10, cédula y CV) para continuar tu proceso. Saludos, {{tenant.commercialName}}.`,
  },
  {
    slug: "ops_guardia_entrevista",
    name: "Convocatoria a entrevista",
    body: `Hola {{guardia.firstName}}, te invitamos a entrevista en {{tenant.commercialName}}. Responde este mensaje para coordinar disponibilidad.`,
  },
  {
    slug: "ops_guardia_recordatorio",
    name: "Recordatorio de gestión al guardia",
    body: `Hola {{guardia.firstName}}, te recordamos completar tu ficha de guardia y responder este mensaje ante cualquier duda. Saludos, {{tenant.commercialName}}.`,
  },
  {
    slug: "ops_panic_response",
    name: "Respuesta a alerta de pánico",
    body: `Alerta de pánico recibida. Estamos en contacto contigo, {{guardia.firstName}}. Mantén la calma y responde a este mensaje si puedes hacerlo de forma segura. — {{tenant.commercialName}}`,
  },

  // ── Portal Cliente ──
  {
    slug: "portal_consult_quote",
    name: "Consulta sobre cotización",
    body: `Hola, tengo una consulta sobre la cotización {{quote.code}}.`,
  },
  {
    slug: "portal_consult_proposal",
    name: "Consulta sobre propuesta",
    body: `Hola, tengo una consulta sobre la propuesta {{quote.code}}.`,
  },
  {
    slug: "portal_consult_general",
    name: "Consulta general",
    body: `Hola, tengo una consulta sobre mi servicio de seguridad.`,
  },

  // ── Presentación ──
  {
    slug: "presentation_contact_cta",
    name: "CTA contacto en propuesta",
    body: `Hola, soy {{contact.firstName}} de {{account.name}}, vi {{quote.code}} y me gustaría conversar.`,
  },

  // ── Finanzas / Cobranza ──
  {
    slug: "cobranza_amable",
    name: "Cobranza — Recordatorio amable",
    body: `Hola {{contact.firstName}}, ¿cómo estás?

Te escribo para recordarte que tenemos pendiente el pago de la factura {{dte.folio}} por {{dte.totalAmountFormatted}} con fecha de vencimiento {{dte.dueDate}}.

¿Podrías ayudarme con la confirmación del pago? Cualquier cosa quedo atento.

Saludos,
{{actor.firstName}} · {{tenant.commercialName}}`,
  },
  {
    slug: "cobranza_firme",
    name: "Cobranza — Recordatorio firme",
    body: `Hola {{contact.firstName}},

La factura {{dte.folio}} por {{dte.totalAmountFormatted}} venció hace {{dte.daysOverdue}} días.

Necesito que coordinemos el pago a la brevedad para mantener el servicio activo. Te dejo nuestros datos:

{{tenant.commercialName}}
Cuenta para transferencia: solicítame el detalle por aquí.

Quedo atento a tu respuesta hoy.

{{actor.firstName}}`,
  },
  {
    slug: "cobranza_prejudicial",
    name: "Cobranza — Aviso pre-judicial",
    body: `Estimado/a {{contact.firstName}},

La factura {{dte.folio}} por {{dte.totalAmountFormatted}} se encuentra con {{dte.daysOverdue}} días de mora. Esta es una notificación previa a iniciar acciones de cobranza extrajudicial / pre-judicial.

Te pedimos coordinar el pago en las próximas 48 horas o agendar una reunión para acordar un plan de pagos. De no recibir respuesta procederemos según corresponda.

Atentamente,
{{actor.firstName}} · {{tenant.commercialName}}`,
  },
];
