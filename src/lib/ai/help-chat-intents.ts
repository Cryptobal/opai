type IntentLink = {
  label: string;
  path: string;
};

type IntentStep = {
  action: string;
  outcome: string;
  links?: IntentLink[];
};

type IntentDefinition = {
  key: string;
  moduleName: string;
  submoduleName: string;
  aliases: string[];
  purpose: string;
  mainLinks: IntentLink[];
  steps: IntentStep[];
  impacts: string[];
};

const FUNCTIONAL_MARKERS = [
  "como",
  "donde",
  "ruta",
  "url",
  "ingreso",
  "modulo",
  "submodulo",
  "funciona",
  "sirve",
  "turno",
  "pauta",
  "ronda",
  "guardia",
  "cliente",
  "permiso",
  "rol",
];

const DATA_MARKERS = [
  "cuanto",
  "cuantos",
  "cuantas",
  "total",
  "hoy",
  "ayer",
  "valor",
  "rut",
  "metrica",
  "indicador",
  "uf",
  "utm",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteUrl(pathname: string, appBaseUrl: string): string {
  if (!pathname.startsWith("/")) return pathname;
  const base = appBaseUrl.endsWith("/") ? appBaseUrl.slice(0, -1) : appBaseUrl;
  return `${base}${pathname}`;
}

function go(path: string, appBaseUrl: string): string {
  return `[Ingresa aca](${toAbsoluteUrl(path, appBaseUrl)})`;
}

const INTENTS: IntentDefinition[] = [
  {
    key: "ops_pauta_mensual",
    moduleName: "Ops",
    submoduleName: "Pauta mensual",
    aliases: [
      "pauta",
      "pautas",
      "pauta mensual",
      "rol de turnos",
      "calendario de turnos",
      "malla de turnos",
      "turnos planificados",
    ],
    purpose: "Planificar cobertura por instalacion, puesto y slot para todo el mes.",
    mainLinks: [{ label: "Pauta mensual", path: "/ops/pauta-mensual" }],
    steps: [
      {
        action: "Selecciona instalacion y periodo mensual.",
        outcome: "Trabajas sobre la pauta correcta del cliente.",
        links: [{ label: "Pauta mensual", path: "/ops/pauta-mensual" }],
      },
      {
        action: "Asigna guardias a slots por turno.",
        outcome: "La cobertura planificada queda definida por dia.",
      },
      {
        action: "Guarda y valida brechas de cobertura.",
        outcome: "Detectas faltantes antes de la ejecucion diaria.",
      },
    ],
    impacts: [
      "Impacta asistencia diaria, control operativo y cobertura esperada.",
      "Si falta cobertura, puede derivar en PPC o turnos extra.",
    ],
  },
  {
    key: "ops_asistencia_diaria",
    moduleName: "Ops",
    submoduleName: "Asistencia diaria",
    aliases: [
      "asistencia",
      "asistencia diaria",
      "turnos de hoy",
      "quien asistio",
      "presentes y ausentes",
      "ejecucion diaria",
    ],
    purpose: "Registrar la ejecucion real del turno (presentes, ausentes y reemplazos).",
    mainLinks: [{ label: "Asistencia diaria", path: "/ops/pauta-diaria" }],
    steps: [
      {
        action: "Abre el dia operativo de la instalacion.",
        outcome: "Ves dotacion esperada vs. real.",
        links: [{ label: "Asistencia diaria", path: "/ops/pauta-diaria" }],
      },
      {
        action: "Marca presentes, ausentes o reemplazos.",
        outcome: "La operacion real queda trazada.",
      },
      {
        action: "Guarda incidencias del turno.",
        outcome: "Queda evidencia para control y gestion.",
      },
    ],
    impacts: [
      "Alimenta control diario y soporte para turnos extra/payroll.",
      "Desvios de asistencia impactan continuidad operativa.",
    ],
  },
  {
    key: "ops_turnos_extra",
    moduleName: "Ops",
    submoduleName: "Turnos extra",
    aliases: [
      "turno extra",
      "turnos extra",
      "te",
      "horas extra de turno",
      "aprobacion de turnos",
    ],
    purpose: "Gestionar registro, aprobacion y seguimiento de turnos extra.",
    mainLinks: [
      { label: "Registro TE", path: "/te/registro" },
      { label: "Aprobaciones TE", path: "/te/aprobaciones" },
      { label: "Lotes TE", path: "/te/lotes" },
      { label: "Pagos TE", path: "/te/pagos" },
    ],
    steps: [
      {
        action: "Registra el turno extra con instalacion y guardia.",
        outcome: "El evento queda pendiente de control.",
        links: [{ label: "Registro TE", path: "/te/registro" }],
      },
      {
        action: "Gestiona aprobacion del TE.",
        outcome: "Se valida administrativamente el turno.",
        links: [{ label: "Aprobaciones TE", path: "/te/aprobaciones" }],
      },
      {
        action: "Consolida lotes y pagos.",
        outcome: "El proceso queda listo para cierre administrativo.",
        links: [
          { label: "Lotes TE", path: "/te/lotes" },
          { label: "Pagos TE", path: "/te/pagos" },
        ],
      },
    ],
    impacts: [
      "Impacta costos operativos y conciliacion administrativa.",
      "Puede influir en procesos vinculados a remuneraciones.",
    ],
  },
  {
    key: "ops_rondas",
    moduleName: "Ops",
    submoduleName: "Rondas",
    aliases: [
      "ronda",
      "rondas",
      "checkpoint",
      "checkpoints",
      "qr de ronda",
      "control de rondas",
      "programacion de rondas",
    ],
    purpose: "Definir, programar y monitorear rondas operativas por instalacion.",
    mainLinks: [{ label: "Rondas", path: "/ops/rondas" }],
    steps: [
      {
        action: "Crea checkpoints por instalacion.",
        outcome: "Quedan definidos los puntos de control.",
        links: [{ label: "Checkpoints", path: "/ops/rondas/checkpoints" }],
      },
      {
        action: "Arma plantillas con orden de recorrido.",
        outcome: "La secuencia de ronda queda estandarizada.",
        links: [{ label: "Plantillas", path: "/ops/rondas/templates" }],
      },
      {
        action: "Programa dias, horarios y frecuencia.",
        outcome: "La ronda queda calendarizada para ejecucion.",
        links: [{ label: "Programacion", path: "/ops/rondas/programacion" }],
      },
      {
        action: "Monitorea ejecucion y alertas.",
        outcome: "Detectas incumplimientos en tiempo real.",
        links: [
          { label: "Monitoreo", path: "/ops/rondas/monitoreo" },
          { label: "Alertas", path: "/ops/rondas/alertas" },
          { label: "Reportes", path: "/ops/rondas/reportes" },
        ],
      },
    ],
    impacts: [
      "Impacta control operativo, trazabilidad y cumplimiento en terreno.",
      "Desvios de ronda generan alertas y evidencia para gestion.",
    ],
  },
  {
    key: "ops_marcaciones",
    moduleName: "Ops",
    submoduleName: "Marcaciones",
    aliases: ["marcacion", "marcaciones", "pin", "marcar entrada", "marcar salida"],
    purpose: "Controlar y revisar eventos de marcacion operacional.",
    mainLinks: [{ label: "Marcaciones", path: "/ops/marcaciones" }],
    steps: [
      {
        action: "Ingresa al modulo de marcaciones.",
        outcome: "Visualizas eventos y estado de marcacion.",
        links: [{ label: "Marcaciones", path: "/ops/marcaciones" }],
      },
      {
        action: "Revisa reglas/configuracion aplicables.",
        outcome: "Validas consistencia operacional por instalacion.",
      },
    ],
    impacts: ["Impacta control de asistencia y trazabilidad operativa."],
  },
  {
    key: "personas_guardias",
    moduleName: "Personas",
    submoduleName: "Guardias",
    aliases: [
      "guardia",
      "guardias",
      "alta de guardia",
      "ingresar guardia",
      "ficha del guardia",
      "postulante",
    ],
    purpose: "Registrar y administrar el ciclo de vida del guardia.",
    mainLinks: [{ label: "Guardias", path: "/personas/guardias" }],
    steps: [
      {
        action: "Crea o abre la ficha del guardia.",
        outcome: "Queda centralizada su informacion laboral.",
        links: [{ label: "Guardias", path: "/personas/guardias" }],
      },
      {
        action: "Completa identificacion, contacto y estado.",
        outcome: "El guardia queda disponible para asignacion operativa.",
      },
    ],
    impacts: [
      "Impacta asignaciones en pauta, cobertura y disponibilidad operativa.",
      "Cambios de estado afectan planificacion y reemplazos.",
    ],
  },
  {
    key: "crm_clientes",
    moduleName: "CRM",
    submoduleName: "Cuentas/Leads",
    aliases: [
      "cliente",
      "clientes",
      "cuenta",
      "cuentas",
      "prospecto",
      "lead",
      "nuevo cliente",
      "crm",
    ],
    purpose: "Gestionar prospeccion y cartera comercial de clientes.",
    mainLinks: [
      { label: "CRM inicio", path: "/crm" },
      { label: "Cuentas", path: "/crm/accounts" },
      { label: "Leads", path: "/crm/leads" },
      { label: "Deals", path: "/crm/deals" },
    ],
    steps: [
      {
        action: "Da de alta la cuenta o lead.",
        outcome: "Se inicia el flujo comercial.",
        links: [
          { label: "Cuentas", path: "/crm/accounts" },
          { label: "Leads", path: "/crm/leads" },
        ],
      },
      {
        action: "Asocia contactos, instalaciones y oportunidades.",
        outcome: "Queda habilitado el flujo comercial-operativo.",
        links: [{ label: "Deals", path: "/crm/deals" }],
      },
    ],
    impacts: [
      "Cuenta/instalacion habilita procesos posteriores en Ops.",
      "Pipeline comercial impacta cotizaciones y operacion futura.",
    ],
  },
  {
    key: "config_roles_permisos",
    moduleName: "Configuracion",
    submoduleName: "Usuarios/Roles",
    aliases: [
      "configuracion",
      "roles",
      "permisos",
      "usuarios",
      "accesos",
      "quitar acceso",
      "dar acceso",
    ],
    purpose: "Administrar acceso, perfiles y reglas de uso por modulo.",
    mainLinks: [
      { label: "Configuracion", path: "/opai/configuracion" },
      { label: "Usuarios", path: "/opai/configuracion/usuarios" },
      { label: "Roles", path: "/opai/configuracion/roles" },
    ],
    steps: [
      {
        action: "Ingresa a usuarios o roles.",
        outcome: "Seleccionas el objeto a ajustar.",
        links: [
          { label: "Usuarios", path: "/opai/configuracion/usuarios" },
          { label: "Roles", path: "/opai/configuracion/roles" },
        ],
      },
      {
        action: "Asigna o quita permisos por modulo.",
        outcome: "Se aplica el alcance funcional para cada perfil.",
      },
    ],
    impacts: [
      "Impacta visibilidad y capacidad de accion en todos los modulos.",
    ],
  },
  {
    key: "payroll",
    moduleName: "Payroll",
    submoduleName: "Simulador/Parametros",
    aliases: ["payroll", "remuneracion", "simulador sueldo", "parametros sueldo", "nomina"],
    purpose: "Simular y parametrizar reglas de calculo vinculadas a remuneraciones.",
    mainLinks: [
      { label: "Payroll", path: "/payroll" },
      { label: "Simulador", path: "/payroll/simulator" },
      { label: "Parametros", path: "/payroll/parameters" },
    ],
    steps: [
      {
        action: "Abre simulador o parametros.",
        outcome: "Puedes modelar o ajustar reglas de calculo.",
        links: [
          { label: "Simulador", path: "/payroll/simulator" },
          { label: "Parametros", path: "/payroll/parameters" },
        ],
      },
      {
        action: "Guarda configuraciones vigentes.",
        outcome: "Se actualizan resultados de simulacion asociados.",
      },
    ],
    impacts: ["Cambios impactan resultados economicos y escenarios de calculo."],
  },
];

function scoreIntent(message: string, def: IntentDefinition): number {
  let score = 0;

  for (const alias of def.aliases) {
    if (message.includes(alias)) {
      score += alias.includes(" ") ? 5 : 3;
    }
  }

  if (message.includes(def.moduleName.toLowerCase())) {
    score += 2;
  }
  if (message.includes(def.submoduleName.toLowerCase())) {
    score += 2;
  }

  return score;
}

function buildIntentAnswer(def: IntentDefinition, appBaseUrl: string): string {
  return [
    `Te refieres a **${def.moduleName} > ${def.submoduleName}**.`,
    "",
    `**Para que sirve**: ${def.purpose}`,
    "",
    "**Donde esta**:",
    ...def.mainLinks.map((item) => `- ${item.label}: ${go(item.path, appBaseUrl)}`),
    "",
    "**Como se usa (pasos claros)**:",
    ...def.steps.flatMap((step, index) => {
      const links = step.links?.map((item) => `${item.label}: ${go(item.path, appBaseUrl)}`) ?? [];
      return [
        `${index + 1}) ${step.action}`,
        `   Resultado esperado: ${step.outcome}`,
        ...(links.length > 0 ? [`   Ingresa aca: ${links.join(" | ")}`] : []),
      ];
    }),
    "",
    "**Que impacta**:",
    ...def.impacts.map((impact) => `- ${impact}`),
  ].join("\n");
}

function buildTurnosAmbiguousAnswer(appBaseUrl: string): string {
  return [
    "Cuando preguntas por **turnos**, normalmente puede significar dos flujos:",
    "",
    "1) **Planificacion de turnos (Pauta mensual)**",
    `   - Ingresa aca: ${go("/ops/pauta-mensual", appBaseUrl)}`,
    "   - Sirve para asignar cobertura planificada del mes.",
    "",
    "2) **Ejecucion real del turno (Asistencia diaria)**",
    `   - Ingresa aca: ${go("/ops/pauta-diaria", appBaseUrl)}`,
    "   - Sirve para registrar presentes, ausentes y reemplazos.",
    "",
    "Si te refieres a horas adicionales o reemplazos pagables, usa **Turnos Extra**:",
    `- Ingresa aca: ${go("/te/registro", appBaseUrl)}`,
  ].join("\n");
}

function isFunctionalQuestion(message: string): boolean {
  return FUNCTIONAL_MARKERS.some((marker) => message.includes(marker));
}

function isDataHeavyQuestion(message: string): boolean {
  return DATA_MARKERS.some((marker) => message.includes(marker));
}

export function shouldPreferFunctionalInference(
  userMessage: string,
  assistantText: string,
): boolean {
  const msg = normalize(userMessage);
  if (!isFunctionalQuestion(msg) || isDataHeavyQuestion(msg)) return false;
  const hasClickableLink = /\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(assistantText);
  return assistantText.length < 220 || !hasClickableLink;
}

export function resolveFunctionalIntent(userMessage: string, appBaseUrl: string): string | null {
  const msg = normalize(userMessage);

  if (!isFunctionalQuestion(msg)) {
    return null;
  }

  const asksTurnosGeneric =
    msg.includes("turno") &&
    !msg.includes("extra") &&
    !msg.includes("pauta") &&
    !msg.includes("asistencia") &&
    !msg.includes("ronda");

  if (asksTurnosGeneric) {
    return buildTurnosAmbiguousAnswer(appBaseUrl);
  }

  const scored = INTENTS.map((def) => ({ def, score: scoreIntent(msg, def) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return null;
  }

  const top = scored[0];
  const second = scored[1];
  if (second && top.score - second.score <= 1 && top.score < 8) {
    return [
      buildIntentAnswer(top.def, appBaseUrl),
      "",
      "Tambien podria servirte:",
      `- ${second.def.moduleName} > ${second.def.submoduleName}: ${go(
        second.def.mainLinks[0]?.path || "/ops",
        appBaseUrl,
      )}`,
    ].join("\n");
  }

  return buildIntentAnswer(top.def, appBaseUrl);
}
