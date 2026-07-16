import { endOfIsoWeekUTC, parseWeekKey } from "./week-keys";
import { ymd } from "./cell-occurrences";

export type ClientReturnRange = { from: string; to: string };

/** Rango yyyy-MM-dd (lunes…domingo) que cubre las bucketKeys dadas. */
export function rangeFromBucketKeys(
  keys: string[],
): ClientReturnRange | undefined {
  const dates = [...new Set(keys.filter(Boolean))]
    .map(parseWeekKey)
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return undefined;
  return {
    from: ymd(dates[0]),
    to: ymd(endOfIsoWeekUTC(dates[dates.length - 1])),
  };
}
