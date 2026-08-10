/**
 * Aging dual de cartera: por emisión y por vencimiento.
 * Puro — sin Prisma / server-only.
 */

export interface AgingBuckets {
  alDia: number;
  d1_15: number;
  d16_30: number;
  d30plus: number;
}

export interface AgingResult {
  byIssue: AgingBuckets;
  byDue: AgingBuckets;
  totalClp: number;
  overdueClp: number;
  overduePct: number;
  count: number;
}

export interface AgingItem {
  issueYmd: string;
  dueYmd: string;
  pendingClp: number;
  ceded: boolean;
}

function emptyBuckets(): AgingBuckets {
  return { alDia: 0, d1_15: 0, d16_30: 0, d30plus: 0 };
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function bucketInto(buckets: AgingBuckets, days: number, amount: number): void {
  const a = Math.round(amount);
  if (days <= 0) buckets.alDia += a;
  else if (days <= 15) buckets.d1_15 += a;
  else if (days <= 30) buckets.d16_30 += a;
  else buckets.d30plus += a;
}

/**
 * Construye aging por emisión y por vencimiento.
 * Las cedidas se excluyen de ambos buckets y del total cobrable.
 * `alDia` / vigente = aún no vencida (días ≤ 0).
 */
export function buildAging(items: AgingItem[], todayYmd: string): AgingResult {
  const byIssue = emptyBuckets();
  const byDue = emptyBuckets();
  let totalClp = 0;
  let overdueClp = 0;
  let count = 0;

  for (const item of items) {
    if (item.ceded) continue;
    if (item.pendingClp <= 0) continue;
    const pending = Math.round(item.pendingClp);
    totalClp += pending;
    count += 1;

    const daysIssue = daysBetween(item.issueYmd, todayYmd);
    bucketInto(byIssue, daysIssue, pending);

    const daysDue = daysBetween(item.dueYmd, todayYmd);
    bucketInto(byDue, daysDue, pending);
    if (daysDue > 0) overdueClp += pending;
  }

  const overduePct =
    totalClp > 0 ? Math.round((overdueClp / totalClp) * 100) : 0;

  return {
    byIssue,
    byDue,
    totalClp: Math.round(totalClp),
    overdueClp: Math.round(overdueClp),
    overduePct,
    count,
  };
}
