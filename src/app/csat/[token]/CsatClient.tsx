"use client";

import { useCallback, useEffect, useState } from "react";

interface PublicTicketSummary {
  code: string;
  title: string;
  status: string;
  resolvedAt: string | null;
  closedAt: string | null;
  alreadySubmitted: boolean;
  existingRating: number | null;
}

const RATING_LABELS = [
  "Muy malo",
  "Malo",
  "Aceptable",
  "Bueno",
  "Excelente",
];

export default function CsatClient({ token }: { token: string }) {
  const [data, setData] = useState<PublicTicketSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/csat/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (res.status === 410) setError("Este enlace expiró.");
        else if (res.status === 404) setError("Enlace inválido.");
        else setError(json.error ?? "No se pudo cargar el formulario.");
        return;
      }
      const d = json.data as PublicTicketSummary;
      setData(d);
      if (d.alreadySubmitted && d.existingRating != null) {
        setRating(d.existingRating);
        setDone(true);
      }
    } catch {
      setError("No se pudo cargar el formulario.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    if (rating == null) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/csat/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "No se pudo enviar tu calificación.");
        return;
      }
      setDone(true);
    } catch {
      setError("No se pudo enviar tu calificación.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100svh] bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
        <div className="text-center space-y-1.5">
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            ¿Cómo fue tu experiencia?
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Tu opinión nos ayuda a mejorar el servicio.
          </p>
        </div>

        <div className="mt-5">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              Cargando…
            </p>
          ) : error ? (
            <div className="rounded-lg border border-status-danger-border bg-status-danger-soft p-3 text-center text-[13px] text-status-danger-fg">
              {error}
            </div>
          ) : !data ? null : (
            <>
              <div className="rounded-lg border border-border bg-background p-3 mb-4">
                <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  Ticket
                </p>
                <p className="mt-0.5 text-sm font-medium">
                  <span className="font-mono text-muted-foreground">
                    {data.code}
                  </span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  <span>{data.title}</span>
                </p>
              </div>

              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = rating != null && n <= rating;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={submitting || done}
                      onClick={() => setRating(n)}
                      className={`h-12 w-12 rounded-full text-2xl transition-all ${
                        active
                          ? "bg-status-warn-soft text-status-warn-fg scale-110"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                      aria-label={`${n} de 5 — ${RATING_LABELS[n - 1]}`}
                      title={RATING_LABELS[n - 1]}
                    >
                      ★
                    </button>
                  );
                })}
              </div>
              {rating != null && (
                <p className="mt-2 text-center text-[13px] text-muted-foreground">
                  {RATING_LABELS[rating - 1]}
                </p>
              )}

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={submitting || done}
                placeholder="Cuéntanos algo más (opcional)…"
                rows={3}
                maxLength={2000}
                className="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
              />

              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  type="button"
                  disabled={rating == null || submitting || done}
                  onClick={handleSubmit}
                  className="h-11 w-full rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-colors disabled:opacity-50 hover:opacity-90"
                >
                  {done
                    ? "¡Gracias por tu calificación!"
                    : submitting
                      ? "Enviando…"
                      : "Enviar calificación"}
                </button>
                {done && (
                  <p className="text-[12px] text-muted-foreground text-center">
                    Si quieres modificar tu respuesta, vuelve a calificar y
                    presiona enviar.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
