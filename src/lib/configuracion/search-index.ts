export interface ConfigSearchItem {
  type: "section" | "setting";
  id?: string;
  sectionId?: string;
  label: string;
  description?: string;
  keywords: string;
  group: string;
  tab?: string;
}

export interface ConfigSearchResult {
  type: "section" | "setting";
  sectionId: string;
  sectionLabel: string;
  label: string;
  description?: string;
  tab?: string;
  group: string;
  href: string;
}

export const CONFIG_SEARCH_INDEX: ConfigSearchItem[] = [
  // ── SECCIONES PRINCIPALES ──
  {
    type: "section",
    id: "empresa",
    label: "Datos de la Empresa",
    group: "General",
    description: "Razón social, RUT, dirección, representante legal",
    keywords:
      "rut razon social direccion representante legal telefono comuna ciudad empresa",
  },
  {
    type: "section",
    id: "usuarios",
    label: "Usuarios",
    group: "General",
    description: "Gestión de usuarios y asignación de roles",
    keywords: "usuario invitar rol email activo inactivo equipo",
  },
  {
    type: "section",
    id: "roles",
    label: "Roles y Permisos",
    group: "General",
    description: "Configurar permisos por módulo y submódulo",
    keywords:
      "rol permiso administrador editor supervisor modulo acceso",
  },
  {
    type: "section",
    id: "grupos",
    label: "Grupos",
    group: "General",
    description: "Grupos organizacionales para cadenas de aprobación",
    keywords: "grupo aprobacion cadena finanzas gerencia rrhh inventario",
  },
  {
    type: "section",
    id: "integraciones",
    label: "Integraciones",
    group: "General",
    description: "Gmail y conectores externos",
    keywords: "gmail integracion conector api sincronizar correo",
  },
  {
    type: "section",
    id: "notificaciones",
    label: "Notificaciones",
    group: "General",
    description: "Parámetros globales. Preferencias por usuario en Perfil",
    keywords:
      "notificacion alerta campana email preferencia vencimiento documento",
  },
  {
    type: "section",
    id: "asistente-ia",
    label: "Asistente IA",
    group: "General",
    description: "Control de roles, acceso y alcance del chat",
    keywords: "ia asistente chat inteligencia artificial ayuda",
  },
  {
    type: "section",
    id: "auditoria",
    label: "Auditoría",
    group: "General",
    description: "Registro de acciones y cambios por usuario",
    keywords: "auditoria log registro cambio accion historial usuario",
  },
  {
    type: "section",
    id: "firmas",
    label: "Firmas",
    group: "Correos y Documentos",
    description: "Firmas para correos salientes",
    keywords: "firma email correo saliente predeterminada",
  },
  {
    type: "section",
    id: "categorias-plantillas",
    label: "Categorías de plantillas",
    group: "Correos y Documentos",
    description: "Categorías por módulo para Gestión Documental",
    keywords:
      "plantilla template categoria documento mail crm payroll legal",
  },
  {
    type: "section",
    id: "crm",
    label: "CRM",
    group: "Módulos",
    description: "Pipeline, campos y automatizaciones",
    keywords:
      "crm pipeline etapa campo industria seguimiento automatizacion prospecto cliente negocio cotizacion",
  },
  {
    type: "section",
    id: "cpq",
    label: "Cotizaciones (CPQ)",
    group: "Módulos",
    description: "Catálogo, parámetros y pricing",
    keywords:
      "cpq cotizacion catalogo precio parametro puesto cargo uniforme examen alimentacion",
  },
  {
    type: "section",
    id: "payroll",
    label: "Payroll",
    group: "Módulos",
    description: "Parámetros legales y versiones",
    keywords:
      "payroll feriado bono parametro uf utm sueldo remuneracion version legal",
  },
  {
    type: "section",
    id: "ops",
    label: "Operaciones",
    group: "Módulos",
    description: "Marcaciones, emails automáticos y parámetros",
    keywords:
      "operacion marcacion qr atraso documento guardia os10 certificado email marca ronda",
  },
  {
    type: "section",
    id: "tipos-ticket",
    label: "Tipos de Ticket",
    group: "Módulos",
    description: "Solicitudes, cadenas de aprobación y SLA",
    keywords:
      "ticket solicitud vacaciones permiso licencia sla aprobacion desvinculacion amonestacion",
  },
  {
    type: "section",
    id: "finanzas",
    label: "Finanzas",
    group: "Módulos",
    description: "Ítems de rendición, kilometraje, aprobadores y reglas",
    keywords:
      "finanza rendicion kilometraje aprobador regla item gasto combustible",
  },

  // ── CONFIGURACIONES ESPECÍFICAS ──

  // Empresa
  {
    type: "setting",
    sectionId: "empresa",
    tab: "correo",
    label: "Correo de envío (From)",
    group: "General",
    keywords: "correo envio from notificaciones email remitente resend",
  },
  {
    type: "setting",
    sectionId: "empresa",
    tab: "correo",
    label: "Correo de respuesta (Reply-To)",
    group: "General",
    keywords: "respuesta reply-to comercial email",
  },
  {
    type: "setting",
    sectionId: "empresa",
    tab: "firma",
    label: "Firma del representante legal",
    group: "General",
    keywords: "firma representante legal imagen dibujar token contrato",
  },

  // CRM
  {
    type: "setting",
    sectionId: "crm",
    tab: "pipeline",
    label: "Etapas del pipeline",
    group: "Módulos",
    keywords:
      "etapa prospeccion cotizacion negociacion ganado perdido seguimiento orden color",
  },
  {
    type: "setting",
    sectionId: "crm",
    tab: "campos",
    label: "Campos personalizados CRM",
    group: "Módulos",
    keywords:
      "campo personalizado prospecto cliente contacto negocio empresa nombre email telefono origen",
  },
  {
    type: "setting",
    sectionId: "crm",
    tab: "industrias",
    label: "Industrias",
    group: "Módulos",
    keywords:
      "industria banca retail salud educacion infraestructura evento",
  },
  {
    type: "setting",
    sectionId: "crm",
    tab: "seguimientos",
    label: "Seguimientos automáticos",
    group: "Módulos",
    keywords:
      "seguimiento automatico email template bcc whatsapp dias hora envio pausa",
  },
  {
    type: "setting",
    sectionId: "crm",
    tab: "seguimientos",
    label: "Templates de correo seguimiento",
    group: "Módulos",
    keywords: "template correo plantilla primer segundo tercer seguimiento",
  },
  {
    type: "setting",
    sectionId: "crm",
    tab: "seguimientos",
    label: "Copia oculta BCC",
    group: "Módulos",
    keywords: "bcc copia oculta auditoria trazabilidad comercial",
  },
  {
    type: "setting",
    sectionId: "crm",
    tab: "seguimientos",
    label: "WhatsApp por seguimiento",
    group: "Módulos",
    keywords: "whatsapp boton notificacion seguimiento",
  },

  // Operaciones
  {
    type: "setting",
    sectionId: "ops",
    tab: "marcacion",
    label: "Tolerancia de atraso",
    group: "Módulos",
    keywords: "tolerancia atraso minutos marcacion entrada rango",
  },
  {
    type: "setting",
    sectionId: "ops",
    tab: "marcacion",
    label: "Rotación código QR",
    group: "Módulos",
    keywords: "qr codigo rotacion horas rotar automaticamente semana",
  },
  {
    type: "setting",
    sectionId: "ops",
    tab: "marcacion",
    label: "Plazo oposición",
    group: "Módulos",
    keywords: "oposicion plazo horas trabajador ajuste manual",
  },
  {
    type: "setting",
    sectionId: "ops",
    tab: "marcacion",
    label: "Delay email marca manual",
    group: "Módulos",
    keywords: "delay espera email marca manual minutos inmediato",
  },
  {
    type: "setting",
    sectionId: "ops",
    tab: "marcacion",
    label: "Cláusula legal marca manual",
    group: "Módulos",
    keywords: "clausula legal marca manual 48 horas oposicion",
  },
  {
    type: "setting",
    sectionId: "ops",
    tab: "docs-guardias",
    label: "Documentos de guardias",
    group: "Módulos",
    keywords:
      "documento certificado os10 contrato cedula curriculum antecedentes fonasa isapre obligatorio vence",
  },
  {
    type: "setting",
    sectionId: "ops",
    tab: "docs-instalacion",
    label: "Documentos de instalación",
    group: "Módulos",
    keywords:
      "instalacion supervision directiva funcionamiento contrato guardia checklist visita",
  },
  {
    type: "setting",
    sectionId: "ops",
    tab: "emails",
    label: "Aviso de marca manual",
    group: "Módulos",
    keywords:
      "aviso marca manual email guardia comprobante digital sha256 hash",
  },
  {
    type: "setting",
    sectionId: "ops",
    tab: "emails",
    label: "Emails de prueba",
    group: "Módulos",
    keywords: "prueba test comprobante aviso enviar verificar",
  },

  // Payroll
  {
    type: "setting",
    sectionId: "payroll",
    tab: "feriados",
    label: "Feriados",
    group: "Módulos",
    keywords: "feriado ano nuevo viernes santo navidad irrenunciable trabajo",
  },
  {
    type: "setting",
    sectionId: "payroll",
    tab: "bonos",
    label: "Catálogo de Bonos",
    group: "Módulos",
    keywords: "bono responsabilidad fijo variable imponible monto",
  },
  {
    type: "setting",
    sectionId: "payroll",
    tab: "parametros",
    label: "Parámetros base (UF, UTM)",
    group: "Módulos",
    keywords: "uf utm parametro base supuesto legal",
  },
  {
    type: "setting",
    sectionId: "payroll",
    tab: "versionado",
    label: "Versionado de parámetros",
    group: "Módulos",
    keywords: "version historial vigencia periodo control",
  },
];

// Section ID → href mapping
const SECTION_HREFS: Record<string, string> = {
  empresa: "/opai/configuracion/empresa",
  usuarios: "/opai/configuracion/usuarios",
  roles: "/opai/configuracion/roles",
  grupos: "/opai/configuracion/grupos",
  integraciones: "/opai/configuracion/integraciones",
  notificaciones: "/opai/configuracion/notificaciones",
  "asistente-ia": "/opai/configuracion/asistente-ia",
  auditoria: "/opai/configuracion/auditoria",
  firmas: "/opai/configuracion/firmas",
  "categorias-plantillas": "/opai/configuracion/categorias-plantillas",
  crm: "/opai/configuracion/crm",
  cpq: "/opai/configuracion/cpq",
  payroll: "/opai/configuracion/payroll",
  ops: "/opai/configuracion/ops",
  "tipos-ticket": "/opai/configuracion/tipos-ticket",
  finanzas: "/opai/configuracion/finanzas",
};

// Section ID → label mapping
const SECTION_LABELS: Record<string, string> = {
  empresa: "Datos de la Empresa",
  usuarios: "Usuarios",
  roles: "Roles y Permisos",
  grupos: "Grupos",
  integraciones: "Integraciones",
  notificaciones: "Notificaciones",
  "asistente-ia": "Asistente IA",
  auditoria: "Auditoría",
  firmas: "Firmas",
  "categorias-plantillas": "Categorías de plantillas",
  crm: "CRM",
  cpq: "Cotizaciones (CPQ)",
  payroll: "Payroll",
  ops: "Operaciones",
  "tipos-ticket": "Tipos de Ticket",
  finanzas: "Finanzas",
};

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function searchConfig(query: string): ConfigSearchResult[] {
  if (!query || query.length < 2) return [];

  const q = normalize(query);

  return CONFIG_SEARCH_INDEX.filter((item) => {
    const searchable = normalize(
      `${item.label} ${item.description || ""} ${item.keywords}`,
    );
    return searchable.includes(q);
  }).map((item) => {
    const sectionId =
      item.type === "section" ? item.id! : item.sectionId!;
    const baseHref = SECTION_HREFS[sectionId] || `/opai/configuracion/${sectionId}`;
    const href =
      item.type === "setting" && item.tab
        ? `${baseHref}?tab=${item.tab}`
        : baseHref;

    return {
      type: item.type,
      sectionId,
      sectionLabel:
        item.type === "section"
          ? item.label
          : SECTION_LABELS[sectionId] || sectionId,
      label: item.label,
      description: item.description,
      tab: item.tab,
      group: item.group,
      href,
    };
  });
}
