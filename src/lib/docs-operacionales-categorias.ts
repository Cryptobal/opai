/**
 * Categorías de documentos operacionales — derivadas del código del tipo.
 *
 * Se mantiene en código (no en DB) para no requerir migración. Si en el
 * futuro se quiere editable por el usuario, se puede mover a una columna
 * `categoria` en `TipoDocOperacional`. Por ahora basta el mapeo.
 */

export type DocCategoria =
  | "administrativos"
  | "seguros"
  | "rrhh"
  | "protocolos_seguridad"
  | "otros";

export const CATEGORIA_LABEL: Record<DocCategoria, string> = {
  administrativos: "Administrativos y Habilitantes",
  seguros: "Seguros y Pólizas",
  rrhh: "RRHH y Reglamentos",
  protocolos_seguridad: "Protocolos y Seguridad",
  otros: "Otros",
};

export const CATEGORIA_DESCRIPTION: Record<DocCategoria, string> = {
  administrativos:
    "Habilitaciones legales, autorizaciones y resoluciones de fiscalización.",
  seguros: "Pólizas vigentes y certificados de cobertura.",
  rrhh: "Reglamentos internos, convenios y políticas laborales.",
  protocolos_seguridad:
    "Protocolos de emergencia, planes de evacuación y procedimientos de seguridad.",
  otros: "Otros documentos sin clasificación específica.",
};

export const CATEGORIA_ORDER: DocCategoria[] = [
  "protocolos_seguridad",
  "administrativos",
  "seguros",
  "rrhh",
  "otros",
];

/**
 * Mapeo explícito de prefijos/códigos conocidos. Si un código nuevo no
 * matchea ningún prefijo, cae en "otros".
 */
const PREFIX_RULES: Array<{ prefix: string; categoria: DocCategoria }> = [
  // Protocolos y seguridad
  { prefix: "protocolo", categoria: "protocolos_seguridad" },
  { prefix: "plan_emergencia", categoria: "protocolos_seguridad" },
  { prefix: "plan_evacuacion", categoria: "protocolos_seguridad" },
  { prefix: "plan_contingencia", categoria: "protocolos_seguridad" },
  { prefix: "matriz_riesgo", categoria: "protocolos_seguridad" },
  { prefix: "manual_seguridad", categoria: "protocolos_seguridad" },
  { prefix: "evac", categoria: "protocolos_seguridad" },
  { prefix: "emergencia", categoria: "protocolos_seguridad" },
  { prefix: "seguridad", categoria: "protocolos_seguridad" },

  // Seguros
  { prefix: "seguro", categoria: "seguros" },
  { prefix: "poliza", categoria: "seguros" },

  // RRHH
  { prefix: "reglamento", categoria: "rrhh" },
  { prefix: "convenio", categoria: "rrhh" },
  { prefix: "rrhh", categoria: "rrhh" },
  { prefix: "rich", categoria: "rrhh" }, // RICHS = Reglamento Interno

  // Administrativos
  { prefix: "os10", categoria: "administrativos" },
  { prefix: "os_10", categoria: "administrativos" },
  { prefix: "decreto", categoria: "administrativos" },
  { prefix: "resolucion", categoria: "administrativos" },
  { prefix: "centralizacion", categoria: "administrativos" },
  { prefix: "centraliz", categoria: "administrativos" },
];

/**
 * Mapeo por **palabra clave en el nombre** — fallback cuando el código no
 * tenga prefijo explícito (ej. "custom_protocolo_actuacion_emergencias").
 */
const NAME_KEYWORDS: Array<{ keyword: RegExp; categoria: DocCategoria }> = [
  { keyword: /protocolo|emergencia|evacuaci[oó]n|seguridad|contingencia|riesgo/i, categoria: "protocolos_seguridad" },
  { keyword: /seguro|p[oó]liza|cobertura/i, categoria: "seguros" },
  { keyword: /reglamento|convenio|rrhh|laboral/i, categoria: "rrhh" },
  { keyword: /os.?10|decreto|resoluci[oó]n|centralizaci[oó]n/i, categoria: "administrativos" },
];

export function categoriaForTipo(args: {
  codigo: string;
  nombre?: string | null;
}): DocCategoria {
  const codigo = (args.codigo ?? "").toLowerCase();

  for (const rule of PREFIX_RULES) {
    if (codigo.includes(rule.prefix)) return rule.categoria;
  }

  const nombre = args.nombre ?? "";
  for (const rule of NAME_KEYWORDS) {
    if (rule.keyword.test(nombre)) return rule.categoria;
  }

  return "otros";
}

/**
 * Tipos default que se siembran lazy la primera vez que un tenant entra a
 * "Documentos Operacionales", de modo que la categoría "Protocolos y
 * Seguridad" tenga un esqueleto útil sin tener que crear cada uno a mano.
 *
 * NOTA: Estos tipos llegan con `useAsAiKnowledge=true` por la migración
 * `20260629000000_add_ai_knowledge_flag_and_exam_sources` (matchea por
 * prefijo de código). Si agregas un código nuevo aquí, asegúrate que
 * comience con uno de estos prefijos: `protocolo`, `plan_evacuacion`,
 * `plan_contingencia`, `plan_emergencia`, `matriz_riesgo`,
 * `manual_seguridad`, `evac`, `emergencia`, `seguridad`. De lo contrario
 * el flag quedará en false y deberá activarse desde la UI.
 */
export type DefaultTipoSeed = {
  codigo: string;
  nombre: string;
  capa: "global" | "instalacion" | "guardia";
  obligatorio: boolean;
  tieneVencimiento: boolean;
  diasAlerta: number;
  obligatorioEnVisita: boolean;
  normativa: string | null;
  order: number;
};

export const DEFAULT_PROTOCOLOS_GLOBAL: DefaultTipoSeed[] = [
  {
    codigo: "protocolo_emergencias",
    nombre: "Protocolo de Actuación ante Emergencias",
    capa: "global",
    obligatorio: true,
    tieneVencimiento: false,
    diasAlerta: 0,
    obligatorioEnVisita: false,
    normativa: null,
    order: 50,
  },
  {
    codigo: "plan_evacuacion",
    nombre: "Plan de Evacuación",
    capa: "global",
    obligatorio: false,
    tieneVencimiento: false,
    diasAlerta: 0,
    obligatorioEnVisita: false,
    normativa: null,
    order: 51,
  },
  {
    codigo: "plan_contingencia",
    nombre: "Plan de Contingencia",
    capa: "global",
    obligatorio: false,
    tieneVencimiento: false,
    diasAlerta: 0,
    obligatorioEnVisita: false,
    normativa: null,
    order: 52,
  },
  {
    codigo: "matriz_riesgo",
    nombre: "Matriz de Riesgos",
    capa: "global",
    obligatorio: false,
    tieneVencimiento: false,
    diasAlerta: 0,
    obligatorioEnVisita: false,
    normativa: null,
    order: 53,
  },
];
