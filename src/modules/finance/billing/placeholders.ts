/**
 * Resolver de placeholders para textos de plantillas de DTE recurrentes.
 *
 * Permite escribir en `itemName`, `description` y `notes` tokens del
 * tipo `{{periodo}}` o `{{uf_valor}}` que el cron (o el form one-shot)
 * reemplaza por sus valores reales al momento de generar el borrador.
 *
 * Reglas:
 *   - Tokens son `{{nombre}}`, sin espacios, en lowercase canónico.
 *   - El matching es case-insensitive y sin tilde
 *     (`{{Periodo}}`, `{{PERIODO}}`, `{{periodo_año}}` ≡ `{{periodo_anio}}`).
 *   - Tokens desconocidos se dejan **literales** en el texto resuelto
 *     (eso permite detectar typos sin romper la emisión).
 *   - Tokens cuyo valor no aplica al contexto (ej: `{{uf_monto}}` con
 *     currency=CLP, o `{{instalacion}}` sin instalación asignada) se
 *     reemplazan por **string vacío**.
 *
 * Función pura, sin I/O. El caller (cron `runTemplate`, form one-shot)
 * arma el `PlaceholderContext` y llama `resolvePlaceholders`.
 */

export type PeriodPolicy = "CURRENT_MONTH" | "PREVIOUS_MONTH" | "NEXT_MONTH";

export interface PeriodInfo {
  /** Nombre del mes en español, capitalizado: "Mayo". */
  mes: string;
  /** Año a 4 dígitos: 2026. */
  anio: number;
  /** Forma corta numérica: "05/2026". */
  periodoCorto: string;
}

export interface PlaceholderContext {
  /**
   * Período resuelto según la `periodPolicy` de la plantilla. Para DTE
   * one-shot se usa el mes corriente.
   */
  period: PeriodInfo;
  /**
   * UF efectiva en el contexto (la que el cron resolvió según
   * `ufFixingPolicy`, o la del día en one-shot). Null si no hay UF
   * disponible (ej: tenant sin servicio UF, falla de fetch).
   */
  uf: { value: number; date: Date } | null;
  /**
   * Monto en UF de la línea actual. Se setea por línea cuando el
   * resolver corre línea por línea con `currency=UF` y la línea tiene
   * `unitPriceUf` definido. En CLP queda undefined.
   */
  ufMonto?: number;
  /** Cantidad de la línea actual (para multiplicar uf_monto si aplica). */
  ufMontoQuantity?: number;
  /** Nombre del receptor (CrmAccount.name o receiverName). */
  cliente: string;
  /** Nombre de la instalación si está asignada al template/draft. */
  instalacion: string | null;
  /** Moneda del DTE/plantilla. */
  currency: "CLP" | "UF";
}

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/**
 * Calcula el `PeriodInfo` según la policy. `runDate` se interpreta en
 * UTC para evitar drift por timezone (el cron corre en UTC en Vercel).
 */
export function resolvePeriodFromPolicy(
  policy: PeriodPolicy,
  runDate: Date,
): PeriodInfo {
  const y = runDate.getUTCFullYear();
  const m = runDate.getUTCMonth(); // 0-indexed
  let targetY = y;
  let targetM = m;
  switch (policy) {
    case "CURRENT_MONTH":
      break;
    case "PREVIOUS_MONTH":
      targetM = m - 1;
      if (targetM < 0) {
        targetM = 11;
        targetY = y - 1;
      }
      break;
    case "NEXT_MONTH":
      targetM = m + 1;
      if (targetM > 11) {
        targetM = 0;
        targetY = y + 1;
      }
      break;
    default:
      // Defensa ante valores futuros / migración: caemos a CURRENT.
      break;
  }
  const periodoCorto = `${String(targetM + 1).padStart(2, "0")}/${targetY}`;
  return { mes: MESES_ES[targetM], anio: targetY, periodoCorto };
}

/**
 * Formatea un monto CLP con separadores de miles (`$ 39.485`). Sin
 * decimales (CLP no usa centavos).
 */
function formatClp(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formatea una fecha como DD/MM/YYYY usando UTC (sin drift por TZ).
 */
function formatDateDmy(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formatea un monto UF con 4 decimales (formato chileno: coma decimal,
 * punto miles). Ej: 40,1730 UF.
 */
function formatUf(value: number): string {
  return `${new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value)} UF`;
}

/**
 * Aliases para tokens que tras la normalización NFD pueden no coincidir
 * con la forma canónica. Caso típico: "año" → NFD → "ano" (la ñ se
 * descompone en n + tilde combinatoria y el strip de diacríticos
 * también remueve la tilde de la ñ). Mapeamos `periodo_ano` al alias
 * canónico `periodo_anio` que es la forma "sin ñ" que la gente tipea
 * cuando no tiene teclado en español.
 */
const TOKEN_ALIASES: Record<string, string> = {
  periodo_ano: "periodo_anio",
};

/**
 * Normaliza un nombre de token a la forma canónica:
 *   - lowercase
 *   - sin acentos (NFD + strip diacritics, incluye la tilde de la ñ)
 *   - aplicación de aliases (ej: "ano" → "anio")
 *
 * Ej: "Periodo" → "periodo", "periodo_año" → "periodo_anio".
 */
function normalizeToken(raw: string): string {
  const stripped = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return TOKEN_ALIASES[stripped] ?? stripped;
}

/**
 * Resuelve un token canónico contra el contexto. Devuelve undefined si
 * el token es desconocido — el caller deja el `{{...}}` literal.
 */
function resolveToken(token: string, ctx: PlaceholderContext): string | undefined {
  switch (token) {
    case "periodo":
      return `${ctx.period.mes} ${ctx.period.anio}`;
    case "periodo_mes":
      return ctx.period.mes;
    case "periodo_anio":
      return String(ctx.period.anio);
    case "periodo_corto":
      return ctx.period.periodoCorto;
    case "uf_valor":
      return ctx.uf ? formatClp(ctx.uf.value) : "";
    case "uf_fecha":
      return ctx.uf ? formatDateDmy(ctx.uf.date) : "";
    case "uf_monto":
      if (ctx.currency !== "UF") return "";
      if (ctx.ufMonto == null) return "";
      const qty = ctx.ufMontoQuantity ?? 1;
      return formatUf(ctx.ufMonto * qty);
    case "cliente":
      return ctx.cliente ?? "";
    case "instalacion":
      return ctx.instalacion ?? "";
    default:
      return undefined;
  }
}

/**
 * Reemplaza todos los `{{token}}` en `text` por su valor resuelto.
 * Ver reglas en el doc del módulo.
 */
export function resolvePlaceholders(text: string, ctx: PlaceholderContext): string {
  if (!text) return text;
  return text.replace(/\{\{([a-zA-ZñÑáéíóúÁÉÍÓÚ_]+)\}\}/g, (whole, raw: string) => {
    const norm = normalizeToken(raw);
    const resolved = resolveToken(norm, ctx);
    if (resolved === undefined) return whole; // desconocido → literal
    return resolved;
  });
}

/**
 * Detecta si un texto contiene al menos un placeholder. Útil para
 * mostrar la "Vista previa" sólo cuando el usuario tipeó tokens.
 */
export function hasPlaceholders(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\{\{[a-zA-ZñÑáéíóúÁÉÍÓÚ_]+\}\}/.test(text);
}

/**
 * Construye un `PlaceholderContext` (sin `ufMonto` ni
 * `ufMontoQuantity`, esos se setean por línea). Helper para el caller
 * que tenga los datos de la plantilla y la fecha del run.
 */
export function buildContext(input: {
  periodPolicy: PeriodPolicy;
  runDate: Date;
  uf: { value: number; date: Date } | null;
  cliente: string;
  instalacion: string | null;
  currency: "CLP" | "UF";
}): Omit<PlaceholderContext, "ufMonto" | "ufMontoQuantity"> {
  return {
    period: resolvePeriodFromPolicy(input.periodPolicy, input.runDate),
    uf: input.uf,
    cliente: input.cliente,
    instalacion: input.instalacion,
    currency: input.currency,
  };
}

/**
 * Lista de tokens disponibles para el picker UI. El orden refleja
 * frecuencia de uso esperada (período primero, datos del cliente al final).
 */
export const PLACEHOLDER_CATALOG: ReadonlyArray<{
  token: string;
  label: string;
  description: string;
  /** Si false, el token se oculta cuando currency=CLP. */
  appliesToClp: boolean;
}> = [
  {
    token: "{{periodo}}",
    label: "Período",
    description: "Mes y año del período (ej: Mayo 2026)",
    appliesToClp: true,
  },
  {
    token: "{{periodo_mes}}",
    label: "Mes del período",
    description: "Solo el mes en texto (ej: Mayo)",
    appliesToClp: true,
  },
  {
    token: "{{periodo_anio}}",
    label: "Año del período",
    description: "Solo el año (ej: 2026)",
    appliesToClp: true,
  },
  {
    token: "{{periodo_corto}}",
    label: "Período corto",
    description: "Numérico corto (ej: 05/2026)",
    appliesToClp: true,
  },
  {
    token: "{{uf_valor}}",
    label: "Valor UF",
    description: "Valor UF del día (ej: $ 39.485)",
    appliesToClp: false,
  },
  {
    token: "{{uf_fecha}}",
    label: "Fecha UF",
    description: "Fecha de la UF usada (ej: 01/05/2026)",
    appliesToClp: false,
  },
  {
    token: "{{uf_monto}}",
    label: "Monto UF",
    description: "Monto de la línea en UF (ej: 40,1730 UF)",
    appliesToClp: false,
  },
  {
    token: "{{cliente}}",
    label: "Cliente",
    description: "Nombre del receptor",
    appliesToClp: true,
  },
  {
    token: "{{instalacion}}",
    label: "Instalación",
    description: "Nombre de la instalación si está asignada",
    appliesToClp: true,
  },
];
