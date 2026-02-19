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
    body: `Hola {nombre}, ¿cómo estás?

Recibimos tu solicitud de cotización para {empresa}, ubicada en {direccion}.

Estamos preparando una propuesta personalizada para ti. Si tienes alguna duda en el proceso, responde este mensaje y te ayudamos de inmediato.

Servicio: {servicio} | Dotación: {dotacion}

http://gard.cl`,
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
      "{industria}",
      "{detalle}",
    ],
  },
  lead_client: {
    name: "Nuevo lead — Cliente a Gard",
    body: `Hola, soy {nombre} {apellido} de la empresa {empresa}, les solicité una cotización por la página.

{maps_link}`,
    tokens: ["{nombre}", "{apellido}", "{empresa}", "{direccion}", "{maps_link}"],
  },
  proposal_sent: {
    name: "Propuesta enviada",
    body: `Hola {contactName}, te envío la propuesta de Gard Security para {companyName}:

{proposalUrl}`,
    tokens: ["{contactName}", "{companyName}", "{proposalUrl}"],
  },
  followup_first: {
    name: "1er seguimiento",
    body: `Hola {contactName}, ¿cómo estás?

Te hago seguimiento a la propuesta de {dealTitle} enviada el {proposalSentDate}.

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

¿Has tenido oportunidad de revisarla? Si necesitas que ajustemos algo, estoy disponible.

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

Este es nuestro último seguimiento sobre la propuesta de {dealTitle} enviada el {proposalSentDate}.

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
