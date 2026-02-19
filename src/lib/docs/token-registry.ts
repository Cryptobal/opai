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
    label: "Empresa (Gard)",
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
      { key: "quote.monthlyCost", label: "Costo Mensual", path: "monthlyCost", type: "currency" },
      { key: "quote.totalPositions", label: "Total Posiciones", path: "totalPositions", type: "number" },
      { key: "quote.totalGuards", label: "Total Guardias", path: "totalGuards", type: "number" },
      { key: "quote.clientName", label: "Cliente (Cotización)", path: "clientName" },
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
    description: "Datos del sistema y fechas",
    tokens: [
      { key: "system.today", label: "Fecha Actual", path: "today", type: "date" },
      { key: "system.todayLong", label: "Fecha Actual (texto)", path: "todayLong", type: "date" },
      { key: "system.year", label: "Año Actual", path: "year" },
      { key: "system.month", label: "Mes Actual", path: "month" },
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
    { key: "lead_commercial", label: "Nuevo lead — Comercial al cliente" },
    { key: "lead_client", label: "Nuevo lead — Cliente a Gard" },
    { key: "proposal_sent", label: "Propuesta enviada" },
    { key: "followup_first", label: "1er seguimiento" },
    { key: "followup_second", label: "2do seguimiento" },
    { key: "followup_third", label: "3er seguimiento" },
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
  { label: string; usedIn: string }
> = {
  lead_commercial:
    { label: "Nuevo lead — Comercial al cliente", usedIn: "Email al cliente cuando envía solicitud desde el formulario público (botón WhatsApp)." },
  lead_client:
    { label: "Nuevo lead — Cliente a Gard", usedIn: "Email que tú recibes por nuevo lead (botón para enviar WhatsApp a Gard)." },
  proposal_sent:
    { label: "Propuesta enviada", usedIn: "Modal tras enviar propuesta por email y botón «Compartir por WhatsApp» en lista de presentaciones." },
  followup_first:
    { label: "1er seguimiento", usedIn: "Notificación interna del 1er seguimiento automático (botón Enviar WhatsApp)." },
  followup_second:
    { label: "2do seguimiento", usedIn: "Notificación interna del 2do seguimiento automático (botón Enviar WhatsApp)." },
  followup_third:
    { label: "3er seguimiento", usedIn: "Notificación interna del 3er seguimiento automático (botón Enviar WhatsApp)." },
};

/** Status labels for documents */
export const DOC_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  draft: { label: "Borrador", color: "bg-gray-100 text-gray-700", icon: "FileEdit" },
  review: { label: "En Revisión", color: "bg-yellow-100 text-yellow-700", icon: "Eye" },
  approved: { label: "Aprobado", color: "bg-blue-100 text-blue-700", icon: "CheckCircle" },
  active: { label: "Activo", color: "bg-green-100 text-green-700", icon: "CheckCircle2" },
  expiring: { label: "Por Vencer", color: "bg-orange-100 text-orange-700", icon: "AlertTriangle" },
  expired: { label: "Vencido", color: "bg-red-100 text-red-700", icon: "XCircle" },
  renewed: { label: "Renovado", color: "bg-purple-100 text-purple-700", icon: "RefreshCw" },
};
