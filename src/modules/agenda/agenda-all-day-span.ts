import { utcDateFromYmd, ymdInChile } from "@/lib/dates-cl";

/** Campos de banda all-day multi-día para la capa de presentación. */
export type AllDaySpanFields = {
  spanKey: string;
  spanStartYmd: string;
  spanEndYmd: string;
};

function addDaysYmd(ymd: string, days: number): string {
  const d = utcDateFromYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Span inclusivo Chile para un evento all-day OPAI (endAt = 23:59 del último día).
 * Un solo día → null (el chip no necesita banda).
 */
export function allDaySpanFromBounds(params: {
  id: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
}): AllDaySpanFields | null {
  if (!params.allDay) return null;
  const spanStartYmd = ymdInChile(params.startAt);
  const spanEndYmd = ymdInChile(params.endAt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spanStartYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(spanEndYmd)) {
    return null;
  }
  if (spanEndYmd <= spanStartYmd) return null;
  return {
    spanKey: params.id,
    spanStartYmd,
    spanEndYmd,
  };
}

/**
 * Google all-day usa `end.date` exclusivo. Devuelve span inclusivo para la UI.
 * Un solo día → null.
 */
export function allDaySpanFromGoogleDates(params: {
  id: string;
  startYmd: string;
  endExclusiveYmd: string;
}): AllDaySpanFields | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.startYmd)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.endExclusiveYmd)) return null;
  const spanEndYmd = addDaysYmd(params.endExclusiveYmd, -1);
  if (spanEndYmd <= params.startYmd) return null;
  return {
    spanKey: params.id,
    spanStartYmd: params.startYmd,
    spanEndYmd,
  };
}
