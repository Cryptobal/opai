import type { ProjectionBucket } from "@/modules/finance/cashflow/types";

const fmtFull = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return fmtFull.format(n);
}

export function getTriplet(buckets: ProjectionBucket[], activeKey: string | null) {
  const idx = buckets.findIndex((b) => b.key === activeKey);
  if (idx < 0) return { prev: null, active: null, next: null, activeIdx: -1 };
  return {
    prev: idx > 0 ? buckets[idx - 1] : null,
    active: buckets[idx],
    next: idx < buckets.length - 1 ? buckets[idx + 1] : null,
    activeIdx: idx,
  };
}

export function findTodayBucketIdx(buckets: ProjectionBucket[]): number {
  const now = Date.now();
  const inside = buckets.findIndex(
    (b) => b.start.getTime() <= now && now <= b.end.getTime(),
  );
  if (inside >= 0) return inside;
  const future = buckets.findIndex((b) => b.start.getTime() >= now);
  return future >= 0 ? future : Math.max(0, buckets.length - 1);
}
