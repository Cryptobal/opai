import { prisma } from "@/lib/prisma";
import { todayChileStr } from "@/lib/fx-date";

const CMF_BASE = "https://api.cmfchile.cl/api-sbifv3/recursos_api";
const MINDICADOR_BASE = "https://mindicador.cl/api";

type UfData = { value: number; date: string };
type UtmData = { value: number; month: string };

type FxSource = "CMF" | "mindicador.cl";

/**
 * Parsea valor CMF "39.703,49" -> 39703.49
 */
function parseCmfValue(raw: string): number {
  const cleaned = raw.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

/**
 * Extrae YYYY-MM-DD de un ISO string respetando la zona entregada por la API
 * (mindicador.cl usa offsets como `T04:00:00.000Z` que corresponden a la
 * fecha Chile). Tomamos los primeros 10 chars para no perder el día por zona.
 */
function isoToDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

async function fetchJsonWithLogging(
  url: string,
  label: string,
): Promise<{ status: number; ok: boolean; body: string; parsed: unknown | null }> {
  // `cache: "no-store"` para que Vercel no intercepte con runtime cache.
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (error) {
    console.warn(`[fx-sync] ${label} fetch threw:`, error);
    return { status: 0, ok: false, body: "", parsed: null };
  }
  const body = await res.text().catch(() => "");
  let parsed: unknown | null = null;
  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      // Algunos proxies devuelven HTML en errores; lo reportamos sin romper.
      parsed = null;
    }
  }
  if (!res.ok) {
    console.warn(
      `[fx-sync] ${label} non-OK ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return { status: res.status, ok: res.ok, body, parsed };
}

// ── CMF (fuente oficial, requiere API key) ─────────────────────────────

export async function fetchUfFromCmfForDate(dateStr: string): Promise<UfData | null> {
  const cmfApiKey = process.env.CMF_API_KEY;
  if (!cmfApiKey) {
    console.warn("[fx-sync] CMF_API_KEY no configurada, saltando CMF para UF");
    return null;
  }

  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return null;

  const url = `${CMF_BASE}/uf/${year}/${month}/dias/${day}?apikey=${cmfApiKey}&formato=json`;
  const { ok, parsed, body, status } = await fetchJsonWithLogging(
    url,
    `CMF UF ${dateStr}`,
  );
  if (!ok || !parsed) return null;

  const uf = (parsed as { UFs?: Array<{ Valor?: string; Fecha?: string }> })?.UFs?.[0];
  if (!uf?.Valor || !uf?.Fecha) {
    console.warn(
      `[fx-sync] CMF UF ${dateStr} payload sin UFs[0] (status=${status} body=${body.slice(0, 120)})`,
    );
    return null;
  }

  const value = parseCmfValue(uf.Valor);
  if (Number.isNaN(value)) return null;

  return { value, date: uf.Fecha };
}

/**
 * Intenta UF de la fecha pedida; sin fecha intenta hoy Chile y luego ayer.
 */
export async function fetchUfFromCmf(dateStr?: string): Promise<UfData | null> {
  const target = dateStr ?? todayChileStr();
  const uf = await fetchUfFromCmfForDate(target);
  if (uf) return uf;
  if (dateStr) return null;

  const fallbackDate = new Date(`${target}T12:00:00Z`);
  fallbackDate.setUTCDate(fallbackDate.getUTCDate() - 1);
  const yesterday = fallbackDate.toISOString().slice(0, 10);
  return fetchUfFromCmfForDate(yesterday);
}

export async function fetchUtmFromCmf(): Promise<UtmData | null> {
  const cmfApiKey = process.env.CMF_API_KEY;
  if (!cmfApiKey) {
    console.warn("[fx-sync] CMF_API_KEY no configurada, saltando CMF para UTM");
    return null;
  }

  const url = `${CMF_BASE}/utm?apikey=${cmfApiKey}&formato=json`;
  const { ok, parsed, body, status } = await fetchJsonWithLogging(url, "CMF UTM");
  if (!ok || !parsed) return null;

  const utm = (parsed as { UTMs?: Array<{ Valor?: string; Fecha?: string }> })?.UTMs?.[0];
  if (!utm?.Valor || !utm?.Fecha) {
    console.warn(
      `[fx-sync] CMF UTM payload sin UTMs[0] (status=${status} body=${body.slice(0, 120)})`,
    );
    return null;
  }

  const value = parseCmfValue(utm.Valor);
  if (Number.isNaN(value)) return null;

  return { value, month: `${utm.Fecha.slice(0, 7)}-01` };
}

// ── mindicador.cl (fallback sin API key) ───────────────────────────────

/**
 * Fallback a mindicador.cl — API pública chilena gratuita. Se usa cuando
 * CMF falla (por ejemplo bloqueo por IP desde Vercel Brasil). Para una fecha
 * específica busca en la serie histórica del mes; sin fecha devuelve la
 * última disponible.
 */
export async function fetchUfFromMindicador(dateStr?: string): Promise<UfData | null> {
  const target = dateStr ?? todayChileStr();
  // Endpoint `/api/uf` trae últimos ~30 días. Para otra fecha usamos
  // `/api/uf/dd-mm-yyyy` (formato del API).
  let url: string;
  if (dateStr) {
    const [y, m, d] = dateStr.split("-");
    if (!y || !m || !d) return null;
    url = `${MINDICADOR_BASE}/uf/${d}-${m}-${y}`;
  } else {
    url = `${MINDICADOR_BASE}/uf`;
  }
  const { ok, parsed, status, body } = await fetchJsonWithLogging(
    url,
    `mindicador UF ${dateStr ?? "hoy"}`,
  );
  if (!ok || !parsed) return null;

  const serie = (parsed as { serie?: Array<{ fecha?: string; valor?: number }> })?.serie ?? [];
  // Priorizamos la entrada exacta del target; si no, la primera (más reciente).
  const match = serie.find((s) => s.fecha && isoToDateOnly(s.fecha) === target) ?? serie[0];
  if (!match?.fecha || typeof match.valor !== "number") {
    console.warn(
      `[fx-sync] mindicador UF sin serie (status=${status} body=${body.slice(0, 120)})`,
    );
    return null;
  }
  return { value: match.valor, date: isoToDateOnly(match.fecha) };
}

export async function fetchUtmFromMindicador(): Promise<UtmData | null> {
  const url = `${MINDICADOR_BASE}/utm`;
  const { ok, parsed, status, body } = await fetchJsonWithLogging(url, "mindicador UTM");
  if (!ok || !parsed) return null;

  const serie = (parsed as { serie?: Array<{ fecha?: string; valor?: number }> })?.serie ?? [];
  const latest = serie[0];
  if (!latest?.fecha || typeof latest.valor !== "number") {
    console.warn(
      `[fx-sync] mindicador UTM sin serie (status=${status} body=${body.slice(0, 120)})`,
    );
    return null;
  }
  const month = `${isoToDateOnly(latest.fecha).slice(0, 7)}-01`;
  return { value: latest.valor, month };
}

// ── Wrappers que prueban CMF primero y caen a mindicador.cl ────────────

/**
 * Obtiene UF probando CMF primero y, si falla, mindicador.cl como fallback.
 * Devuelve también la fuente utilizada para poder loggear/persistir.
 */
export async function fetchUfBestEffort(
  dateStr?: string,
): Promise<{ data: UfData; source: FxSource } | null> {
  const fromCmf = await fetchUfFromCmf(dateStr);
  if (fromCmf) return { data: fromCmf, source: "CMF" };
  const fromMindicador = await fetchUfFromMindicador(dateStr);
  if (fromMindicador) return { data: fromMindicador, source: "mindicador.cl" };
  return null;
}

export async function fetchUtmBestEffort(): Promise<{
  data: UtmData;
  source: FxSource;
} | null> {
  const fromCmf = await fetchUtmFromCmf();
  if (fromCmf) return { data: fromCmf, source: "CMF" };
  const fromMindicador = await fetchUtmFromMindicador();
  if (fromMindicador) return { data: fromMindicador, source: "mindicador.cl" };
  return null;
}

export async function upsertUfRate(
  uf: UfData,
  source: FxSource = "CMF",
): Promise<void> {
  const dateObj = toUtcDate(uf.date);
  await prisma.fxUfRate.upsert({
    where: { date: dateObj },
    update: {
      value: uf.value,
      fetchedAt: new Date(),
      source,
    },
    create: {
      date: dateObj,
      value: uf.value,
      fetchedAt: new Date(),
      source,
    },
  });
}

export async function upsertUtmRate(
  utm: UtmData,
  source: FxSource = "CMF",
): Promise<void> {
  const monthObj = toUtcDate(utm.month);
  await prisma.fxUtmRate.upsert({
    where: { month: monthObj },
    update: {
      value: utm.value,
      fetchedAt: new Date(),
      source,
    },
    create: {
      month: monthObj,
      value: utm.value,
      fetchedAt: new Date(),
      source,
    },
  });
}

/**
 * Asegura que exista UF de hoy y UTM del mes vigente.
 *
 * Si falta alguno, intenta traerlo desde CMF y, si CMF falla (p.ej. bloqueo
 * por IP desde Vercel), cae a mindicador.cl (API pública sin key).
 *
 * Nota: ya no exigimos `CMF_API_KEY` para ejecutar — podemos operar sólo
 * con el fallback si así lo requiere el entorno.
 */
export async function ensureCurrentFxRates(): Promise<{
  ufSynced: boolean;
  utmSynced: boolean;
  ufSource?: FxSource;
  utmSource?: FxSource;
}> {
  const todayStr = todayChileStr();
  const todayDate = toUtcDate(todayStr);
  const currentMonth = toUtcDate(`${todayStr.slice(0, 7)}-01`);

  let ufSynced = false;
  let utmSynced = false;
  let ufSource: FxSource | undefined;
  let utmSource: FxSource | undefined;

  const [ufToday, utmMonth] = await Promise.all([
    prisma.fxUfRate.findUnique({ where: { date: todayDate } }),
    prisma.fxUtmRate.findUnique({ where: { month: currentMonth } }),
  ]);

  if (!ufToday) {
    const uf = await fetchUfBestEffort(todayStr);
    if (uf) {
      await upsertUfRate(uf.data, uf.source);
      ufSynced = true;
      ufSource = uf.source;
    } else {
      console.warn("[fx-sync] ensureCurrentFxRates: UF no disponible ni en CMF ni en mindicador.cl");
    }
  }

  if (!utmMonth) {
    const utm = await fetchUtmBestEffort();
    if (utm) {
      await upsertUtmRate(utm.data, utm.source);
      utmSynced = true;
      utmSource = utm.source;
    } else {
      console.warn("[fx-sync] ensureCurrentFxRates: UTM no disponible ni en CMF ni en mindicador.cl");
    }
  }

  return { ufSynced, utmSynced, ufSource, utmSource };
}

/**
 * Fuerza la sincronización ignorando el caché en BD. Útil para el botón de
 * "Actualizar" en la UI o para invocar manualmente el cron. A diferencia de
 * `ensureCurrentFxRates`, siempre re-consulta la fuente y upsertea si hay dato.
 */
export async function forceRefreshFxRates(dateParam?: string): Promise<{
  uf: {
    status: "ok" | "no_data" | "error";
    value?: number;
    date?: string;
    source?: FxSource;
    message?: string;
  };
  utm: {
    status: "ok" | "no_data" | "error";
    value?: number;
    month?: string;
    source?: FxSource;
    message?: string;
  };
}> {
  const result: Awaited<ReturnType<typeof forceRefreshFxRates>> = {
    uf: { status: "no_data" },
    utm: { status: "no_data" },
  };

  try {
    const uf = await fetchUfBestEffort(dateParam);
    if (uf) {
      await upsertUfRate(uf.data, uf.source);
      result.uf = {
        status: "ok",
        value: uf.data.value,
        date: uf.data.date,
        source: uf.source,
      };
    }
  } catch (error) {
    console.error("[fx-sync] forceRefreshFxRates UF error:", error);
    result.uf = { status: "error", message: String(error) };
  }

  try {
    const utm = await fetchUtmBestEffort();
    if (utm) {
      await upsertUtmRate(utm.data, utm.source);
      result.utm = {
        status: "ok",
        value: utm.data.value,
        month: utm.data.month,
        source: utm.source,
      };
    }
  } catch (error) {
    console.error("[fx-sync] forceRefreshFxRates UTM error:", error);
    result.utm = { status: "error", message: String(error) };
  }

  return result;
}

/**
 * @deprecated usar `forceRefreshFxRates`. Mantenido por compatibilidad con el
 * cron `/api/fx/sync` pre-existente.
 */
export async function syncFxRates(dateParam?: string) {
  const forced = await forceRefreshFxRates(dateParam);
  return {
    uf: {
      status: forced.uf.status,
      value: forced.uf.value,
      date: forced.uf.date,
      message: forced.uf.message,
    },
    utm: {
      status: forced.utm.status,
      value: forced.utm.value,
      month: forced.utm.month,
      message: forced.utm.message,
    },
  };
}
