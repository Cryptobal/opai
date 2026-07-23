import { todayInChile, ymdInChile, addDaysChile } from "@/lib/dates-cl";

/**
 * Agrupación de tareas por vencimiento para la vista /opai/tareas
 * (estilo Todoist/Google Tasks). Todo el cálculo de límites de día usa TZ Chile
 * (`@/lib/dates-cl`) — nunca `new Date()` local para fronteras de día.
 *
 * Lógica pura (sin prisma) para poder testearla y usarla en cliente y servidor.
 */

export type TareaBucket =
  | "vencidas"
  | "hoy"
  | "manana"
  | "semana"
  | "adelante"
  | "sin_fecha";

export const TAREA_BUCKET_LABELS: Record<TareaBucket, string> = {
  vencidas: "Vencidas",
  hoy: "Hoy",
  manana: "Mañana",
  semana: "Esta semana",
  adelante: "Más adelante",
  sin_fecha: "Sin fecha",
};

export const TAREA_BUCKET_ORDER: TareaBucket[] = [
  "vencidas",
  "hoy",
  "manana",
  "semana",
  "adelante",
  "sin_fecha",
];

export interface TareaLike {
  /** ISO string o null (sin fecha). */
  dueAt: string | null;
}

export interface TareaBoundaries {
  /** YYYY-MM-DD en Chile. */
  today: string;
  tomorrow: string;
  /** Fin de la ventana "esta semana" = hoy + 7 días (rolling). */
  weekEnd: string;
}

/** Límites de día en TZ Chile a partir de `now`. `addDaysChile` normaliza al
 *  inicio de día Chile internamente, así que se parte de `now` directo. */
export function computeBoundaries(now: Date = new Date()): TareaBoundaries {
  return {
    today: todayInChile(now),
    tomorrow: ymdInChile(addDaysChile(now, 1)),
    weekEnd: ymdInChile(addDaysChile(now, 7)),
  };
}

/** Bucket de un YMD (o null) dado los límites. Comparación lexicográfica de YMD. */
export function bucketForDueYmd(dueYmd: string | null, b: TareaBoundaries): TareaBucket {
  if (!dueYmd) return "sin_fecha";
  if (dueYmd < b.today) return "vencidas";
  if (dueYmd === b.today) return "hoy";
  if (dueYmd === b.tomorrow) return "manana";
  if (dueYmd <= b.weekEnd) return "semana";
  return "adelante";
}

export interface TareaGroup<T> {
  bucket: TareaBucket;
  label: string;
  tasks: T[];
}

/**
 * Agrupa tareas por vencimiento en el orden canónico, omitiendo grupos vacíos.
 * `now` inyectable para tests deterministas.
 */
export function groupTasksByDue<T extends TareaLike>(
  tasks: T[],
  now: Date = new Date(),
): TareaGroup<T>[] {
  const b = computeBoundaries(now);
  const byBucket = new Map<TareaBucket, T[]>();
  for (const t of tasks) {
    const dueYmd = t.dueAt ? ymdInChile(new Date(t.dueAt)) : null;
    const bucket = bucketForDueYmd(dueYmd, b);
    const list = byBucket.get(bucket) ?? [];
    list.push(t);
    byBucket.set(bucket, list);
  }
  return TAREA_BUCKET_ORDER.map((bucket) => ({
    bucket,
    label: TAREA_BUCKET_LABELS[bucket],
    tasks: byBucket.get(bucket) ?? [],
  })).filter((g) => g.tasks.length > 0);
}
