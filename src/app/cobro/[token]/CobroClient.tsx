"use client";

import { useState, type ReactNode } from "react";
import type { CobroView } from "@/modules/finance/billing/cobro-confirmation.service";

const PORTAL_URL = "/portal/cliente";

export default function CobroClient({
  token,
  initialView,
}: {
  token: string;
  initialView: CobroView;
}) {
  const [view, setView] = useState<CobroView>(initialView);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oc, setOc] = useState("");
  const [extraRef, setExtraRef] = useState("");
  const [email, setEmail] = useState("");
  const [showObserve, setShowObserve] = useState(false);
  const [comment, setComment] = useState("");

  const primary = view.branding.primaryColor;
  const docLabel = view.variant === "PROFORMA" ? "proforma" : "estado de pago";
  const pillLabel = view.variant === "PROFORMA" ? "Proforma" : "Estado de pago";
  const actionable =
    !view.alreadyIssued &&
    !view.expired &&
    (view.status === "SENT" || view.status === "VIEWED");

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/cobro/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, actorEmail: email.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.view) {
        setError(json.error ?? "No se pudo completar la acción.");
        return;
      }
      setView(json.view as CobroView);
      setShowObserve(false);
      setComment("");
      setOc("");
      setExtraRef("");
    } catch {
      setError("No se pudo completar la acción. Revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-ds-md border border-ds-border-default bg-ds-surface-1 px-3 py-2.5 text-sm text-ds-text-1 placeholder:text-ds-text-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-60";

  return (
    <main className="min-h-[100svh] bg-ds-surface-1 flex justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-4">
        {/* Header branding */}
        <header className="flex items-center gap-3 pt-2">
          {view.branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.branding.logoUrl} alt={view.branding.brandName} className="h-8 w-auto" />
          ) : (
            <span className="text-base font-semibold text-ds-text-1">
              {view.branding.brandName}
            </span>
          )}
        </header>

        <section className="rounded-ds-lg border border-ds-border-default bg-ds-surface-2 p-5 sm:p-6 shadow-sm">
          <span
            className="inline-block rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: `${primary}14`, color: primary }}
          >
            {pillLabel}
          </span>

          <h1 className="mt-3 text-lg font-semibold text-ds-text-1">
            {view.emisor.razonSocial}
          </h1>
          <p className="text-sm text-ds-text-3">
            Para {view.receptor.nombre}
            {view.periodo ? ` · ${view.periodo}` : ""}
          </p>

          {/* Resumen */}
          <dl className="mt-4 space-y-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface-1 p-4 text-sm">
            <Row label="Fecha" value={view.fecha} />
            <Row label="Neto" value={view.neto} />
            <Row label="IVA" value={view.iva} />
            <div className="flex items-center justify-between border-t border-ds-border-subtle pt-2">
              <dt className="font-semibold text-ds-text-1">Total</dt>
              <dd className="text-base font-bold" style={{ color: primary }}>
                {view.total}
              </dd>
            </div>
          </dl>

          <a
            href={`/api/public/cobro/${encodeURIComponent(token)}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline"
            style={{ color: primary }}
          >
            Ver PDF de la {docLabel}
          </a>

          {view.references.length > 0 ? (
            <ul className="mt-4 space-y-1">
              {view.references.map((r, i) => (
                <li
                  key={`${r.tipoDocRef}-${r.folioRef}-${i}`}
                  className="flex items-center gap-2 text-sm text-status-ok-fg"
                >
                  <span aria-hidden>✓</span>
                  <span>
                    {r.tipoDocRef === "801" ? "OC" : r.tipoDocRef} N° {r.folioRef}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-ds-md border border-status-danger-border bg-status-danger-soft px-3 py-2 text-sm text-status-danger-fg">
              {error}
            </p>
          ) : null}

          {/* ── Estados ── */}
          {view.alreadyIssued ? (
            <Banner tone="ok">
              Este documento ya fue facturado{view.folio ? ` (N° ${view.folio})` : ""}.
            </Banner>
          ) : view.status === "APPROVED" ? (
            <div className="mt-5 space-y-4">
              <Banner tone="ok">
                ¡Listo! Aprobaste esta {docLabel}. Registramos la confirmación.
              </Banner>
              <AddOcBlock
                inputCls={inputCls}
                oc={oc}
                setOc={setOc}
                busy={busy}
                primary={primary}
                onAdd={() => post({ action: "add_reference", ocFolio: oc.trim() || undefined })}
              />
            </div>
          ) : view.status === "REJECTED" ? (
            <Banner tone="warn">
              Recibimos tu solicitud de corrección. Nuestro equipo te contactará a la brevedad.
            </Banner>
          ) : actionable ? (
            <div className="mt-5 space-y-3">
              <div className="space-y-1">
                <label htmlFor="oc" className="text-xs font-medium text-ds-text-2">
                  N° de orden de compra (opcional)
                </label>
                <input
                  id="oc"
                  inputMode="numeric"
                  value={oc}
                  onChange={(e) => setOc(e.target.value)}
                  disabled={busy}
                  placeholder="Ej: 4500123456"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="ref" className="text-xs font-medium text-ds-text-2">
                  Otra referencia (opcional)
                </label>
                <input
                  id="ref"
                  value={extraRef}
                  onChange={(e) => setExtraRef(e.target.value)}
                  disabled={busy}
                  placeholder="HES, contrato, etc."
                  className={inputCls}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="email" className="text-xs font-medium text-ds-text-2">
                  Tu correo (opcional)
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  placeholder="tu@empresa.cl"
                  className={inputCls}
                />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  post({
                    action: "approve",
                    ocFolio: oc.trim() || undefined,
                    extraRef: extraRef.trim() || undefined,
                  })
                }
                className="min-h-[44px] w-full rounded-ds-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: primary }}
              >
                {busy ? "Enviando…" : `Aprobar ${docLabel}`}
              </button>

              {!showObserve ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowObserve(true)}
                  className="min-h-[44px] w-full text-sm font-medium text-ds-text-2 underline underline-offset-2 disabled:opacity-50"
                >
                  Solicitar corrección…
                </button>
              ) : (
                <div className="space-y-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface-1 p-3">
                  <label htmlFor="obs" className="text-xs font-medium text-ds-text-2">
                    ¿Qué necesitas corregir?
                  </label>
                  <textarea
                    id="obs"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    disabled={busy}
                    rows={3}
                    maxLength={2000}
                    className={inputCls}
                    placeholder="Cuéntanos el detalle a corregir…"
                  />
                  <button
                    type="button"
                    disabled={busy || comment.trim().length === 0}
                    onClick={() => post({ action: "reject", comment: comment.trim() })}
                    className="min-h-[44px] w-full rounded-ds-md border border-status-danger-border bg-status-danger-soft text-sm font-semibold text-status-danger-fg disabled:opacity-50"
                  >
                    Enviar solicitud de corrección
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* Línea de confianza */}
          <p className="mt-5 text-xs leading-relaxed text-ds-text-4">
            Enlace exclusivo para {view.receptor.nombre} · válido 90 días ·{" "}
            {view.branding.brandName} registra la fecha y el correo de quien confirma.
          </p>
        </section>

        <a
          href={PORTAL_URL}
          className="block pb-4 text-center text-sm text-ds-text-3 underline underline-offset-2"
        >
          Entrar al portal de clientes →
        </a>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ds-text-3">{label}</dt>
      <dd className="text-ds-text-1">{value}</dd>
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn"; children: ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
      : "border-status-warn-border bg-status-warn-soft text-status-warn-fg";
  return (
    <div className={`mt-5 rounded-ds-md border px-3 py-2.5 text-sm ${cls}`}>{children}</div>
  );
}

function AddOcBlock({
  inputCls,
  oc,
  setOc,
  busy,
  primary,
  onAdd,
}: {
  inputCls: string;
  oc: string;
  setOc: (v: string) => void;
  busy: boolean;
  primary: string;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor="oc-after" className="text-xs font-medium text-ds-text-2">
        ¿Ya tienes el N° de OC? Agrégalo aquí
      </label>
      <div className="flex gap-2">
        <input
          id="oc-after"
          inputMode="numeric"
          value={oc}
          onChange={(e) => setOc(e.target.value)}
          disabled={busy}
          placeholder="Ej: 4500123456"
          className={inputCls}
        />
        <button
          type="button"
          disabled={busy || oc.trim().length === 0}
          onClick={onAdd}
          className="min-h-[44px] shrink-0 rounded-ds-md px-4 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: primary }}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
