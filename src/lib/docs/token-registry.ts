/**
 * Token Registry — Sistema de tokens/placeholders por módulo
 *
 * Define los tokens disponibles para insertar en documentos.
 * Cada token se mapea a un campo de una entidad CRM/CPQ/Payroll.
 */

export interface TokenDefinition {
  key: string;
  label: string;
  path: string;
  type?: "text" | "number" | "date" | "currency" | "table" | "signature";
  format?: string;
}

export interface TokenModule {
  key: string;
  label: string;
  icon: string;
  description: string;
  tokens: TokenDefinition[];
}

export const TOKEN_MODULES: TokenModule[] = [
  {
    key: "empresa",
    label: "Empresa",
    icon: "Building",
    description: "Datos de la empresa empleadora (configurados en Configuración > Empresa)",
    tokens: [
      { key: "empresa.razonSocial", label: "Razón Social", path: "razonSocial" },
      { key: "empresa.rut", label: "RUT Empresa", path: "rut" },
      { key: "empresa.direccion", label: "Dirección", path: "direccion" },
      { key: "empresa.comuna", label: "Comuna", path: "comuna" },
      { key: "empresa.ciudad", label: "Ciudad", path: "ciudad" },
      { key: "empresa.telefono", label: "Teléfono", path: "telefono" },
      { key: "empresa.repLegalNombre", label: "Rep. Legal (Nombre)", path: "repLegalNombre" },
      { key: "empresa.repLegalRut", label: "Rep. Legal (RUT)", path: "repLegalRut" },
      { key: "empresa.firmaRepLegal", label: "Firma Rep. Legal", path: "firmaRepLegal", type: "signature" },
    ],
  },
  {
    key: "account",
    label: "Cuenta (Cliente)",
    icon: "Building2",
    description: "Datos de la empresa / cuenta cliente (CRM)",
    tokens: [
      { key: "account.name", label: "Nombre Empresa", path: "name" },
      { key: "account.rut", label: "RUT", path: "rut" },
      { key: "account.legalName", label: "Razón Social", path: "legalName" },
      { key: "account.legalRepresentativeName", label: "Rep. Legal (Nombre)", path: "legalRepresentativeName" },
      { key: "account.legalRepresentativeRut", label: "Rep. Legal (RUT)", path: "legalRepresentativeRut" },
      { key: "account.industry", label: "Industria", path: "industry" },
      { key: "account.segment", label: "Segmento", path: "segment" },
      { key: "account.size", label: "Tamaño", path: "size" },
      { key: "account.website", label: "Sitio Web", path: "website" },
      { key: "account.address", label: "Dirección", path: "address" },
      { key: "account.commune", label: "Comuna", path: "commune" },
      { key: "account.notaryName", label: "Nombre Notaría", path: "notaryName" },
      { key: "account.notaryDate", label: "Fecha Escritura Pública", path: "notaryDate" },
    ],
  },
  {
    key: "contact",
    label: "Contacto",
    icon: "User",
    description: "Datos del contacto principal",
    tokens: [
      { key: "contact.firstName", label: "Nombre", path: "firstName" },
      { key: "contact.lastName", label: "Apellido", path: "lastName" },
      { key: "contact.fullName", label: "Nombre Completo", path: "fullName" },
      { key: "contact.email", label: "Email", path: "email" },
      { key: "contact.phone", label: "Teléfono", path: "phone" },
      { key: "contact.roleTitle", label: "Cargo", path: "roleTitle" },
    ],
  },
  {
    key: "installation",
    label: "Instalación",
    icon: "MapPin",
    description: "Datos de la instalación / sucursal",
    tokens: [
      { key: "installation.name", label: "Nombre Instalación", path: "name" },
      { key: "installation.address", label: "Dirección", path: "address" },
      { key: "installation.city", label: "Ciudad", path: "city" },
      { key: "installation.commune", label: "Comuna", path: "commune" },
    ],
  },
  {
    key: "deal",
    label: "Negocio",
    icon: "Handshake",
    description: "Datos del negocio / oportunidad",
    tokens: [
      { key: "deal.title", label: "Título del Negocio", path: "title" },
      { key: "deal.amount", label: "Monto", path: "amount", type: "currency" },
      { key: "deal.expectedCloseDate", label: "Fecha Cierre Esperada", path: "expectedCloseDate", type: "date" },
      { key: "deal.proposalLink", label: "Link Propuesta", path: "proposalLink" },
      { key: "deal.proposalSentDate", label: "Fecha Envío Propuesta", path: "proposalSentAt", type: "date" },
      { key: "deal.service", label: "Servicio", path: "service" },
      { key: "deal.installationName", label: "Instalación", path: "installationName" },
      { key: "deal.address", label: "Dirección", path: "address" },
      { key: "deal.city", label: "Ciudad", path: "city" },
      { key: "deal.commune", label: "Comuna", path: "commune" },
    ],
  },
  {
    key: "quote",
    label: "Cotización",
    icon: "FileSpreadsheet",
    description: "Datos de la cotización CPQ",
    tokens: [
      { key: "quote.code", label: "Código Cotización", path: "code" },
      { key: "quote.currency", label: "Moneda (UF/CLP)", path: "currency" },
      { key: "quote.monthlyCost", label: "Costo Mensual", path: "monthlyCost", type: "currency" },
      { key: "quote.totalPositions", label: "Total Posiciones", path: "totalPositions", type: "number" },
      { key: "quote.totalGuards", label: "Total Guardias", path: "totalGuards", type: "number" },
      { key: "quote.clientName", label: "Cliente (Cotización)", path: "clientName" },
      { key: "quote.salePriceMonthly", label: "Precio Venta Mensual", path: "salePriceMonthly", type: "currency" },
      { key: "quote.salePriceUF", label: "Precio Venta en UF", path: "salePriceUF" },
      { key: "quote.contractMonths", label: "Meses de Contrato", path: "contractMonths", type: "number" },
      { key: "quote.contractAmount", label: "Monto Total Contrato", path: "contractAmount", type: "currency" },
      { key: "quote.positionsTable", label: "Tabla de Posiciones", path: "positionsTable", type: "table" },
      { key: "quote.installationsTable", label: "Tabla de Instalaciones", path: "installationsTable", type: "table" },
      { key: "quote.dotacionResumen", label: "Resumen Dotación", path: "dotacionResumen" },
      { key: "quote.precioNeto", label: "Precio Neto Mensual (CLP)", path: "precioNeto", type: "currency" },
      { key: "quote.precioUF", label: "Precio Mensual (UF)", path: "precioUF" },
      { key: "quote.precioTotal", label: "Precio Total Contrato", path: "precioTotal", type: "currency" },
      { key: "quote.paymentDays", label: "Días de Pago", path: "paymentDays", type: "number" },
      { key: "quote.adjustmentType", label: "Tipo de Reajuste", path: "adjustmentType" },
      { key: "quote.adjustmentFreq", label: "Frecuencia de Reajuste", path: "adjustmentFreq" },
      { key: "quote.polinomioDescripcion", label: "Descripción Polinomio", path: "polinomioDescripcion" },
      { key: "quote.ipcWeight", label: "% IPC (polinomio)", path: "ipcWeight" },
      { key: "quote.imoWeight", label: "% IMO (polinomio)", path: "imoWeight" },
      { key: "quote.insurancePolicyUF", label: "Monto Póliza (UF)", path: "insurancePolicyUF" },
      { key: "quote.liabilityMonths", label: "Meses Límite Responsabilidad", path: "liabilityMonths", type: "number" },
      { key: "quote.realAnnualIncrement", label: "% Incremento Real Anual", path: "realAnnualIncrement", type: "number" },
      { key: "quote.cctvRetentionDays", label: "Días Retención CCTV", path: "cctvRetentionDays", type: "number" },
      { key: "quote.contractStartDate", label: "Fecha Inicio Contrato", path: "contractStartDate", type: "date" },
      { key: "quote.contractEndDate", label: "Fecha Término Contrato", path: "contractEndDate", type: "date" },
    ],
  },
  {
    key: "contract",
    label: "Contrato",
    icon: "FileSignature",
    description: "Datos del contrato de servicio con cliente",
    tokens: [
      { key: "contract.effectiveDate", label: "Fecha de Inicio", path: "effectiveDate", type: "date" },
      { key: "contract.expirationDate", label: "Fecha de Término", path: "expirationDate", type: "date" },
      { key: "contract.durationMonths", label: "Duración (meses)", path: "durationMonths", type: "number" },
      { key: "contract.title", label: "Título del Contrato", path: "title" },
      { key: "contract.adjustmentClause", label: "Cláusula de Reajuste (completa)", path: "adjustmentClause" },
      { key: "contract.laborClause", label: "Cláusula Reajuste Laboral", path: "laborClause" },
      { key: "contract.cctvClause", label: "Cláusula CCTV/Datos", path: "cctvClause" },
    ],
  },
  {
    key: "guardia",
    label: "Guardia",
    icon: "Shield",
    description: "Datos del guardia / trabajador",
    tokens: [
      { key: "guardia.firstName", label: "Nombre", path: "firstName" },
      { key: "guardia.lastName", label: "Apellido", path: "lastName" },
      { key: "guardia.fullName", label: "Nombre Completo", path: "fullName" },
      { key: "guardia.rut", label: "RUT", path: "rut" },
      { key: "guardia.email", label: "Email", path: "email" },
      { key: "guardia.phone", label: "Teléfono", path: "phone" },
      { key: "guardia.address", label: "Dirección", path: "address" },
      { key: "guardia.commune", label: "Comuna", path: "commune" },
      { key: "guardia.city", label: "Ciudad", path: "city" },
      { key: "guardia.region", label: "Región", path: "region" },
      { key: "guardia.birthDate", label: "Fecha de Nacimiento", path: "birthDate", type: "date" },
      { key: "guardia.nacionalidad", label: "Nacionalidad", path: "nacionalidad" },
      { key: "guardia.afp", label: "AFP", path: "afp" },
      { key: "guardia.isJubilado", label: "¿Jubilado? (SI/NO)", path: "isJubilado" },
      { key: "guardia.cotizaAFP", label: "Cotiza AFP (SI/NO)", path: "cotizaAFP" },
      { key: "guardia.cotizaAFC", label: "Cotiza AFC (SI/NO)", path: "cotizaAFC" },
      { key: "guardia.cotizaAFPTexto", label: "Cotiza AFP (texto)", path: "cotizaAFPTexto" },
      { key: "guardia.cotizaAFCTexto", label: "Cotiza AFC (texto)", path: "cotizaAFCTexto" },
      { key: "guardia.regimenPrevisional", label: "Régimen Previsional (código)", path: "regimenPrevisional" },
      { key: "guardia.regimenPrevisionalLabel", label: "Régimen Previsional", path: "regimenPrevisionalLabel" },
      { key: "guardia.healthSystem", label: "Sistema de Salud", path: "healthSystem" },
      { key: "guardia.isapreName", label: "Isapre", path: "isapreName" },
      { key: "guardia.hiredAt", label: "Fecha de Contratación", path: "hiredAt", type: "date" },
      { key: "guardia.code", label: "Código Guardia", path: "code" },
      { key: "guardia.cargo", label: "Último Cargo Desempeñado", path: "cargo" },
      { key: "guardia.currentInstallation", label: "Instalación Actual", path: "currentInstallation" },
      { key: "guardia.fechaInicioInstalacion", label: "Fecha Inicio en Instalación", path: "fechaInicioInstalacion", type: "date" },
      { key: "guardia.installationAddress", label: "Dirección Instalación", path: "installationAddress" },
      { key: "guardia.installationCommune", label: "Comuna Instalación", path: "installationCommune" },
      { key: "guardia.installationCity", label: "Ciudad Instalación", path: "installationCity" },
      { key: "guardia.contractType", label: "Tipo de Contrato", path: "contractType" },
      { key: "guardia.contractStartDate", label: "Inicio Contrato", path: "contractStartDate", type: "date" },
      { key: "guardia.contractEndDate", label: "Fin Contrato (período actual)", path: "contractEndDate", type: "date" },
      { key: "guardia.contractPeriod1End", label: "Fin Período 1 (original)", path: "contractPeriod1End", type: "date" },
      { key: "guardia.contractPeriod2End", label: "Fin Período 2 (1ra renov.)", path: "contractPeriod2End", type: "date" },
      { key: "guardia.contractCurrentPeriod", label: "Período Actual", path: "contractCurrentPeriod", type: "number" },
      { key: "guardia.bankName", label: "Banco", path: "bankName" },
      { key: "guardia.bankAccountNumber", label: "N° Cuenta Bancaria", path: "bankAccountNumber" },
      { key: "guardia.bankAccountType", label: "Tipo Cuenta", path: "bankAccountType" },
      { key: "guardia.baseSalary", label: "Sueldo Base", path: "baseSalary", type: "currency" },
      { key: "guardia.colacion", label: "Colación", path: "colacion", type: "currency" },
      { key: "guardia.movilizacion", label: "Movilización", path: "movilizacion", type: "currency" },
      { key: "guardia.bonosTotal", label: "Total Bonos", path: "bonosTotal", type: "currency" },
      { key: "guardia.bonosText", label: "Lista de Bonos", path: "bonosText" },
    ],
  },
  {
    key: "labor_event",
    label: "Evento Laboral",
    icon: "FileWarning",
    description: "Datos del evento laboral (finiquito, ausencia, etc.)",
    tokens: [
      { key: "labor_event.category", label: "Categoría", path: "category" },
      { key: "labor_event.subtype", label: "Tipo", path: "subtype" },
      { key: "labor_event.finiquitoDate", label: "Fecha de Finiquito", path: "finiquitoDate", type: "date" },
      { key: "labor_event.lastWorkDay", label: "Último Día Trabajado", path: "lastWorkDay", type: "date" },
      { key: "labor_event.causalDtCode", label: "Código Causal DT", path: "causalDtCode" },
      { key: "labor_event.causalDtLabel", label: "Causal de Término", path: "causalDtLabel" },
      { key: "labor_event.causalDtArticle", label: "Artículo Causal", path: "causalDtArticle" },
      { key: "labor_event.vacationDaysPending", label: "Días Vacaciones Pendientes", path: "vacationDaysPending", type: "number" },
      { key: "labor_event.vacationPaymentAmount", label: "Monto Vacaciones", path: "vacationPaymentAmount", type: "currency" },
      { key: "labor_event.pendingRemunerationAmount", label: "Remuneración Pendiente", path: "pendingRemunerationAmount", type: "currency" },
      { key: "labor_event.yearsOfServiceAmount", label: "Indemnización Años Servicio", path: "yearsOfServiceAmount", type: "currency" },
      { key: "labor_event.substituteNoticeAmount", label: "Indemn. Sustitutiva Aviso Previo", path: "substituteNoticeAmount", type: "currency" },
      { key: "labor_event.totalSettlementAmount", label: "Total Liquidación", path: "totalSettlementAmount", type: "currency" },
      { key: "labor_event.reason", label: "Motivo", path: "reason" },
    ],
  },
  {
    key: "system",
    label: "Sistema",
    icon: "Settings",
    description: "Datos del sistema, fechas y datos runtime (PIN, link al portal, etc.)",
    tokens: [
      { key: "system.today", label: "Fecha Actual", path: "today", type: "date" },
      { key: "system.todayLong", label: "Fecha Actual (texto)", path: "todayLong", type: "date" },
      { key: "system.year", label: "Año Actual", path: "year" },
      { key: "system.month", label: "Mes Actual", path: "month" },
      { key: "system.portalUrl", label: "URL Portal Cliente", path: "portalUrl" },
      { key: "system.portalPin", label: "PIN Portal Cliente", path: "portalPin" },
      { key: "system.formUrl", label: "URL Formulario Público", path: "formUrl" },
      { key: "system.mapsLink", label: "Link Google Maps", path: "mapsLink" },
    ],
  },
  {
    key: "signature",
    label: "Firma",
    icon: "FileSignature",
    description: "Un token por cada firmante: inserta «Firma del firmante 1» donde vaya la firma del primero, «Firma del firmante 2» del segundo, etc.",
    tokens: [
      { key: "signature.sentDate", label: "Fecha de envío", path: "sentDate", type: "date" },
      { key: "signature.signedDate", label: "Fecha de firma", path: "signedDate", type: "date" },
      { key: "signature.firmaGuardia", label: "Firma Guardia", path: "firmaGuardia" },
      ...Array.from({ length: 10 }, (_, i) => ({
        key: `signature.signer_${i + 1}`,
        label: `Firma del firmante ${i + 1}`,
        path: `signer_${i + 1}`,
      })),
    ],
  },
  {
    key: "actor",
    label: "Ejecutivo (usuario actual)",
    icon: "User",
    description: "Datos del usuario que está enviando el mensaje (resueltos en runtime)",
    tokens: [
      { key: "actor.firstName", label: "Nombre", path: "firstName" },
      { key: "actor.lastName", label: "Apellido", path: "lastName" },
      { key: "actor.fullName", label: "Nombre Completo", path: "fullName" },
      { key: "actor.email", label: "Email", path: "email" },
      { key: "actor.roleTitle", label: "Cargo", path: "roleTitle" },
    ],
  },
  {
    key: "tenant",
    label: "Empresa (tu marca)",
    icon: "Briefcase",
    description: "Datos de tu empresa para el cliente (nombre comercial, web, teléfono, etc.)",
    tokens: [
      { key: "tenant.commercialName", label: "Nombre Comercial", path: "commercialName" },
      { key: "tenant.website", label: "Sitio Web", path: "website" },
      { key: "tenant.phone", label: "Teléfono", path: "phone" },
      { key: "tenant.email", label: "Email Contacto", path: "email" },
      { key: "tenant.whatsappLink", label: "Link WhatsApp", path: "whatsappLink" },
    ],
  },
  {
    key: "lead",
    label: "Lead",
    icon: "UserPlus",
    description: "Datos del lead (formulario público o entrada manual)",
    tokens: [
      { key: "lead.firstName", label: "Nombre", path: "firstName" },
      { key: "lead.lastName", label: "Apellido", path: "lastName" },
      { key: "lead.fullName", label: "Nombre Completo", path: "fullName" },
      { key: "lead.email", label: "Email", path: "email" },
      { key: "lead.phone", label: "Celular", path: "phone" },
      { key: "lead.companyName", label: "Empresa", path: "companyName" },
      { key: "lead.address", label: "Dirección", path: "address" },
      { key: "lead.commune", label: "Comuna", path: "commune" },
      { key: "lead.city", label: "Ciudad", path: "city" },
      { key: "lead.serviceLabel", label: "Servicio solicitado", path: "serviceLabel" },
      { key: "lead.industry", label: "Industria", path: "industry" },
      { key: "lead.notes", label: "Detalle/Notas", path: "notes" },
      { key: "lead.dotacionResumen", label: "Dotación solicitada (texto)", path: "dotacionResumen" },
    ],
  },
  {
    key: "blocks",
    label: "Bloques pre-formateados",
    icon: "Blocks",
    description: "Bloques de texto formateados en estilo WhatsApp (listas dinámicas). Inserta el bloque completo como un único token.",
    tokens: [
      { key: "blocks.dealAdjudicacionDatos", label: "Adjudicación · Datos del negocio", path: "dealAdjudicacionDatos" },
      { key: "blocks.dealAdjudicacionDotacion", label: "Adjudicación · Detalle de dotación", path: "dealAdjudicacionDotacion" },
      { key: "blocks.onboardingDatos", label: "Onboarding · Datos cliente + dirección", path: "onboardingDatos" },
      { key: "blocks.onboardingDotacion", label: "Onboarding · Detalle de dotación", path: "onboardingDotacion" },
      { key: "blocks.onboardingTickets", label: "Onboarding · Tickets pendientes", path: "onboardingTickets" },
      { key: "blocks.cpqVisitaPuestos", label: "Visita técnica · Lista de puestos", path: "cpqVisitaPuestos" },
      { key: "blocks.cpqProposalHeader", label: "Propuesta CPQ · Encabezado (cotización + ref)", path: "cpqProposalHeader" },
    ],
  },
];

/** Flat map of all tokens by key */
export const TOKEN_MAP = new Map<string, TokenDefinition & { module: string }>();
for (const mod of TOKEN_MODULES) {
  for (const token of mod.tokens) {
    TOKEN_MAP.set(token.key, { ...token, module: mod.key });
  }
}

/** Get tokens for a specific module */
export function getTokensByModule(moduleKey: string): TokenDefinition[] {
  const mod = TOKEN_MODULES.find((m) => m.key === moduleKey);
  return mod?.tokens ?? [];
}

/** Get all available token keys */
export function getAllTokenKeys(): string[] {
  return Array.from(TOKEN_MAP.keys());
}

/** Document categories by module */
export const DOC_CATEGORIES: Record<string, { key: string; label: string }[]> = {
  crm: [
    { key: "contrato_cliente", label: "Contrato Cliente" },
    { key: "contrato_servicio", label: "Contrato de Servicio" },
    { key: "contrato_confidencialidad", label: "Acuerdo de Confidencialidad (NDA)" },
    { key: "acuerdo_nivel_servicio", label: "Acuerdo de Nivel de Servicio (SLA)" },
    { key: "adendum", label: "Adendum / Modificación" },
    { key: "email_seguimiento", label: "Email de Seguimiento" },
    { key: "email_propuesta", label: "Email de Propuesta" },
    { key: "email_general", label: "Email General" },
    { key: "otro_crm", label: "Otro" },
  ],
  payroll: [
    { key: "contrato_laboral", label: "Contrato de Trabajo" },
    { key: "anexo_contrato", label: "Anexo de Contrato" },
    { key: "finiquito", label: "Finiquito" },
    { key: "carta_aviso_termino", label: "Carta de Aviso de Término" },
    { key: "otro_payroll", label: "Otro" },
  ],
  legal: [
    { key: "poder_notarial", label: "Poder Notarial" },
    { key: "carta_compromiso", label: "Carta de Compromiso" },
    { key: "otro_legal", label: "Otro" },
  ],
  mail: [
    { key: "email_seguimiento", label: "Email de Seguimiento" },
    { key: "email_propuesta", label: "Email de Propuesta" },
    { key: "email_general", label: "Email General" },
    { key: "negocio_perdido", label: "Negocio perdido / Mail a cliente" },
    { key: "otro_mail", label: "Otro" },
  ],
  whatsapp: [
    // ── CRM ──
    { key: "lead_commercial", label: "CRM · Nuevo lead — Comercial al cliente" },
    { key: "lead_client", label: "CRM · Nuevo lead — Cliente al proveedor" },
    { key: "proposal_sent", label: "CRM · Propuesta enviada" },
    { key: "followup_first", label: "CRM · 1er seguimiento" },
    { key: "followup_second", label: "CRM · 2do seguimiento" },
    { key: "followup_third", label: "CRM · 3er seguimiento" },
    { key: "deal_adjudicado", label: "CRM · Negocio adjudicado" },
    { key: "onboarding_summary", label: "CRM · Resumen de onboarding" },
    { key: "lead_first_contact", label: "CRM · Primer contacto al lead" },
    { key: "first_contact_generic", label: "CRM · Saludo genérico (botón ícono)" },
    { key: "hub_hot", label: "CRM · Hub Cierre — Propuesta caliente" },
    { key: "hub_stale", label: "CRM · Hub Cierre — Sin actividad" },
    // ── CPQ ──
    { key: "cpq_proposal_with_credentials", label: "CPQ · Propuesta enviada con PIN portal" },
    { key: "cpq_proposal_short", label: "CPQ · Mensaje corto en email portal" },
    { key: "cpq_visita_tecnica_supervisor", label: "CPQ · Visita técnica al supervisor" },
    // ── Operaciones ──
    { key: "ops_guardia_invite_turno_extra", label: "Ops · Invitación formulario Turno Extra" },
    { key: "ops_guardia_invite_postulacion", label: "Ops · Invitación formulario Postulación" },
    { key: "ops_guardia_docs_pendientes", label: "Ops · Solicitud de documentos al guardia" },
    { key: "ops_guardia_entrevista", label: "Ops · Convocatoria a entrevista" },
    { key: "ops_guardia_recordatorio", label: "Ops · Recordatorio de gestión al guardia" },
    { key: "ops_panic_response", label: "Ops · Respuesta a alerta de pánico" },
    // ── Portal Cliente ──
    { key: "portal_consult_quote", label: "Portal Cliente · Consulta sobre cotización" },
    { key: "portal_consult_proposal", label: "Portal Cliente · Consulta sobre propuesta" },
    { key: "portal_consult_general", label: "Portal Cliente · Consulta general" },
    // ── Presentación / propuesta visualizada ──
    { key: "presentation_contact_cta", label: "Presentación · CTA contacto" },
    // ── General ──
    { key: "general", label: "Uso general (elegir desde CRM)" },
  ],
};

/** Módulos disponibles para plantillas */
export const DOC_MODULES = [
  { key: "crm", label: "CRM" },
  { key: "payroll", label: "Payroll" },
  { key: "legal", label: "Legal" },
  { key: "mail", label: "Mail (correos)" },
  { key: "whatsapp", label: "WhatsApp" },
] as const;

/** Uso de plantillas WhatsApp (usageSlug) → etiqueta y descripción "dónde se usa" */
export const WA_USAGE_SLUGS: Record<
  string,
  { label: string; usedIn: string; group: "crm" | "cpq" | "ops" | "portal" | "presentation" }
> = {
  // ── CRM ──
  lead_commercial: {
    label: "Nuevo lead — Comercial al cliente",
    usedIn: "Email \"Nuevo lead\" que recibe el ejecutivo (botón \"Contactar al cliente por WhatsApp\").",
    group: "crm",
  },
  lead_client: {
    label: "Nuevo lead — Cliente al proveedor",
    usedIn: "Email de confirmación al cliente que envió el formulario público (botón WhatsApp al proveedor).",
    group: "crm",
  },
  proposal_sent: {
    label: "Propuesta enviada",
    usedIn: "Modal tras enviar propuesta y botón «Compartir por WhatsApp» en lista de presentaciones.",
    group: "crm",
  },
  followup_first: {
    label: "1er seguimiento",
    usedIn: "Notificación interna del 1er seguimiento automático (botón Enviar WhatsApp al cliente).",
    group: "crm",
  },
  followup_second: {
    label: "2do seguimiento",
    usedIn: "Notificación interna del 2do seguimiento automático (botón Enviar WhatsApp al cliente).",
    group: "crm",
  },
  followup_third: {
    label: "3er seguimiento",
    usedIn: "Notificación interna del 3er seguimiento automático (botón Enviar WhatsApp al cliente).",
    group: "crm",
  },
  deal_adjudicado: {
    label: "Negocio adjudicado",
    usedIn: "Botón «Compartir adjudicación por WhatsApp» en detalle de negocio (deal). Incluye datos del negocio, contacto, instalación y dotación.",
    group: "crm",
  },
  onboarding_summary: {
    label: "Resumen de onboarding",
    usedIn: "Pantalla post-creación de onboarding del cliente, botón «Enviar al equipo». Incluye dotación, tickets pendientes y datos del cliente.",
    group: "crm",
  },
  lead_first_contact: {
    label: "Primer contacto al lead",
    usedIn: "Botón directo «Contactar por WhatsApp» en detalle de lead (mensaje completo con resumen de la solicitud).",
    group: "crm",
  },
  first_contact_generic: {
    label: "Saludo genérico (botón ícono)",
    usedIn: "Ícono de WhatsApp en tarjetas/listados de lead, cuenta, contacto, deal. Mensaje corto para iniciar conversación.",
    group: "crm",
  },
  hub_hot: {
    label: "Hub Cierre — Propuesta caliente",
    usedIn: "Hub de Cierre, sección «Propuestas calientes» (cliente vio la propuesta recientemente).",
    group: "crm",
  },
  hub_stale: {
    label: "Hub Cierre — Sin actividad",
    usedIn: "Hub de Cierre, sección «Propuestas frías» (sin movimiento, reenganche).",
    group: "crm",
  },
  // ── CPQ ──
  cpq_proposal_with_credentials: {
    label: "Propuesta enviada con PIN portal",
    usedIn: "Modal tras enviar propuesta desde CPQ. Incluye link al portal, correo y PIN. CRÍTICO: requiere tokens {{system.portalUrl}}, {{contact.email}} y {{system.portalPin}}.",
    group: "cpq",
  },
  cpq_proposal_short: {
    label: "Mensaje corto en email portal",
    usedIn: "Botón «Comunícate por WhatsApp» dentro del email de invitación al portal del prospecto.",
    group: "cpq",
  },
  cpq_visita_tecnica_supervisor: {
    label: "Visita técnica al supervisor",
    usedIn: "Modal «¡Visita programada!» tras agendar visita técnica desde CPQ. Mensaje al supervisor con fecha, hora, instalación y puestos.",
    group: "cpq",
  },
  // ── Operaciones ──
  ops_guardia_invite_turno_extra: {
    label: "Invitación formulario Turno Extra",
    usedIn: "Listado de guardias, menú «Enviar formulario Turno Extra» (link al formulario público).",
    group: "ops",
  },
  ops_guardia_invite_postulacion: {
    label: "Invitación formulario Postulación",
    usedIn: "Listado de guardias, menú «Enviar formulario Postulación» (link al formulario público de postulación).",
    group: "ops",
  },
  ops_guardia_docs_pendientes: {
    label: "Solicitud de documentos al guardia",
    usedIn: "Tab «Comunicaciones» del detalle de guardia, plantilla WhatsApp para pedir documentos.",
    group: "ops",
  },
  ops_guardia_entrevista: {
    label: "Convocatoria a entrevista",
    usedIn: "Tab «Comunicaciones» del detalle de guardia, plantilla para citar a entrevista.",
    group: "ops",
  },
  ops_guardia_recordatorio: {
    label: "Recordatorio de gestión al guardia",
    usedIn: "Tab «Comunicaciones» del detalle de guardia, plantilla de recordatorio genérico.",
    group: "ops",
  },
  ops_panic_response: {
    label: "Respuesta a alerta de pánico",
    usedIn: "Modal de pánico fullscreen, botón para responder al guardia que activó la alerta.",
    group: "ops",
  },
  // ── Portal Cliente ──
  portal_consult_quote: {
    label: "Consulta sobre cotización",
    usedIn: "Botón WhatsApp en portal cliente cuando hay una cotización abierta.",
    group: "portal",
  },
  portal_consult_proposal: {
    label: "Consulta sobre propuesta",
    usedIn: "Botón WhatsApp en portal cliente cuando hay una propuesta abierta.",
    group: "portal",
  },
  portal_consult_general: {
    label: "Consulta general",
    usedIn: "Botón WhatsApp en portal cliente cuando no hay cotización/propuesta específica.",
    group: "portal",
  },
  // ── Presentación ──
  presentation_contact_cta: {
    label: "CTA contacto en propuesta",
    usedIn: "Header de presentación visualizada por el cliente, botón WhatsApp del CTA principal.",
    group: "presentation",
  },
};

/** Status labels for documents */
export const DOC_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  draft: { label: "Borrador", color: "bg-gray-100 text-gray-700", icon: "FileEdit" },
  review: { label: "En Revisión", color: "bg-yellow-100 text-yellow-700", icon: "Eye" },
  approved: { label: "Aprobado", color: "bg-blue-100 text-blue-700", icon: "CheckCircle" },
  active: { label: "Activo", color: "bg-green-100 text-green-700", icon: "CheckCircle2" },
  expiring: { label: "Por Vencer", color: "bg-orange-100 text-orange-700", icon: "AlertTriangle" },
  expired: { label: "Vencido", color: "bg-red-100 text-status-danger-fg", icon: "XCircle" },
  renewed: { label: "Renovado", color: "bg-purple-100 text-purple-700", icon: "RefreshCw" },
};
