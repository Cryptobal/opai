export type SignerProgressKind = "signed" | "declined" | "pending" | "waiting";

export function recipientProgressKind(
  r: { status: string; signingOrder: number },
  all: Array<{ status: string; signingOrder: number }>,
  sequential: boolean,
): SignerProgressKind {
  if (r.status === "signed") return "signed";
  if (r.status === "declined") return "declined";
  if (!sequential) return "pending";
  const open = all.filter((s) => s.status !== "signed" && s.status !== "declined");
  if (open.length === 0) return "pending";
  const dueOrder = Math.min(...open.map((s) => s.signingOrder));
  return r.signingOrder === dueOrder ? "pending" : "waiting";
}

export function readCampaignKpis(totals: unknown) {
  const t = totals && typeof totals === "object" ? (totals as Record<string, number>) : {};
  return {
    sent: t.sent ?? 0,
    skipped: t.skipped ?? 0,
    error: t.error ?? 0,
    pending: (t.pending ?? 0) + (t.processing ?? 0),
  };
}

export function sumCampaignKpis(campaigns: Array<{ totals: unknown }>) {
  return campaigns.reduce(
    (acc, c) => {
      const k = readCampaignKpis(c.totals);
      acc.sent += k.sent;
      acc.skipped += k.skipped;
      acc.error += k.error;
      acc.pending += k.pending;
      return acc;
    },
    { sent: 0, skipped: 0, error: 0, pending: 0 },
  );
}
