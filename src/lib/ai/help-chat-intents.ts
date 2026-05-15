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
  "descargar",
  "instalar",
  "app",
  "aplicacion",
  "celular",
  "telefono",
  "home screen",
  "pantalla de inicio",
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

// Verbos que indican intención de mutación/consulta sobre una entidad
// puntual (no sobre un módulo). Si están presentes la respuesta funcional
// nunca debe servirse upfront — siempre dejamos que el LLM use tools.
const ACTION_VERB_MARKERS = [
  "actualiza", "actualizar", "actualizame",
  "modifica", "modificar", "modificame",
  "edita", "editar", "editame",
  "cambia", "cambiar", "cambiame",
  "pon", "poner", "ponle", "ponme",
  "borra", "borrar", "elimina", "eliminar",
  "asigna", "asignar", "asociame", "asociar",
  "agrega", "agregar", "anade", "anadir",
  "muestra", "muestrame", "mostrar",
  "lista", "listame", "listar",
  "dame", "damelo", "muestrameme",
  "quien", "quienes",
  "contactos",
];

// Patrones explícitos que indican una entidad nombrada/identificada.
const RUT_PATTERN = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/;
const ENTITY_CODE_PATTERN =
  /\b(?:CPQ|DEAL|INST|LEAD|TICKET|GUARDIA|RND|OT|OC|HES|FACT|NC|ND|DTE)[-_]?\d+/i;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const QUOTED_PATTERN = /["'`][^"'`]{2,}["'`]/;

// Acrónimos del dominio que NO deben tratarse como nombre propio aunque
// vengan en mayúsculas (ej. "CPQ", "OPAI", "DTE", "UF").
const COMMON_ACRONYMS = new Set([
  "CRM","CPQ","DTE","OPAI","TE","NC","ND","OC","HES","OT","SII","RUT","RUN",
  "UF","UTM","CLP","USD","IVA","DNI","ATS","KPI","KPIS","SAP","API","URL",
  "SMS","ID","UUID","PDF","XML","CSV","SLA","ERP","MRP","IA","AI",
]);

// Vocabulario español/del dominio "conocido". Cualquier token >= 4 letras
// que NO esté aquí lo consideramos potencial nombre propio (cliente,
// contacto, instalación, etc.). Mantener la lista grande es barato y
// reduce falsos positivos.
const KNOWN_VOCABULARY = new Set<string>([
  // articulos, preposiciones, conjunciones
  "este","esta","esto","estos","estas","ese","esa","eso","esos","esas",
  "aquel","aquella","aquellos","aquellas","aquello",
  "del","con","sin","por","para","sobre","ante","bajo","desde","hasta","hacia","entre",
  "pero","sino","aunque","porque","mientras","cuando","donde","como","cual","cuales",
  "que","quien","quienes","cuanto","cuanta","cuantos","cuantas",
  // pronombres y conjugaciones
  "nosotros","ustedes","ellos","ellas",
  "mis","tus","sus","nuestro","nuestra","nuestros","nuestras",
  // verbos comunes (formas mas frecuentes)
  "ser","son","sean","sera","fue","fueron","fuiste","sido",
  "estar","estan","estaba","estaban","estuvo","estuvieron","estado",
  "tener","tiene","tienen","tenia","tenian","tuvo","tuvieron","tengo","tenga","tenemos",
  "haber","habia","habian","habra","hayan","hubo","hubieron",
  "hacer","hace","hacen","hacia","hicieron","hizo","hago","haga","hagan",
  "poder","puede","pueden","podia","podian","podra","puedan","puedo","podemos","podemos",
  "decir","dice","dicen","dijo","dijeron","digo","diga","digan","dime","dimelo",
  "ver","veo","ves","vea","vean","vio","viste","viendo",
  "saber","sabe","saben","sabia","supieron","sepa","sepan",
  "dar","dan","daba","dio","dieron","doy","den",
  "querer","quiere","quieren","queria","quiso","quiero","quisiera",
  "deber","debe","deben","debia","debes","debas",
  "necesito","necesitas","necesita","necesitan",
  "agregar","agrega","agregue","anadir","anade",
  "crear","crea","cree","creen","creame",
  "editar","edita","edite","editen",
  "actualizar","actualiza","actualice","actualicen","actualizado","actualizada",
  "modificar","modifica","modifique","modifiquen",
  "cambiar","cambia","cambie","cambien","cambio","cambios",
  "poner","pone","ponen","puso","pusieron","ponga","ponle","ponerle",
  "borrar","borra","borre","borren",
  "eliminar","elimina","elimine","eliminen",
  "buscar","busca","busque","busquen","buscame",
  "encontrar","encuentra","encuentre","encuentren","encontre",
  "listar","lista","liste","listen","listame",
  "mostrar","muestra","muestre","muestren","muestrame",
  "consultar","consulta","consulte","consultame",
  "asignar","asigna","asignen","asignacion",
  "asociar","asocia","asocien","asociacion",
  "guardar","guarda","guarden","guardado",
  "enviar","envia","envien","enviado","mandar","manda",
  "revisar","revisa","revise","revisen","revisado",
  // adverbios comunes
  "siempre","nunca","jamas","tambien","tampoco","ademas","mucho","poco",
  "mejor","peor","ahora","antes","despues","luego","entonces","casi",
  "todavia","apenas","quizas","tal","vez",
  "hola","gracias","favor","por favor","buenos","buenas","dias","tardes","noches",
  // tiempo
  "hoy","ayer","manana","semana","mes","ano","anos","dia","dias","tarde","tardes",
  "noche","noches","minuto","minutos","hora","horas","fecha","fechas","ahora",
  "ultimo","ultima","ultimos","ultimas","proximo","proxima",
  // calificadores generales
  "nuevo","nueva","nuevos","nuevas","viejo","vieja","actual","actuales",
  "todo","todos","toda","todas","algun","alguna","algunos","algunas",
  "ningun","ninguna","ningunos","ningunas",
  "muchos","muchas","pocas","pocos",
  "grande","grandes","pequeno","pequena","alto","alta","bajo","baja",
  "principal","primario","primaria","secundario","secundaria",
  "activo","activa","inactivo","inactiva",
  "vigente","caducado","caducada","pendiente","pendientes","aprobado","aprobada",
  "rechazado","rechazada","completo","completa","incompleto","incompleta",
  // vocabulario de dominio CRM / Ops / Finance / Personas
  "cliente","clientes","cuenta","cuentas","contacto","contactos",
  "deal","deals","negocio","negocios","oportunidad","oportunidades",
  "cotizacion","cotizaciones","quote","quotes",
  "instalacion","instalaciones","faena","faenas",
  "prospecto","prospectos",
  "factura","facturas","boleta","boletas","nota","notas","credito","debito",
  "rendicion","rendiciones","gasto","gastos","reembolso",
  "colaborador","colaboradores","persona","personas","supervisor","supervisores",
  "pauta","pautas","ronda","rondas","asistencia","supervision","monitoreo",
  "ticket","tickets","alerta","alertas","incidente","incidentes",
  "puesto","puestos","posicion","posiciones",
  "modulo","modulos","submodulo","ruta","rutas","funcion","funcionalidad",
  "permiso","permisos","usuario","usuarios",
  "tenant","tenants","empresa","empresas",
  "comuna","ciudad","direccion","direcciones","sector","sectores",
  "telefono","celular","correo","mail","whatsapp",
  "monto","montos","total","totales","subtotal","neto",
  "moneda","monedas",
  "industria","industrias","rubro","rubros","segmento","segmentos",
  "razon","social","fantasia","legal",
  "representante","administrador","jefe","encargado","encargada","prevencion",
  "prevencionista","contrato","contratos","terreno",
  "aplicacion","movil","celalar","aplicasion",
  "home","screen","pantalla","inicio",
  "registro","aprobacion","aprobaciones","lotes","pagos","pago",
  "informacion","datos","detalle","detalles","resumen","reporte","reportes",
  "documento","documentos","archivo","archivos","anexo","anexos","plantilla","plantillas",
  "campana","campanas","oferta","ofertas","pipeline","embudo",
  "ingreso","ingresos","egreso","egresos","saldo","saldos","balance",
  "venta","ventas","compra","compras",
  "contrato","contratos","servicio","servicios","seguridad",
  "valor","valores",
  // ya en FUNCTIONAL/DATA markers pero por completitud
  "como","donde","ruta","funciona","sirve","turno","turnos","extra",
  "guardia","guardias","lead","leads","rol","roles","descargar","instalar",
  "telefono","aplicacion","celular","cuanto","cuantos","cuantas","valor",
  "rut","metrica","indicador",
]);

function isKnownToken(token: string): boolean {
  return KNOWN_VOCABULARY.has(token);
}

/**
 * Detecta si el mensaje contiene una referencia a una entidad nombrada
 * (cliente, contacto, deal, código, RUT, email, frase entrecomillada).
 * Cuando esto es true, NUNCA se debe servir la plantilla funcional upfront:
 * hay que dejar que el LLM llame search_all/search_accounts/etc. y consulte
 * los datos reales antes de responder.
 *
 * Heurística (conservadora — preferimos falsos negativos a falsos positivos):
 *  - RUT/email/código entidad/frase entrecomillada ⇒ entidad sí o sí.
 *  - Palabra ALL CAPS de >=3 letras que NO sea acrónimo conocido ("AMETEL").
 *  - Palabra capitalizada (Mayus + minúsculas, "Ametel", "Felipe") que NO
 *    sea la primera palabra de la oración y NO esté en el vocabulario
 *    común español/dominio.
 *
 * Si el usuario escribe TODO en minúsculas ("contactos de ametel") no
 * dispara — confiamos en que el LLM aplicará la regla #0 del prompt y
 * llamará search_all igual. Preferimos esto a romper la inferencia
 * funcional legítima por palabras desconocidas accidentales.
 */
export function hasLikelyEntityToken(rawMessage: string): boolean {
  const trimmed = rawMessage.trim();
  if (!trimmed) return false;

  if (RUT_PATTERN.test(trimmed)) return true;
  if (ENTITY_CODE_PATTERN.test(trimmed)) return true;
  if (EMAIL_PATTERN.test(trimmed)) return true;
  if (QUOTED_PATTERN.test(trimmed)) return true;

  const originalTokens = trimmed.match(/[A-Za-zÀ-ÿ0-9_]{3,}/g) ?? [];

  // ALL CAPS no acrónimo (ej: "AMETEL", "BAUWERK").
  for (const w of originalTokens) {
    if (
      w === w.toUpperCase() &&
      /[A-Z]/.test(w) &&
      w.length >= 3 &&
      !COMMON_ACRONYMS.has(w)
    ) {
      return true;
    }
  }

  // Capitalizada en medio de oración (no es la 1ª palabra). Saltamos la
  // primera porque suele ser por mayúscula de inicio.
  for (let i = 0; i < originalTokens.length; i++) {
    const w = originalTokens[i];
    if (i === 0) continue;
    if (/^[A-ZÀ-Ý][a-zà-ÿ]{2,}$/.test(w)) {
      const lower = w.toLowerCase();
      if (!isKnownToken(lower)) return true;
    }
  }

  return false;
}

function hasActionVerb(message: string): boolean {
  return ACTION_VERB_MARKERS.some((marker) => message.includes(marker));
}

function normalize(text: string): string {
  const cleaned = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Correcciones comunes de tipeo para mejorar inferencia.
  return cleaned
    .replace(/\bcelalar\b/g, "celular")
    .replace(/\baplicasion\b/g, "aplicacion")
    .replace(/\bmovile\b/g, "movil");
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
    key: "finance_rendiciones",
    moduleName: "Finanzas",
    submoduleName: "Rendiciones",
    aliases: [
      "rendicion",
      "rendiciones",
      "gasto por rendir",
      "aprobar rendiciones",
      "faltan por aprobar",
      "finanzas",
    ],
    purpose: "Registrar, enviar y aprobar rendiciones de gastos y kilometraje.",
    mainLinks: [
      { label: "Rendiciones", path: "/finanzas/rendiciones" },
      { label: "Mis aprobaciones", path: "/finanzas/rendiciones?filter=my_approvals" },
      { label: "Historial de pagos", path: "/finanzas/rendiciones/historial-pagos" },
    ],
    steps: [
      {
        action: "Crea o revisa la rendicion con sus datos y respaldo.",
        outcome: "El documento queda listo para envio.",
        links: [{ label: "Rendiciones", path: "/finanzas/rendiciones" }],
      },
      {
        action: "Envia la rendicion al flujo de aprobacion.",
        outcome: "Pasa a estado SUBMITTED/IN_APPROVAL segun configuracion.",
      },
      {
        action: "Revisa y resuelve aprobaciones pendientes.",
        outcome: "La rendicion avanza a APPROVED o REJECTED.",
        links: [{ label: "Mis aprobaciones", path: "/finanzas/rendiciones?filter=my_approvals" }],
      },
      {
        action: "Gestiona pago cuando corresponda.",
        outcome: "Cierra el ciclo administrativo de rendicion.",
        links: [{ label: "Historial de pagos", path: "/finanzas/rendiciones/historial-pagos" }],
      },
    ],
    impacts: [
      "Impacta flujo financiero, conciliacion y estado administrativo del gasto.",
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
  {
    key: "finance_flujo_caja",
    moduleName: "Finanzas",
    submoduleName: "Flujo de Caja",
    aliases: [
      "flujo de caja",
      "flujo caja",
      "cashflow",
      "tesoreria",
      "forecast",
      "proyeccion de caja",
      "caja",
      "drift",
      "cuadratura caja",
    ],
    purpose:
      "Proyectar ingresos y egresos por cuenta contable, anclar el saldo al banco real y monitorear desviaciones (drift).",
    mainLinks: [
      { label: "Flujo de Caja", path: "/finanzas/flujo-caja" },
      { label: "Cuadratura", path: "/finanzas/flujo-caja/cuadratura" },
      { label: "Cierre", path: "/finanzas/flujo-caja/cierre" },
      { label: "Configuracion Flujo de Caja", path: "/opai/configuracion/finanzas/flujo-caja" },
    ],
    steps: [
      {
        action: "Abre la matriz de flujo de caja por semana/mes y cuenta contable.",
        outcome: "Visualizas ingresos, egresos y saldo proyectado.",
        links: [{ label: "Flujo de Caja", path: "/finanzas/flujo-caja" }],
      },
      {
        action: "Vincula DTE/cobranza/pagos a cada celda para mejorar la proyeccion.",
        outcome: "El forecast se nutre de hechos reales del sistema.",
      },
      {
        action: "Revisa la cuadratura para detectar drift entre proyectado y saldo banco.",
        outcome: "Quedan claras las diferencias y donde absorberlas.",
        links: [{ label: "Cuadratura", path: "/finanzas/flujo-caja/cuadratura" }],
      },
      {
        action: "Cierra el dia o el periodo cuando este conciliado.",
        outcome: "El saldo queda congelado como punto de partida del siguiente periodo.",
        links: [{ label: "Cierre", path: "/finanzas/flujo-caja/cierre" }],
      },
    ],
    impacts: [
      "Da visibilidad de tesoreria a corto plazo y decisiones de pago.",
      "Conecta con bancos, conciliacion, DTE y cobranza.",
    ],
  },
  {
    key: "finance_dte_emitidos",
    moduleName: "Finanzas",
    submoduleName: "DTE Emitidos",
    aliases: [
      "dte emitido",
      "dte emitidos",
      "factura emitida",
      "facturas emitidas",
      "ventas",
      "libro ventas",
      "rcv ventas",
      "emitir factura",
      "emitir dte",
      "nota credito",
      "nota debito",
      "boleta electronica",
    ],
    purpose:
      "Emitir facturas electronicas (DTE) al SII, hacer seguimiento del estado tributario y de la cobranza.",
    mainLinks: [
      { label: "DTE Emitidos", path: "/finanzas/facturacion/dtes" },
      { label: "Emitir DTE", path: "/finanzas/facturacion/emitir" },
      { label: "Notas", path: "/finanzas/facturacion/notas" },
      { label: "Folios", path: "/finanzas/facturacion/folios" },
      { label: "Recurrentes", path: "/finanzas/facturacion/recurrentes" },
      { label: "Programacion", path: "/finanzas/facturacion/programacion" },
      { label: "Libro IVA", path: "/finanzas/facturacion/libro-iva" },
      { label: "Cesiones / Factoring", path: "/finanzas/facturacion/cesiones" },
    ],
    steps: [
      {
        action: "Verifica que tengas folios CAF cargados para el tipo de DTE.",
        outcome: "Puedes emitir sin bloqueos del SII.",
        links: [{ label: "Folios", path: "/finanzas/facturacion/folios" }],
      },
      {
        action: "Crea el DTE desde Emitir o desde una cotizacion/contrato vinculado.",
        outcome: "Queda en estado borrador o pendiente de envio.",
        links: [{ label: "Emitir DTE", path: "/finanzas/facturacion/emitir" }],
      },
      {
        action: "Envia al SII y al receptor por mail.",
        outcome: "Quedan track-id, XML y PDF asociados al documento.",
      },
      {
        action: "Sigue el estado tributario (Aceptado/Reparos/Rechazado) y la cobranza.",
        outcome: "Visibilidad fin a fin del documento.",
        links: [{ label: "DTE Emitidos", path: "/finanzas/facturacion/dtes" }],
      },
    ],
    impacts: [
      "Alimenta libro IVA, F29, flujo de caja (cobranza) y contabilidad.",
      "Una factura cedida en factoring cambia su flujo de pago esperado.",
    ],
  },
  {
    key: "finance_dte_recibidos",
    moduleName: "Finanzas",
    submoduleName: "DTE Recibidos",
    aliases: [
      "dte recibido",
      "dte recibidos",
      "factura recibida",
      "facturas recibidas",
      "compras",
      "libro compras",
      "rcv compras",
      "proveedor",
      "proveedores",
      "factura de compra",
    ],
    purpose:
      "Registrar, clasificar y aprobar facturas recibidas de proveedores; programar su pago.",
    mainLinks: [
      { label: "DTE Recibidos", path: "/finanzas/facturacion/recibidos" },
      { label: "Proveedores", path: "/finanzas/proveedores" },
      { label: "Pagos a Proveedores", path: "/finanzas/pagos-proveedores" },
      { label: "Aprobaciones Finanzas", path: "/finanzas/aprobaciones" },
    ],
    steps: [
      {
        action: "Registra el DTE recibido (manual, por mail entrante o sincronizando RCV).",
        outcome: "Queda creada la cuenta por pagar con monto y fecha.",
        links: [{ label: "DTE Recibidos", path: "/finanzas/facturacion/recibidos" }],
      },
      {
        action: "Clasifica con centro de costo (cliente/instalacion) y cuenta contable.",
        outcome: "El gasto se asigna correctamente para reportes y rentabilidad.",
      },
      {
        action: "Pasa por aprobacion segun el monto y el workflow del tenant.",
        outcome: "Documento aprobado y listo para pago.",
        links: [{ label: "Aprobaciones Finanzas", path: "/finanzas/aprobaciones" }],
      },
      {
        action: "Programa o ejecuta el pago al proveedor.",
        outcome: "Genera movimiento bancario y baja la cuenta por pagar.",
        links: [{ label: "Pagos a Proveedores", path: "/finanzas/pagos-proveedores" }],
      },
    ],
    impacts: [
      "Alimenta libro IVA compras, flujo de caja (egresos), conciliacion y contabilidad.",
    ],
  },
  {
    key: "finance_bancos_conciliacion",
    moduleName: "Finanzas",
    submoduleName: "Bancos y Conciliacion",
    aliases: [
      "banco",
      "bancos",
      "cuenta corriente",
      "saldo banco",
      "cartola",
      "conciliacion",
      "conciliar",
      "match banco",
      "reglas auto match",
    ],
    purpose:
      "Administrar cuentas bancarias, cargar cartolas y conciliar movimientos contra DTE/rendiciones/pagos.",
    mainLinks: [
      { label: "Bancos", path: "/finanzas/bancos" },
      { label: "Conciliacion", path: "/finanzas/conciliacion" },
    ],
    steps: [
      {
        action: "Carga o sincroniza la cartola del banco.",
        outcome: "Los movimientos quedan disponibles para conciliar.",
        links: [{ label: "Bancos", path: "/finanzas/bancos" }],
      },
      {
        action: "Concilia movimientos contra DTE, pagos y rendiciones (manual o reglas auto-match).",
        outcome: "Cada movimiento queda con su contraparte y estado.",
        links: [{ label: "Conciliacion", path: "/finanzas/conciliacion" }],
      },
      {
        action: "Revisa diferencias y ajusta saldo ancla del flujo de caja si corresponde.",
        outcome: "El sistema queda alineado con la realidad bancaria.",
      },
    ],
    impacts: [
      "Es la base del flujo de caja real, del cierre contable y de la auditoria financiera.",
    ],
  },
  {
    key: "finance_contabilidad_reportes",
    moduleName: "Finanzas",
    submoduleName: "Contabilidad y Reportes",
    aliases: [
      "contabilidad",
      "plan de cuentas",
      "asiento",
      "asientos",
      "libro mayor",
      "balance",
      "eerr",
      "estado de resultados",
      "rentabilidad",
      "informe financiero",
      "reporte financiero",
    ],
    purpose:
      "Gestionar plan de cuentas, asientos y obtener reportes financieros (Balance, EERR, Mayor, Ventas, Compras, Rentabilidad).",
    mainLinks: [
      { label: "Contabilidad", path: "/finanzas/contabilidad" },
      { label: "Asientos", path: "/finanzas/contabilidad/asientos" },
      { label: "Reportes", path: "/finanzas/reportes" },
      { label: "Balance", path: "/finanzas/reportes/balance" },
      { label: "EERR", path: "/finanzas/reportes/eerr" },
      { label: "Libro Mayor", path: "/finanzas/reportes/mayor" },
      { label: "Rentabilidad", path: "/finanzas/reportes/rentabilidad" },
    ],
    steps: [
      {
        action: "Mantienes el plan de cuentas alineado al negocio.",
        outcome: "Los reportes y el flujo de caja agrupan correctamente.",
        links: [{ label: "Contabilidad", path: "/finanzas/contabilidad" }],
      },
      {
        action: "Revisas asientos automaticos (DTE, pagos, rendiciones, banco).",
        outcome: "Validas que la contabilidad refleje la operacion.",
        links: [{ label: "Asientos", path: "/finanzas/contabilidad/asientos" }],
      },
      {
        action: "Consultas reportes financieros del periodo.",
        outcome: "Obtienes Balance, EERR, mayor y margen por cliente.",
        links: [{ label: "Reportes", path: "/finanzas/reportes" }],
      },
    ],
    impacts: [
      "Soporta cierres contables, auditoria, F29 y reportes a directorio.",
    ],
  },
  {
    key: "command_palette",
    moduleName: "Opai",
    submoduleName: "Buscador global (Command Palette)",
    aliases: [
      "buscador",
      "command palette",
      "atajo de busqueda",
      "como busco",
      "barra de busqueda",
      "ctrl k",
      "cmd k",
      "comando k",
    ],
    purpose:
      "Navegar y buscar cualquier cosa en OPAI desde un solo lugar: modulos, guardias, clientes, instalaciones, DTE por folio, contactos, chats, productos y mas.",
    mainLinks: [
      { label: "Hub", path: "/hub" },
    ],
    steps: [
      {
        action: "Presiona Cmd+K (Mac) o Ctrl+K (Windows) desde cualquier pagina.",
        outcome: "Se abre el buscador global.",
      },
      {
        action: "Escribe lo que buscas: nombre, RUT, folio de factura, instalacion, telefono, SKU.",
        outcome: "Los resultados se agrupan por modulo (CRM, Operaciones, Inventario, Finanzas, Documentos, Chat).",
      },
      {
        action: "Selecciona con Enter o click para ir directo al detalle.",
        outcome: "Te ahorra clics en el menu lateral.",
      },
    ],
    impacts: [
      "Atajo principal de navegacion del producto.",
    ],
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

function isInstallHomeScreenQuestion(message: string): boolean {
  const asksInstall =
    message.includes("descargar") ||
    message.includes("instalar") ||
    message.includes("app") ||
    message.includes("aplicacion");
  const mentionsMobileDevice =
    message.includes("celular") ||
    message.includes("cel") ||
    message.includes("telefono") ||
    message.includes("movil") ||
    message.includes("iphone") ||
    message.includes("android");
  const asksHomeScreen =
    message.includes("pantalla de inicio") ||
    message.includes("home screen") ||
    message.includes("acceso directo") ||
    message.includes("icono");
  const mentionsSite =
    message.includes("opai") || message.includes("plataforma") || message.includes("sistema");

  return (
    (asksInstall && mentionsSite) ||
    (asksHomeScreen && mentionsSite) ||
    (asksInstall && asksHomeScreen) ||
    (asksInstall && mentionsMobileDevice)
  );
}

function buildInstallHomeScreenAnswer(): string {
  const url = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  const displayUrl = url.replace(/^https?:\/\//, "");
  return [
    "Si quieres, lo hacemos altiro. Primero dime:",
    "1) **Dispositivo**: iPhone o Android",
    "2) **Navegador**: Safari, Chrome, Edge, Firefox, Samsung Internet o app Google",
    "",
    `Mientras tanto, aqui tienes el paso a paso para [${displayUrl}](${url}):`,
    "",
    "**iPhone**",
    "- **Safari**:",
    "  1) Abre el sitio en Safari.",
    "  2) Toca el boton **Compartir** (cuadrado con flecha).",
    "  3) Selecciona **Anadir a pantalla de inicio**.",
    "  4) Confirma con **Anadir**.",
    "- **Chrome / Edge (iOS)**:",
    "  1) Abre el sitio en el navegador.",
    "  2) Toca **Compartir** (o menu del navegador).",
    "  3) Elige **Anadir a pantalla de inicio**.",
    "  4) Confirma con **Anadir**.",
    "  5) Si no aparece esa opcion, abre el sitio en Safari y haz el flujo de Safari.",
    "",
    "**Android**",
    "- **Chrome**:",
    "  1) Abre el sitio en Chrome.",
    "  2) Toca menu **⋮**.",
    "  3) Elige **Anadir a pantalla principal / Instalar app**.",
    "  4) Confirma con **Anadir** o **Instalar**.",
    "- **Samsung Internet**:",
    "  1) Abre el sitio.",
    "  2) Toca menu **≡ / ⋮**.",
    "  3) Elige **Anadir pagina a** -> **Pantalla de inicio**.",
    "  4) Confirma con **Anadir**.",
    "- **Edge / Firefox (Android)**:",
    "  1) Abre el sitio.",
    "  2) Abre menu del navegador.",
    "  3) Busca **Anadir a pantalla de inicio** o **Instalar**.",
    "  4) Confirma.",
    "- **App Google (Android/iOS)**:",
    "  1) Abre el sitio desde Chrome/Safari para asegurar la opcion.",
    "  2) Haz el flujo de **Anadir a pantalla de inicio** desde ese navegador.",
    "",
    "**Acceso directo**:",
    `- [Abrir OPAI](${url})`,
  ].join("\n");
}

function isProspectToClientQuestion(message: string): boolean {
  const mentionsProspect = message.includes("prospecto") || message.includes("lead");
  const mentionsClient = message.includes("cliente");
  const asksConversion =
    message.includes("pasar") ||
    message.includes("paso") ||
    message.includes("convertir") ||
    message.includes("conversion") ||
    message.includes("cambiar");

  return mentionsProspect && mentionsClient && asksConversion;
}

function buildProspectToClientAnswer(appBaseUrl: string): string {
  return [
    "Perfecto, para **pasar un prospecto/lead a cliente** sigue este flujo:",
    "",
    "**Donde se hace**:",
    `- Leads: ${go("/crm/leads", appBaseUrl)}`,
    `- Cuentas (verificacion final): ${go("/crm/accounts", appBaseUrl)}`,
    "",
    "**Paso a paso**:",
    "1) Abre el lead/prospecto que quieres convertir.",
    "   Resultado esperado: quedas en la ficha comercial del registro.",
    `   Ingresa aca: Leads: ${go("/crm/leads", appBaseUrl)}`,
    "2) Ejecuta la accion de conversion o cambio de tipo a cliente (segun la vista habilitada).",
    "   Resultado esperado: el registro cambia de prospecto a cliente.",
    "3) Completa/valida datos obligatorios de cuenta e instalacion si el flujo lo solicita.",
    "   Resultado esperado: el cliente queda listo para operacion/cotizacion.",
    "4) Guarda los cambios y valida que aparezca en Cuentas.",
    "   Resultado esperado: la cuenta ya queda en cartera de clientes.",
    `   Ingresa aca: Cuentas: ${go("/crm/accounts", appBaseUrl)}`,
    "",
    "**Que impacta**:",
    "- Habilita continuar con deals/cotizaciones y preparacion operativa (instalaciones y flujos de Ops).",
    `- Deal comercial: ${go("/crm/deals", appBaseUrl)}`,
    `- Instalaciones: ${go("/crm/installations", appBaseUrl)}`,
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
  const asksRendicionData =
    msg.includes("rendicion") &&
    (msg.includes("faltan") ||
      msg.includes("pendiente") ||
      msg.includes("pendientes") ||
      msg.includes("aprobacion") ||
      msg.includes("aprobar"));

  if (asksRendicionData) return false;
  // Si la pregunta contiene una entidad nombrada (Ametel, Felipe Rivas,
  // CPQ-1234, un RUT, un email) o un verbo de acción sobre entidad
  // (actualizar/cambiar/asignar/listar/quién), la inferencia funcional NO
  // aplica: la respuesta correcta requiere datos reales del CRM.
  if (hasLikelyEntityToken(userMessage)) return false;
  if (hasActionVerb(msg)) return false;
  if (!isFunctionalQuestion(msg) || isDataHeavyQuestion(msg)) return false;
  const hasClickableLink = /\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(assistantText);
  return assistantText.length < 220 || !hasClickableLink;
}

/**
 * Decide upfront (sin necesidad de la respuesta del AI) si debemos servir
 * directamente la respuesta inferida en vez de invocar al modelo. Útil para
 * preguntas puramente funcionales tipo "¿cómo creo X?" / "¿dónde está Y?",
 * donde el modelo y luego el reemplazo post-stream causaban un bug visual
 * de doble respuesta (el usuario veía la respuesta del AI y luego la
 * plantilla "Te refieres a..." sustituyéndola).
 */
export function shouldUseInferredAnswerUpfront(userMessage: string): boolean {
  const msg = normalize(userMessage);
  // Excepción explícita: rendiciones pendientes/aprobaciones requieren datos.
  const asksRendicionData =
    msg.includes("rendicion") &&
    (msg.includes("faltan") ||
      msg.includes("pendiente") ||
      msg.includes("pendientes") ||
      msg.includes("aprobacion") ||
      msg.includes("aprobar"));
  if (asksRendicionData) return false;
  // Si hay nombre propio / código / RUT / email / frase entrecomillada,
  // SIEMPRE dejar que el LLM consulte datos vía tools. Sin esto el bot
  // contestaba "Te refieres a CRM > Cuentas/Leads" cuando el usuario
  // preguntaba por "contactos de Ametel".
  if (hasLikelyEntityToken(userMessage)) return false;
  // Verbos de acción sobre entidad ("actualiza", "cambia", "quién", etc.)
  // requieren tools, no la plantilla de navegación.
  if (hasActionVerb(msg)) return false;
  if (isDataHeavyQuestion(msg)) return false;
  return isFunctionalQuestion(msg);
}

export function resolveFunctionalIntent(userMessage: string, appBaseUrl: string): string | null {
  const msg = normalize(userMessage);

  if (isInstallHomeScreenQuestion(msg)) {
    return buildInstallHomeScreenAnswer();
  }

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

  if (isProspectToClientQuestion(msg)) {
    return buildProspectToClientAnswer(appBaseUrl);
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
