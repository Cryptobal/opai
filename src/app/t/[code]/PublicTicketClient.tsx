"use client";

import { useState } from "react";

interface PublicTicketView {
  code: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  slaDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  comments: Array<{ id: string; body: string; createdAt: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pendiente de aprobación",
  open: "Abierto",
  in_progress: "En proceso",
  waiting: "En espera",
  resolved: "Resuelto",
  closed: "Cerrado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

const PRIORITY_LABELS: Record<string, string> = {
  p1: "Crítica",
  p2: "Alta",
  p3: "Normal",
  p4: "Baja",
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PublicTicketClient({ code }: { code: string }) {
  const [pin, setPin] = useState("");
  const [data, setData] = useState<PublicTicketView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!/^\d{4,6}$/.test(pin)) {
      setError("El PIN debe tener entre 4 y 6 dígitos.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public-tickets/${encodeURIComponent(code)}?pin=${encodeURIComponent(pin)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "No se pudo acceder al ticket.");
        return;
      }
      setData(json.data as PublicTicketView);
    } catch {
      setError("No se pudo acceder al ticket.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100svh] bg-background flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl space-y-4">
        <header className="space-y-1 text-center sm:text-left">
          <p className="text-[12px] font-mono uppercase tracking-wide text-muted-foreground">
            {code}
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            Estado de tu solicitud
          </h1>
        </header>

        {!data ? (
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3">
            <p className="text-[13px] text-muted-foreground">
              Ingresa el PIN que te compartió tu contacto para ver el estado y
              últimas novedades del ticket. No se requiere crear cuenta.
            </p>
            <div>
              <label className="block text-[12px] uppercase tracking-wide text-muted-foreground mb-1">
                PIN de acceso
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="h-12 w-full rounded-lg border border-border bg-background px-3 text-center text-lg tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
              />
            </div>
            {error && (
              <p className="rounded-md border border-status-danger-border bg-status-danger-soft p-2 text-center text-[13px] text-status-danger-fg">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || pin.length < 4}
              className="h-11 w-full rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-colors"
            >
              {loading ? "Verificando…" : "Ver ticket"}
            </button>
          </div>
        ) : (
          <article className="space-y-3">
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3">
              <h2 className="text-base sm:text-lg font-semibold leading-snug">
                {data.title}
              </h2>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <Field label="Estado" value={STATUS_LABELS[data.status] ?? data.status} />
                <Field label="Prioridad" value={PRIORITY_LABELS[data.priority] ?? data.priority.toUpperCase()} />
                <Field label="Creado" value={fmtDate(data.createdAt)} />
                <Field label="Vence (SLA)" value={fmtDate(data.slaDueAt)} />
                {data.resolvedAt && (
                  <Field label="Resuelto" value={fmtDate(data.resolvedAt)} />
                )}
                {data.closedAt && (
                  <Field label="Cerrado" value={fmtDate(data.closedAt)} />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3">
              <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
                Actualizaciones
              </p>
              {data.comments.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Aún no hay actualizaciones.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.comments.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg border border-border/60 bg-background/40 p-3"
                    >
                      <p className="text-[12px] text-muted-foreground">
                        {fmtDate(c.createdAt)}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap">
                        {c.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        )}
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-[13px] font-medium">{value}</p>
    </div>
  );
}
