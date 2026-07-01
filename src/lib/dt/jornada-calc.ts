/**
 * Cálculo puro de jornada laboral (Ley 21.561 — 42 horas).
 *
 * SIN dependencias de red/DB — se puede importar tanto en Server Components
 * como en Client Components (formulario de turnos CPQ). La resolución de los
 * límites vigentes por tenant vive en `jornada-config.ts` (server-only, Prisma),
 * que re-exporta desde acá.
 */

export type Regimen = "ordinaria" | "excepcional";

export interface JornadaLimits {
  /** Tope de jornada ordinaria semanal (42 hoy, 40 en 2028). */
  maxHorasSemanales: number;
  /** Tope diario para jornada EXCEPCIONAL autorizada (típicamente 12). */
  maxHorasDiarias: number;
  /** Máximo de horas extraordinarias por día (art. 31 CT: 2). */
  maxHorasExtras: number;
  leyReferencia: string | null;
}

export const DEFAULT_LIMITS: JornadaLimits = {
  maxHorasSemanales: 42,
  maxHorasDiarias: 12,
  maxHorasExtras: 2,
  leyReferencia: "Ley 21.561",
};

/**
 * Tope de jornada ORDINARIA diaria (art. 28 CT): 10 horas.
 * No vive en la tabla `ConfigJornada` (que sólo guarda el tope excepcional de
 * 12h). Es constante legal, distinto del tope excepcional.
 */
export const MAX_HORAS_DIARIA_ORDINARIA = 10;

export interface JornadaAlerta {
  nivel: "info" | "warn" | "error";
  codigo:
    | "tope_diario"
    | "extra_diaria"
    | "hay_extra"
    | "excepcional_promedio"
    | "requiere_autorizacion_dt";
  msg: string;
}

export interface JornadaAnalysis {
  regimen: Regimen;
  /** Horas de reloj entre entrada y salida (sin descontar colación). */
  horasReloj: number;
  colacionH: number;
  /** Horas efectivas de trabajo por día = reloj − colación. */
  horasEfectivasDia: number;
  /** Días trabajados por semana (ordinaria) o del ciclo (excepcional). */
  diasSemana: number;
  /**
   * Horas efectivas por semana. En jornada ordinaria = efectivas × días.
   * En excepcional = promedio semanal sobre el ciclo (art. 38 / 22 bis).
   */
  horasSemana: number;
  topeSemanal: number;
  /** Tope diario aplicable según régimen (10 ordinaria, 12 excepcional). */
  topeDiario: number;
  /** Horas extra por semana = max(0, horasSemana − topeSemanal). */
  horasExtraSemana: number;
  /** Extra promedio por día trabajado (para comparar contra maxHorasExtras). */
  horasExtraDiaProm: number;
  alertas: JornadaAlerta[];
}

export interface CicloPromedioResult {
  promedio: number;
  cumple: boolean;
  exceso: number;
  horasTotales: number;
  semanasCiclo: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula el promedio semanal para jornada excepcional (Art. 22 bis / 38).
 * Para ciclos como 4x4, 7x7, 14x14 el promedio se mide sobre el ciclo completo:
 * horasTotales / semanasCiclo ≤ maxHorasSemanales.
 */
export function calcularPromedioSemanal(
  horasPorDia: number[],
  ciclo: { diasTrabajo: number; diasDescanso: number },
  maxHorasSemanales: number
): CicloPromedioResult {
  const diasCiclo = ciclo.diasTrabajo + ciclo.diasDescanso;
  const semanasCiclo = diasCiclo / 7;
  const horasTotales = horasPorDia.reduce((sum, h) => sum + h, 0);
  const promedio = semanasCiclo > 0 ? horasTotales / semanasCiclo : 0;
  const exceso = Math.max(0, promedio - maxHorasSemanales);

  return {
    promedio: round2(promedio),
    cumple: promedio <= maxHorasSemanales,
    exceso: round2(exceso),
    horasTotales: round2(horasTotales),
    semanasCiclo: round2(semanasCiclo),
  };
}

/** Duración en horas entre dos "HH:MM"; cruza medianoche si fin <= inicio. */
export function durHoras(inicio: string, fin: string): number {
  const toMin = (t: string) => {
    const [h, m] = (t || "0:0").split(":").map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  };
  let diff = toMin(fin) - toMin(inicio);
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

export interface AnalizarJornadaInput {
  inicio: string;
  fin: string;
  /** Días trabajados por semana (jornada ordinaria). Ignorado si hay `ciclo`. */
  dias: string[];
  /** Minutos de colación no imputables. Default 30 (mínimo legal). */
  colacionMin?: number;
  regimen: Regimen;
  /**
   * Ciclo del rol para jornada excepcional (4x4 → {4,4}). Requerido si
   * `regimen === "excepcional"`; ignorado en ordinaria.
   */
  ciclo?: { diasTrabajo: number; diasDescanso: number };
  limites?: JornadaLimits;
}

/**
 * Analiza una jornada y devuelve horas efectivas/día, horas/semana, horas extra
 * y alertas de cumplimiento. Función pura, apta para vivir en el formulario.
 */
export function analizarJornada(input: AnalizarJornadaInput): JornadaAnalysis {
  const limites = input.limites ?? DEFAULT_LIMITS;
  const colacionMin = input.colacionMin ?? 30;
  const colacionH = round2(colacionMin / 60);

  const horasReloj = round2(durHoras(input.inicio, input.fin));
  const horasEfectivasDia = round2(Math.max(0, horasReloj - colacionH));

  const alertas: JornadaAlerta[] = [];

  if (input.regimen === "excepcional") {
    const ciclo = input.ciclo ?? { diasTrabajo: 4, diasDescanso: 4 };
    const diasSemana = round2(
      (ciclo.diasTrabajo / (ciclo.diasTrabajo + ciclo.diasDescanso)) * 7
    );
    const horasPorDia = Array.from(
      { length: ciclo.diasTrabajo },
      () => horasEfectivasDia
    );
    const prom = calcularPromedioSemanal(
      horasPorDia,
      ciclo,
      limites.maxHorasSemanales
    );
    const topeDiario = limites.maxHorasDiarias;

    if (horasEfectivasDia > topeDiario) {
      alertas.push({
        nivel: "error",
        codigo: "tope_diario",
        msg: `Jornada diaria de ${horasEfectivasDia}h supera el tope de ${topeDiario}h`,
      });
    }
    alertas.push({
      nivel: "info",
      codigo: "requiere_autorizacion_dt",
      msg: "Jornada excepcional: requiere autorización de la Dirección del Trabajo",
    });
    if (!prom.cumple) {
      alertas.push({
        nivel: "error",
        codigo: "excepcional_promedio",
        msg: `El promedio de ${prom.promedio}h/sem supera el tope de ${limites.maxHorasSemanales}h`,
      });
    }

    return {
      regimen: "excepcional",
      horasReloj,
      colacionH,
      horasEfectivasDia,
      diasSemana,
      horasSemana: prom.promedio,
      topeSemanal: limites.maxHorasSemanales,
      topeDiario,
      horasExtraSemana: prom.exceso,
      horasExtraDiaProm:
        prom.exceso > 0 && ciclo.diasTrabajo > 0
          ? round2(prom.exceso / diasSemana)
          : 0,
      alertas,
    };
  }

  // Régimen ordinario (5x2, 6x1, etc.)
  const diasSemana = input.dias.length;
  const horasSemana = round2(horasEfectivasDia * diasSemana);
  const topeDiario = MAX_HORAS_DIARIA_ORDINARIA;
  const horasExtraSemana = round2(Math.max(0, horasSemana - limites.maxHorasSemanales));
  const horasExtraDiaProm =
    horasExtraSemana > 0 && diasSemana > 0
      ? round2(horasExtraSemana / diasSemana)
      : 0;

  if (horasEfectivasDia > topeDiario) {
    alertas.push({
      nivel: "error",
      codigo: "tope_diario",
      msg: `Jornada diaria de ${horasEfectivasDia}h supera el tope ordinario de ${topeDiario}h`,
    });
  }
  if (horasExtraDiaProm > limites.maxHorasExtras) {
    alertas.push({
      nivel: "error",
      codigo: "extra_diaria",
      msg: `${horasExtraDiaProm}h extra/día supera el máximo de ${limites.maxHorasExtras}h`,
    });
  } else if (horasExtraSemana > 0) {
    alertas.push({
      nivel: "warn",
      codigo: "hay_extra",
      msg: `${horasExtraSemana}h extra/semana (recargo +50%)`,
    });
  }

  return {
    regimen: "ordinaria",
    horasReloj,
    colacionH,
    horasEfectivasDia,
    diasSemana,
    horasSemana,
    topeSemanal: limites.maxHorasSemanales,
    topeDiario,
    horasExtraSemana,
    horasExtraDiaProm,
    alertas,
  };
}
