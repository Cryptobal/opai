/**
 * Plantillas por defecto WhatsApp (fallback cuando no hay DocTemplate ni CrmWhatsAppTemplate).
 * Usado por getWaTemplate y por la API legacy /api/crm/whatsapp-templates.
 */

export const WA_TEMPLATE_DEFAULTS: Record<
  string,
  { name: string; body: string; tokens: string[] }
> = {
  lead_commercial: {
    name: "Nuevo lead — Comercial al cliente",
    body: `Hola {nombre}, soy de Gard Security. ⚡

Vi tu solicitud para {empresa} en {direccion}: {servicio}, dotación {dotacion}. Estoy preparando tu cotización ahora.

¿Tienes 10 minutos hoy para una llamada y te explico cómo lo abordaríamos? Puedo llamarte ya o agendar para más tarde — tú decides.

Si prefieres avanzar por aquí, también puedo enviarte la propuesta directo por este chat.

{tenant_web}`,
    tokens: [
      "{nombre}",
      "{apellido}",
      "{empresa}",
      "{direccion}",
      "{comuna}",
      "{ciudad}",
      "{servicio}",
      "{dotacion}",
      "{email}",
      "{celular}",
      "{pagina_web}",
      "{tenant_web}",
      "{industria}",
      "{detalle}",
    ],
  },
  lead_client: {
    name: "Nuevo lead — Cliente a empresa",
    body: `Hola, soy {nombre} {apellido} de la empresa {empresa}, les solicité una cotización por la página.

{maps_link}`,
    tokens: ["{nombre}", "{apellido}", "{empresa}", "{direccion}", "{maps_link}"],
  },
  proposal_sent: {
    name: "Propuesta enviada",
    body: `Hola {contactName}, te envío la propuesta para {companyName}:

{proposalUrl}`,
    tokens: ["{contactName}", "{companyName}", "{proposalUrl}"],
  },
  followup_first: {
    name: "1er seguimiento",
    body: `Hola {contactName}, ¿cómo estás?

Te hago seguimiento a la propuesta de {dealTitle} enviada el {proposalSentDate}. Puedes revisarla en el Portal del Cliente:

{proposalLink}

Cualquier duda quedo atento. Saludos!`,
    tokens: [
      "{contactName}",
      "{dealTitle}",
      "{accountName}",
      "{proposalLink}",
      "{proposalSentDate}",
    ],
  },
  followup_second: {
    name: "2do seguimiento",
    body: `Hola {contactName}, ¿cómo estás?

Te escribo nuevamente respecto a la propuesta de {dealTitle} que te enviamos el {proposalSentDate}.

¿Has tenido oportunidad de revisarla? Si necesitas que ajustemos algo, estoy disponible. Te dejo el acceso al Portal del Cliente:

{proposalLink}

Saludos!`,
    tokens: [
      "{contactName}",
      "{dealTitle}",
      "{accountName}",
      "{proposalLink}",
      "{proposalSentDate}",
    ],
  },
  followup_third: {
    name: "3er seguimiento",
    body: `Hola {contactName}, ¿cómo estás?

Este es nuestro último seguimiento sobre la propuesta de {dealTitle} enviada el {proposalSentDate}. Te dejo nuevamente el acceso al Portal del Cliente:

{proposalLink}

Si te interesa continuar, te leo y avanzamos de inmediato.`,
    tokens: [
      "{contactName}",
      "{dealTitle}",
      "{accountName}",
      "{proposalLink}",
      "{proposalSentDate}",
    ],
  },
};
