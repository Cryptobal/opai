export type MigrationPhase = "persona" | "operacional" | "done";

export type ParsedCursor = {
  phase: MigrationPhase;
  afterId: string | null;
};

export function parseCursor(raw: string | null | undefined): ParsedCursor {
  if (!raw) return { phase: "persona", afterId: null };
  if (raw === "done") return { phase: "done", afterId: null };
  const [phase, afterId] = raw.split(":", 2);
  if (phase === "persona" || phase === "operacional") {
    return { phase, afterId: afterId || null };
  }
  return { phase: "persona", afterId: null };
}

export function formatCursor(phase: MigrationPhase, afterId: string | null): string {
  if (phase === "done") return "done";
  return afterId ? `${phase}:${afterId}` : phase;
}
