/**
 * CPQ Data Mapper
 *
 * Convierte datos internos del módulo CPQ al formato PresentationPayload
 * para reutilizar el sistema de presentaciones existente.
 *
 * IMPORTANTE: Construye el payload con datos reales del CPQ + defaults
 * genéricos de Gard. NO usa getMockPresentationPayload() para evitar
 * que datos ficticios (ej. Polpaico) aparezcan en presentaciones reales.
 */

import { PresentationPayload } from "@/types/presentation";

interface CpqMapperInput {
  /** Valor UF para conversión CLP→UF cuando currency es UF. Si no se provee y currency=UF, los valores se pasan tal cual (CLP). */
  ufValue?: number;
  quote: {
    id: string;
    code: string;
    clientName?: string | null;
    validUntil?: Date | string | null;
    notes?: string | null;
    aiDescription?: string | null;
    serviceDetail?: string | null;
    currency?: string;
  };
  positions: Array<{
    id: string;
    customName?: string | null;
    puestoTrabajo?: { name: string } | null;
    numGuards: number;
    numPuestos?: number;
    startTime?: string | null;
    endTime?: string | null;
    weekdays?: string[];
    monthlyPositionCost: unknown;
  }>;
  account?: {
    name: string;
    logoUrl?: string | null;
    companyDescription?: string;
    industry?: string | null;
    segment?: string | null;
  } | null;
  siteUrl?: string;
  contact?: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    roleTitle?: string | null;
  } | null;
  installation?: {
    name: string;
    address?: string | null;
    city?: string | null;
    commune?: string | null;
  } | null;
  dealName?: string | null;
  salePriceMonthly: number;
  positionSalePrices: Map<string, number>;
  templateId?: string;
}

import { clpToUf } from "@/lib/uf";

const WEEKDAY_ORDER = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function formatWeekdaysForDisplay(weekdays: string[] | null | undefined): string {
  if (!weekdays?.length) return "—";
  const order = new Map(WEEKDAY_ORDER.map((d, i) => [d, i]));
  const sorted = [...weekdays].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  if (sorted.length === 7) return "Lun-Dom";
  if (sorted.length === 5 && sorted[0] === "Lun" && sorted[4] === "Vie") return "Lun-Vie";
  if (sorted.length === 2 && sorted[0] === "Sáb" && sorted[1] === "Dom") return "Sáb-Dom";
  if (sorted.length === 3 && sorted[0] === "Vie" && sorted[2] === "Dom") return "Vie-Dom";
  return sorted.join(", ");
}

/**
 * Mapea datos CPQ al formato PresentationPayload
 * Construye el payload desde cero con datos reales + defaults genéricos de Gard
 * Cuando currency es UF y se provee ufValue, convierte unit_price/subtotal/total de CLP a UF.
 */
export function mapCpqDataToPresentation(
  input: CpqMapperInput,
  sessionId: string,
  templateSlug: string = "commercial"
): PresentationPayload {
  const { quote, positions, account, contact, installation, dealName, ufValue, siteUrl } = input;

  const companyName = account?.name || quote.clientName || "Cliente";
  const companyLogoUrl =
    account?.logoUrl && siteUrl
      ? account.logoUrl.startsWith("/")
        ? `${siteUrl}${account.logoUrl}`
        : account.logoUrl
      : null;
  const explicitCompanyDescription = (account?.companyDescription || "").trim();
  const fallbackFromBusinessContext = [account?.industry, account?.segment]
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .join(" · ");
  const companyDescription =
    explicitCompanyDescription ||
    (fallbackFromBusinessContext ? `Cliente del rubro ${fallbackFromBusinessContext}.` : "");
  const contactFullName = contact
    ? `${contact.firstName} ${contact.lastName}`.trim()
    : "";
  const validUntilStr = quote.validUntil
    ? new Date(quote.validUntil).toLocaleDateString("es-CL", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  const dateStr = new Date().toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalGuards = positions.reduce(
    (sum, p) => sum + p.numGuards * (p.numPuestos || 1),
    0
  );
  const currency = (quote.currency || "CLP") as "CLP" | "UF" | "USD";
  const shouldConvertToUf = currency === "UF" && ufValue != null && ufValue > 0;

  const toDisplayValue = (clp: number) =>
    shouldConvertToUf ? clpToUf(clp, ufValue!) : clp;

  return {
    // Metadatos
    id: sessionId,
    template_id: templateSlug,
    theme: "executive",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    // Datos del cliente - 100% del CPQ
    client: {
      company_name: companyName,
      company_description: companyDescription,
      company_logo_url: companyLogoUrl,
      contact_name: contactFullName,
      contact_first_name: contact?.firstName || "",
      contact_last_name: contact?.lastName || "",
      contact_title: contact?.roleTitle || "",
      contact_email: contact?.email || "",
      contact_phone: contact?.phone || "",
      address: installation?.address || "",
      city: installation?.city || "",
    },

    // Cotización - 100% del CPQ
    quote: {
      number: quote.code,
      date: dateStr,
      valid_until: validUntilStr,
      subject: `Propuesta de Servicio de Seguridad - ${companyName}`,
      description: (quote.aiDescription as string) || "",
      total: input.salePriceMonthly,
      subtotal: input.salePriceMonthly,
      tax: 0,
      currency,
      deal_name: dealName || undefined,
    },

    // Servicio - datos reales del CPQ
    service: {
      scope_summary: `Servicio de seguridad para ${companyName}${installation ? ` en ${installation.name}` : ""}, con ${totalGuards} guardias.`,
      sites: installation
        ? [
            {
              name: installation.name,
              address: installation.address || "",
              comuna: installation.commune || undefined,
            },
          ]
        : [],
      positions: positions.map((pos) => ({
        title: pos.customName || pos.puestoTrabajo?.name || "Puesto",
        schedule: `${pos.startTime || "-"} - ${pos.endTime || "-"}`,
        shift_type: (pos.weekdays?.length ?? 7) >= 6 ? "6x1" : "5x2",
        quantity: pos.numGuards * (pos.numPuestos || 1),
      })),
    },

    // Assets - defaults genéricos de Gard
    assets: GARD_ASSETS,

    // CTA - defaults de Gard
    cta: {
      meeting_link: "https://calendar.app.google/MfyKXvYxURJSnUBe9",
      whatsapp_link: "https://wa.me/56982307771",
      phone: contact?.phone || "+56 98 230 7771",
      email: contact?.email || "comercial@gard.cl",
    },

    // Contacto comercial de Gard
    contact: {
      name: contactFullName || "Equipo Comercial",
      email: contact?.email || "comercial@gard.cl",
      phone: contact?.phone || "+56 98 230 7771",
      position: "Gerente Comercial",
    },

    // Secciones - defaults genéricos de Gard + datos CPQ donde corresponda
    sections: {
      s01_hero: {
        headline: "Seguridad privada diseñada para continuidad operacional",
        subheadline:
          "Guardias profesionales + supervisión activa + control en tiempo real",
        microcopy:
          "Protegemos personas, activos y procesos críticos en entornos empresariales exigentes.",
        personalization: `Propuesta para ${companyName} — ${quote.code}`,
        cta_primary_text: "Agendar visita técnica sin costo",
        cta_secondary_text: "Solicitar propuesta directa",
        background_image: "/guardia_hero.jpg",
        kpi_overlay: { value: "99,5%", label: "Cobertura de turnos" },
      },

      ...GARD_SECTIONS_DEFAULTS,

      // S23 - Propuesta Económica (datos reales del CPQ)
      s23_propuesta_economica: {
        serviceDetail: (quote.serviceDetail as string) || undefined,
        pricing: {
          items: positions.map((pos) => {
            const salePriceClp =
              input.positionSalePrices.get(pos.id) ??
              Number(pos.monthlyPositionCost);
            const numPuestos = Math.max(1, Number(pos.numPuestos || 1));
            const unitPriceClp = salePriceClp / numPuestos;
            const displayPrice = toDisplayValue(salePriceClp);
            const displayUnitPrice = toDisplayValue(unitPriceClp);
            return {
              name: pos.customName || pos.puestoTrabajo?.name || "Puesto",
              description: `${pos.numGuards} guardia(s) x ${pos.numPuestos || 1} puesto(s) · ${formatWeekdaysForDisplay(pos.weekdays)} · ${pos.startTime || "-"} a ${pos.endTime || "-"}`,
              quantity: numPuestos,
              unit_price: displayUnitPrice,
              subtotal: displayPrice,
              currency,
            };
          }),
          subtotal: toDisplayValue(input.salePriceMonthly),
          tax: 0,
          total: toDisplayValue(input.salePriceMonthly),
          currency,
          payment_terms: "Mensual, contraentrega de factura",
          adjustment_terms: "Reajuste anual: 70% IPC + 30% IMO",
          billing_frequency: "monthly" as const,
          notes: [
            currency === "UF" ? "Valor mensual expresado en UF" : "Valor mensual en pesos chilenos",
            "Incluye seguros y cumplimiento legal",
            "Mínimo 12 meses de contrato",
            "Equipamiento incluido (radios, linternas)",
          ],
        },
      },
    },
  };
}

// ─── Defaults genéricos de Gard (sin datos de clientes ficticios) ───

const GARD_ASSETS = {
  logo: "/Logo%20Gard%20Blanco.png",
  guard_photos: [
    "/guardia_hero.jpg",
    "/guardia_entrada.jpg",
    "/guardia_recepcion.jpg",
    "/guardia_conserje.jpeg",
    "/guardia_caseta.jpeg",
    "/guardia_cims.jpg",
    "/guardia_cims_1.jpg",
    "/guardia_conserje_1.jpeg",
  ],
  client_logos: [
    "/clientes_Polpaico.png",
    "/clientes_International Paper.png",
    "/clientes_Tritec.webp",
    "/clientes_Sparta.webp",
    "/clientes_Tattersall.png",
    "/clientes_Transmat.webp",
    "/clientes_Zerando.webp",
    "/clientes_bbosch.webp",
    "/clientes_Delegacion.png",
    "/clientes_Dhemax.png",
    "/clientes_Embajada Brasil.png",
    "/clientes_Emecar.jpg",
    "/clientes_Forestal Santa Blanca.png",
    "/clientes_GL Events.png",
    "/clientes_Newtree.png",
    "/clientes_eCars.png",
  ],
  hero_image: "/hero_guardias.webp",
  os10_qr_url: "/QR OS10.png",
};

/**
 * Secciones S02-S29 con contenido genérico de Gard (sin datos de clientes ficticios).
 * S01 y S23 se construyen con datos del CPQ en mapCpqDataToPresentation.
 */
const GARD_SECTIONS_DEFAULTS = {
  s02_executive_summary: {
    commitment_title: "Nuestro compromiso: transparencia total",
    commitment_text:
      "Usted se entera de TODO, PRIMERO. Sin filtros, sin demoras.",
    differentiators: [
      "Supervisión activa en terreno (no solo desde oficina)",
      "Reportabilidad ejecutiva en tiempo real",
      "Control de rondas verificable (NFC/QR)",
      "Cumplimiento laboral garantizado (OS-10 vigente)",
    ],
    traditional_model_reality: [
      "Control inexistente de lo que hace el guardia",
      "Reportes inexistentes o tardíos",
      "Trazabilidad inexistente",
      "Descubrimiento de fallas solo después del incidente",
    ],
    impact_metrics: [
      { value: "67%", label: "Reducción de incidentes" },
      { value: "96%", label: "Cumplimiento de rondas" },
      { value: "100%", label: "Eventos documentados" },
      { value: "24h", label: "Respuesta a consultas" },
    ],
  },
  s03_transparencia: {
    main_phrase:
      "Usted se entera de TODO, PRIMERO. Sin filtros, sin demoras.",
    protocol_steps: {
      detection: "Inmediato",
      report: "≤ 15 minutos",
      action: "≤ 2 horas",
    },
    kpis: [
      { value: "67%", label: "Menos incidentes" },
      { value: "96%", label: "Rondas cumplidas" },
      { value: "100%", label: "Eventos documentados" },
    ],
  },
  s04_riesgo: {
    headline:
      "El verdadero riesgo no es la ausencia de seguridad. Es la falsa sensación de control.",
    symptoms: [
      {
        icon: "AlertTriangle",
        title: "Control inexistente",
        description: "No sabe qué hace el guardia minuto a minuto",
      },
      {
        icon: "FileText",
        title: "Reportes inexistentes",
        description: "Informes tardíos o nulos sobre novedades",
      },
      {
        icon: "Shield",
        title: "Trazabilidad inexistente",
        description: "Sin evidencia de rondas ni supervisiones",
      },
    ],
    statistic:
      "73% de las empresas descubre fallas solo después de un incidente grave.",
  },
  s05_fallas_modelo: {
    table_rows: [
      {
        characteristic: "Sin supervisión en terreno",
        operational_consequence: "Guardias sin control real",
        financial_impact: "Riesgo no mitigado",
      },
      {
        characteristic: "Reportes manuales tardíos",
        operational_consequence: "Decisiones con información obsoleta",
        financial_impact: "Incidentes no prevenidos",
      },
      {
        characteristic: "Sin trazabilidad de rondas",
        operational_consequence: "No hay evidencia de cobertura",
        financial_impact: "Exposición legal",
      },
    ],
  },
  s06_costo_real: {
    cost_cards: [
      {
        title: "Robo interno",
        description: "Pérdidas no detectadas",
        estimated_impact: "$5-15M anuales",
      },
      {
        title: "Demanda laboral",
        description: "Incumplimiento normativo",
        estimated_impact: "$20-50M por caso",
      },
      {
        title: "Horas gerenciales",
        description: "Gestión de crisis evitables",
        estimated_impact: "$3-8M anuales",
      },
    ],
    conclusion_note:
      "Una inversión mensual controlada vs. un costo impredecible",
  },
  s07_sistema_capas: {
    intro_text:
      "No vendemos guardias. Implementamos un sistema de seguridad gestionado.",
    layers: [
      { level: 1, name: "Guardia", description: "Presencia física profesional" },
      { level: 2, name: "Supervisión", description: "Verificación activa en terreno" },
      { level: 3, name: "Control", description: "Trazabilidad digital (rondas NFC/QR)" },
      { level: 4, name: "Reportabilidad", description: "Informes automáticos en tiempo real" },
      { level: 5, name: "Gestión", description: "Análisis y mejora continua" },
    ],
  },
  s08_4_pilares: {
    pillar1: {
      title: "Personal profesional",
      description: "Selección rigurosa y capacitación continua",
      details: ["100→12 funnel de selección", "Evaluación psicológica", "Verificación de antecedentes"],
    },
    pillar2: {
      title: "Supervisión permanente",
      description: "Control activo 24/7 en terreno",
      details: ["Mínimo 2 supervisiones por turno", "Máximo 4h sin verificación", "Rondas aleatorias"],
    },
    pillar3: {
      title: "Control y trazabilidad",
      description: "Tecnología para verificar cumplimiento",
      details: ["Rondas NFC/QR", "Registro fotográfico + GPS", "Reportes automáticos"],
    },
    pillar4: {
      title: "Gestión orientada a resultados",
      description: "KPIs medibles y revisión mensual",
      details: ["Dashboard ejecutivo", "Reuniones de gestión", "Mejora continua"],
    },
  },
  s09_como_operamos: {
    stages: [
      { step: 1, title: "Diagnóstico", description: "Visita técnica y levantamiento de necesidades", deliverable: "Informe de evaluación de riesgos" },
      { step: 2, title: "Diseño", description: "Propuesta de dotación, turnos y protocolos", deliverable: "Plan de servicio personalizado" },
      { step: 3, title: "Asignación", description: "Selección y capacitación del personal", deliverable: "Equipo asignado y capacitado" },
      { step: 4, title: "Supervisión", description: "Verificación activa y control en terreno", deliverable: "Reportes de supervisión" },
      { step: 5, title: "Registro", description: "Trazabilidad digital de rondas y eventos", deliverable: "Evidencia fotográfica + GPS" },
      { step: 6, title: "Reportes", description: "Información ejecutiva automática", deliverable: "Dashboard + informes periódicos" },
      { step: 7, title: "Mejora continua", description: "Análisis de KPIs y ajustes", deliverable: "Plan de optimización" },
    ],
  },
  s10_supervision: {
    levels: [
      { level: 1, name: "Autocontrol", description: "Registro digital de rondas", frequency: "Según protocolo" },
      { level: 2, name: "Supervisor en terreno", description: "Verificación presencial", frequency: "Mínimo 2 veces por turno" },
      { level: 3, name: "Coordinador de zona", description: "Rondas aleatorias", frequency: "Semanal" },
      { level: 4, name: "Gestión ejecutiva", description: "Reuniones con cliente", frequency: "Mensual" },
    ],
    night_shift_timeline: [
      { time: "20:00", activity: "Inicio de turno + briefing" },
      { time: "22:00", activity: "Primera supervisión en terreno" },
      { time: "02:00", activity: "Segunda supervisión en terreno" },
      { time: "06:00", activity: "Tercera supervisión + reporte" },
      { time: "08:00", activity: "Cambio de turno + handover" },
    ],
    sla: [
      "Máximo 4 horas sin verificación",
      "Mínimo 2 supervisiones por turno",
      "Respuesta a incidentes < 15 minutos",
      "Cobertura de turnos 99,5%",
    ],
  },
  s11_reportabilidad: {
    daily: { title: "Reporte Diario", items: ["Novedades del turno", "Incidentes registrados", "Rondas completadas", "Personal en servicio"] },
    weekly: { title: "Reporte Semanal", items: ["Tendencias de incidentes", "KPIs operativos", "Observaciones de supervisión", "Recomendaciones"] },
    monthly: { title: "Dashboard Ejecutivo Mensual", items: ["Análisis de resultados", "Cumplimiento de SLAs", "Estadísticas comparativas", "Plan de mejora"] },
  },
  s12_cumplimiento: {
    intro_text: "Tranquilidad operativa, legal y financiera",
    risks: ["Multas DT por incumplimiento laboral", "Demandas de trabajadores", "Cierre de operaciones", "Daño reputacional"],
    guarantees: ["OS-10 vigente y verificable", "Contratos al día", "Imposiciones pagadas", "Seguros vigentes", "Documentación disponible en 24h"],
    commitment_time: "Documentación disponible en menos de 24 horas",
  },
  s13_certificaciones: {
    os10_qr: "/QR OS10.png",
    ley_karin_info: "Canal de denuncias activo según Ley Karin",
    ethics_code: "Código de ética y anticorrupción implementado",
    screening_checks: ["Verificación de antecedentes penales", "Evaluación psicológica", "Examen de salud ocupacional", "Referencias laborales verificadas"],
  },
  s14_tecnologia: {
    tools: [
      { name: "Control de rondas NFC/QR", what_is_it: "Puntos de verificación en sitio", purpose: "Asegurar cobertura real", real_benefit: "Evidencia verificable de recorridos" },
      { name: "Registro digital de eventos", what_is_it: "App móvil con foto + GPS + timestamp", purpose: "Documentar incidentes", real_benefit: "Trazabilidad legal completa" },
      { name: "Reportes automáticos", what_is_it: "Dashboard web en tiempo real", purpose: "Información ejecutiva", real_benefit: "Decisiones basadas en datos" },
    ],
    note: "No obligamos a comprar tecnología adicional. Sistema incluido en el servicio.",
  },
  s15_seleccion: {
    funnel: [
      { stage: "Postulantes", quantity: 100 },
      { stage: "Preselección curricular", quantity: 40 },
      { stage: "Evaluación psicológica", quantity: 25 },
      { stage: "Verificación antecedentes", quantity: 18 },
      { stage: "Entrevistas finales", quantity: 12 },
    ],
    criteria_table: [
      { criterion: "Perfil psicológico", description: "Estabilidad, responsabilidad, autocontrol" },
      { criterion: "Experiencia real", description: "Mínimo 1 año en seguridad privada" },
      { criterion: "Adaptación", description: "Capacidad para turnos nocturnos y condiciones exigentes" },
      { criterion: "Disciplina", description: "Cumplimiento de protocolos" },
      { criterion: "Salud", description: "Examen ocupacional aprobado" },
    ],
    retention_rate: "85% vs industria 50-60%",
  },
  s16_nuestra_gente: {
    message: "Guardias comprometidos, entrenados y supervisados",
    photos: ["/guardia_hero.jpg", "/guardia_entrada.jpg", "/guardia_recepcion.jpg", "/guardia_conserje.jpeg", "/guardia_caseta.jpeg", "/guardia_cims.jpg", "/guardia_cims_1.jpg", "/guardia_conserje_1.jpeg"],
    values: [
      { title: "Profesionalismo", description: "Capacitación continua y certificaciones" },
      { title: "Compromiso", description: "Identificación con el cliente" },
      { title: "Integridad", description: "Ética y transparencia" },
      { title: "Responsabilidad", description: "Cumplimiento de protocolos" },
      { title: "Adaptabilidad", description: "Flexibilidad ante contingencias" },
    ],
  },
  s17_continuidad: {
    scenarios: [
      { title: "Ausencia programada", description: "Vacaciones, permisos legales", response_time: "Reemplazo coordinado con 48h de anticipación" },
      { title: "Ausencia imprevista", description: "Licencia médica, emergencia", response_time: "Cobertura en máximo 2 horas" },
      { title: "Contingencia mayor", description: "Renuncia masiva, huelga", response_time: "Plan de contingencia activado inmediatamente" },
      { title: "Aumento de demanda", description: "Picos de operación, eventos", response_time: "Refuerzo disponible con 24h de aviso" },
    ],
    sla_coverage: "Cobertura garantizada en máximo 2 horas",
    kpi_compliance: "99,5% de cumplimiento de turnos",
  },
  s18_kpis: {
    indicators: [
      { name: "Cumplimiento de rondas", description: "% de rondas ejecutadas vs programadas", target: "≥95%", measurement_frequency: "Diario" },
      { name: "Cobertura de turnos", description: "% de turnos cubiertos sin retrasos", target: "≥99%", measurement_frequency: "Diario" },
      { name: "Tiempo de respuesta", description: "Minutos entre incidente y reporte", target: "≤15 min", measurement_frequency: "Por incidente" },
      { name: "Incidentes documentados", description: "% de eventos con registro fotográfico", target: "100%", measurement_frequency: "Por incidente" },
      { name: "Satisfacción del cliente", description: "Evaluación mensual", target: "≥4.5/5", measurement_frequency: "Mensual" },
      { name: "Permanencia del personal", description: "% de guardias que permanecen >12 meses", target: "≥85%", measurement_frequency: "Anual" },
    ],
    review_note: "Revisión mensual con el cliente en reunión de gestión",
  },
  s19_resultados: {
    case_studies: [
      { sector: "Logística", sites: 3, staffing: "12 guardias + 2 supervisores", duration: "4 años", metrics: [{ value: "78%", label: "Reducción incidentes" }, { value: "98%", label: "Cumplimiento rondas" }, { value: "100%", label: "Eventos documentados" }, { value: "4.8/5", label: "Satisfacción" }], quote: "La trazabilidad nos permite tomar decisiones con información real." },
      { sector: "Manufactura", sites: 2, staffing: "8 guardias + 1 supervisor", duration: "3 años", metrics: [{ value: "65%", label: "Menos pérdidas" }, { value: "100%", label: "OS-10 vigente" }, { value: "24h", label: "Respuesta consultas" }, { value: "4.6/5", label: "Satisfacción" }], quote: "Dejamos de preocuparnos por temas legales y nos enfocamos en producir." },
      { sector: "Retail", sites: 5, staffing: "20 guardias + 3 supervisores", duration: "2 años", metrics: [{ value: "82%", label: "Menos hurtos" }, { value: "99%", label: "Cobertura turnos" }, { value: "15min", label: "Tiempo respuesta" }, { value: "4.7/5", label: "Satisfacción" }], quote: "La supervisión activa hizo la diferencia. Ahora sabemos que están trabajando." },
    ],
  },
  s20_clientes: {
    client_logos: ["/clientes_Polpaico.png", "/clientes_International Paper.png", "/clientes_Tritec.webp", "/clientes_Sparta.webp", "/clientes_Tattersall.png", "/clientes_Transmat.webp", "/clientes_Zerando.webp", "/clientes_bbosch.webp", "/clientes_Delegacion.png", "/clientes_Dhemax.png", "/clientes_Embajada Brasil.png", "/clientes_Forestal Santa Blanca.png", "/clientes_GL Events.png", "/clientes_Newtree.png", "/clientes_eCars.png"],
    confidentiality_note: "Algunos clientes no autorizan uso de su marca por políticas de confidencialidad.",
  },
  s21_sectores: {
    industries: [
      { name: "Logística y Bodegas", typical_needs: ["Control de acceso", "Prevención de robos", "Supervisión de carga/descarga"] },
      { name: "Manufactura e Industria", typical_needs: ["Seguridad perimetral", "Control de contratistas", "Prevención de accidentes"] },
      { name: "Retail y Centros Comerciales", typical_needs: ["Atención al público", "Prevención de hurtos", "Emergencias"] },
      { name: "Construcción e Inmobiliaria", typical_needs: ["Protección de materiales", "Control de acceso", "Vigilancia nocturna"] },
      { name: "Salud y Clínicas", typical_needs: ["Control de visitas", "Emergencias médicas", "Seguridad de pacientes"] },
      { name: "Educación", typical_needs: ["Seguridad escolar", "Control de acceso", "Eventos especiales"] },
    ],
  },
  s22_tco: {
    comparison_columns: {
      low_cost_high_risk: { monthly_rate: 4500000, annual_rate: 54000000, hidden_costs: 15000000, total_real: 69000000 },
      controlled_cost_low_risk: { monthly_rate: 6300000, annual_rate: 75600000, hidden_costs: 500000, total_real: 76100000 },
    },
    message: 'La pregunta correcta no es "cuánto cuesta", sino "cuánto me cuesta NO tenerlo".',
    currency: "CLP" as const,
  },
  // s23_propuesta_economica se construye con datos CPQ en mapCpqDataToPresentation
  s24_terminos_condiciones: {
    client_must_provide: ["Caseta o espacio físico para guardia", "Acceso a agua potable y baños", "Lockers o espacio para guardar pertenencias", "Iluminación adecuada"],
    service_includes: ["Celulares corporativos", "Radios y linternas", "Uniformes y credenciales", "Reportes digitales", "Supervisión 24/7", "Control remoto de rondas", "Seguros y cumplimiento legal"],
  },
  s25_comparacion: {
    comparison_table: [
      { criterion: "Supervisión en terreno", market: "Ocasional", gard: "Permanente", highlight: true },
      { criterion: "Reportes en tiempo real", market: false, gard: true },
      { criterion: "Control de rondas verificable", market: false, gard: true, highlight: true },
      { criterion: "Respuesta a incidentes", market: "> 1 hora", gard: "< 15 min" },
      { criterion: "Reemplazo por ausencias", market: "> 4 horas", gard: "< 2 horas" },
      { criterion: "Documentación laboral", market: "Bajo demanda", gard: "< 24 horas" },
      { criterion: "Dashboard ejecutivo", market: false, gard: true },
      { criterion: "Reuniones de gestión", market: false, gard: "Mensuales" },
      { criterion: "Capacitación continua", market: false, gard: true },
      { criterion: "Canal de denuncias", market: false, gard: "Ley Karin" },
      { criterion: "Tiempo de implementación", market: "> 4 semanas", gard: "≤ 15 días" },
      { criterion: "Plan de contingencia", market: false, gard: true, highlight: true },
    ],
  },
  s26_porque_eligen: {
    reasons: ["Modelo estructurado (no improvisamos)", "Supervisión real (no solo promesas)", "Reportes útiles (no burocracia)", "Cumplimiento garantizado (tranquilidad legal)", "Gestión proactiva (no reactiva)", "Resultados medibles (KPIs claros)"],
    renewal_rate: "94% de nuestros clientes renueva contrato",
  },
  s27_implementacion: {
    phases: [
      { week: 1, title: "Visita técnica + diagnóstico", description: "Levantamiento de necesidades y riesgos", client_requirements: ["Acceso a instalaciones", "Contacto operacional"], deliverables: ["Informe de evaluación", "Propuesta de dotación"] },
      { week: 2, title: "Propuesta + contrato", description: "Aprobación comercial y firma", client_requirements: ["Revisión de propuesta", "Firma de contrato"], deliverables: ["Contrato firmado", "Plan de implementación"] },
      { week: 3, title: "Reclutamiento + implementación", description: "Selección y capacitación del personal", client_requirements: ["Coordinación de inducción"], deliverables: ["Personal asignado", "Sistemas activos"] },
      { week: 4, title: "Inicio operación + seguimiento", description: "Go-live con supervisión intensiva", client_requirements: ["Feedback inicial"], deliverables: ["Servicio activo", "KPIs baseline"] },
    ],
    total_duration: "4 semanas / 15 días hábiles",
  },
  s28_cierre: {
    headline: "Seguridad que se gestiona. No seguridad que se espera.",
    cta_primary: { text: "Agendar visita técnica sin costo", link: "https://calendar.app.google/MfyKXvYxURJSnUBe9" },
    cta_secondary: { text: "Solicitar propuesta directa", link: "mailto:comercial@gard.cl" },
    microcopy: "Respuesta en 24 horas hábiles",
  },
  s29_contacto: {
    email: "comercial@gard.cl",
    phone: "+56 9 8230 7771",
    website: "www.gard.cl",
    address: "Lo Fontecilla 201, Las Condes, Chile",
    social_media: {
      linkedin: "https://www.linkedin.com/company/gard-security",
      instagram: "https://www.instagram.com/gardsecuritycl/",
      x: "https://x.com/gard_cl?lang=es",
    },
  },
};
