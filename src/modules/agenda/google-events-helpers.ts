export function isoFromEventDate(dt?: { dateTime?: string | null; date?: string | null } | null) {
  if (dt?.dateTime) return { iso: dt.dateTime, allDay: false };
  if (dt?.date) return { iso: `${dt.date}T00:00:00`, allDay: true };
  return null;
}

export function isInsufficientScopeError(err: unknown): boolean {
  const e = err as {
    code?: number;
    status?: number;
    message?: string;
    errors?: { reason?: string }[];
  };
  const code = e?.code ?? e?.status;
  const msg = String(e?.message ?? "").toLowerCase();
  const reason = e?.errors?.[0]?.reason ?? "";
  return (
    code === 403 &&
    (msg.includes("insufficient") ||
      msg.includes("accessnotconfigured") ||
      reason === "insufficientPermissions" ||
      reason === "accessNotConfigured")
  );
}
