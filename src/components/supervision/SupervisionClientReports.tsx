"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileBarChart } from "lucide-react";
import {
  EmptyState,
  PageHero,
  Spinner,
  Surface,
  Tag,
} from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VisitReportData } from "@/lib/ops/client-report/types";
import { formatDateTimeCl } from "@/lib/ops/client-report/period";

type AccountOpt = {
  id: string;
  name: string;
  installations: { id: string; name: string; commune: string | null }[];
};

type AutoRow = {
  installationId: string;
  installationName: string;
  accountName: string | null;
  frequency: string;
  weekday: number;
  dayOfMonth: number;
  lastPeriodKey: string | null;
};

type Contact = {
  id: string;
  name: string;
  email: string;
  recibeOperacional: boolean;
};

type Preset = "last_week" | "this_week" | "last_month" | "custom";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const selectClass =
  "h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1";

export function SupervisionClientReports() {
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [autos, setAutos] = useState<AutoRow[]>([]);
  const [accountId, setAccountId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [allInstallations, setAllInstallations] = useState(true);
  const [preset, setPreset] = useState<Preset>("last_week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<VisitReportData | null>(null);
  const [periodLabel, setPeriodLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pickedEmails, setPickedEmails] = useState<string[]>([]);
  const [extraEmail, setExtraEmail] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/ops/supervision/reportes/options")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setAccounts(j.data);
      });
    fetch("/api/ops/client-report/enabled")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setAutos(j.data);
      });
  }, []);

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId]
  );

  useEffect(() => {
    if (!account) {
      setSelected([]);
      setContacts([]);
      return;
    }
    setSelected(account.installations.map((i) => i.id));
    setAllInstallations(true);
    fetch(`/api/ops/supervision/reportes/send?accountId=${account.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return;
        const list = j.data as Contact[];
        setContacts(list);
        setPickedEmails(list.filter((c) => c.recibeOperacional).map((c) => c.email));
      });
  }, [account]);

  const installationIds = allInstallations
    ? account?.installations.map((i) => i.id) ?? []
    : selected;

  const loadPreview = useCallback(async () => {
    if (!accountId || installationIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        accountId,
        installationIds: installationIds.join(","),
        preset,
      });
      if (preset === "custom") {
        qs.set("from", from);
        qs.set("to", to);
      }
      const res = await fetch(`/api/ops/supervision/reportes/preview?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "No se pudo generar");
      setPreview(json.data);
      setPeriodLabel(json.period?.label ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, installationIds, preset, from, to]);

  async function downloadPdf() {
    if (!accountId || installationIds.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ops/supervision/reportes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          installationIds,
          preset,
          from: preset === "custom" ? from : undefined,
          to: preset === "custom" ? to : undefined,
        }),
      });
      if (!res.ok) throw new Error("No se pudo generar el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "informe-visitas.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!accountId || pickedEmails.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/supervision/reportes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          installationIds,
          emails: pickedEmails,
          preset,
          from: preset === "custom" ? from : undefined,
          to: preset === "custom" ? to : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "No se pudo enviar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 min-w-0 ds-page-enter">
      <PageHero
        icon={FileBarChart}
        iconTone="emerald"
        title="Reportes para el cliente"
        subtitle="visitas de supervisión"
        description="Genera un informe formal de visitas para enviarlo al cliente. El informe operativo automático se configura en cada instalación."
      />

      <Surface padding="md" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-[13px]">
            <span className="text-ds-text-3">Cliente</span>
            <select
              className={selectClass}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-[13px]">
            <span className="text-ds-text-3">Período</span>
            <select
              className={selectClass}
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
            >
              <option value="last_week">Semana anterior</option>
              <option value="this_week">Esta semana</option>
              <option value="last_month">Mes anterior</option>
              <option value="custom">Rango personalizado</option>
            </select>
          </label>
        </div>

        {preset === "custom" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-[13px]">
              <span className="text-ds-text-3">Desde</span>
              <Input type="date" className="h-10 sm:h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-[13px]">
              <span className="text-ds-text-3">Hasta</span>
              <Input type="date" className="h-10 sm:h-9" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}

        {account && (
          <div className="space-y-2">
            <label className="flex min-h-11 items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={allInstallations}
                onChange={(e) => {
                  setAllInstallations(e.target.checked);
                  if (e.target.checked) {
                    setSelected(account.installations.map((i) => i.id));
                  }
                }}
              />
              Todas las instalaciones del cliente
            </label>
            {!allInstallations && (
              <ul className="grid gap-1 sm:grid-cols-2">
                {account.installations.map((inst) => (
                  <li key={inst.id}>
                    <label className="flex min-h-11 items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={selected.includes(inst.id)}
                        onChange={(e) => {
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, inst.id]
                              : prev.filter((id) => id !== inst.id)
                          );
                        }}
                      />
                      {inst.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-10 sm:h-9"
            disabled={!accountId || loading}
            onClick={() => void loadPreview()}
          >
            Vista previa
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 sm:h-9"
            disabled={!accountId || loading}
            onClick={() => void downloadPdf()}
          >
            Descargar PDF
          </Button>
        </div>
        {error && <p className="text-[13px] text-status-danger-fg">{error}</p>}
      </Surface>

      {loading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {preview && !loading && (
        <Surface padding="md" className="space-y-5">
          <VisitPreviewDocument data={preview} periodLabel={periodLabel} />

          <div className="border-t border-ds-border-subtle pt-4 space-y-3">
            <p className="text-[13px] text-ds-text-2">Enviar a contactos del cliente</p>
            {contacts.length === 0 ? (
              <p className="text-[13px] text-ds-text-3">Este cliente no tiene contactos con email.</p>
            ) : (
              <ul className="space-y-1">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <label className="flex min-h-11 items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={pickedEmails.includes(c.email)}
                        onChange={(e) => {
                          setPickedEmails((prev) =>
                            e.target.checked
                              ? [...prev, c.email]
                              : prev.filter((x) => x !== c.email)
                          );
                        }}
                      />
                      <span>
                        {c.name} · {c.email}
                        {c.recibeOperacional && (
                          <Tag variant="info" size="sm" className="ml-2">
                            operacional
                          </Tag>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                className="h-10 sm:h-9"
                placeholder="Agregar otro email"
                value={extraEmail}
                onChange={(e) => setExtraEmail(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 sm:h-9"
                onClick={() => {
                  const email = extraEmail.trim();
                  if (!email || pickedEmails.includes(email)) return;
                  setPickedEmails((prev) => [...prev, email]);
                  setExtraEmail("");
                }}
              >
                Agregar
              </Button>
            </div>
            <Button
              type="button"
              className="h-10 sm:h-9"
              disabled={sending || pickedEmails.length === 0}
              onClick={() => void send()}
            >
              {sending ? "Enviando…" : "Enviar PDF"}
            </Button>
          </div>
        </Surface>
      )}

      <Surface padding="md" className="space-y-3">
        <h2 className="font-display text-lg">Informes automáticos</h2>
        <p className="text-[13px] text-ds-text-3">
          El digest operativo (asistencia, cobertura, rondas, incidentes QR y visitas) se configura en cada instalación y se envía solo.
        </p>
        {autos.length === 0 ? (
          <EmptyState
            icon={FileBarChart}
            title="Ninguna instalación tiene el envío automático activo"
            description="Ábrelo en la ficha de la instalación, pestaña Reporte cliente."
          />
        ) : (
          <ul className="ds-list-cascade space-y-2">
            {autos.map((row) => (
              <li key={row.installationId}>
                <Link
                  href={`/crm/installations/${row.installationId}?tab=reporte-cliente`}
                  className="flex min-h-11 items-center justify-between rounded-md border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-[13px]"
                >
                  <span>
                    <span className="font-medium">{row.installationName}</span>
                    {row.accountName ? (
                      <span className="text-ds-text-3"> · {row.accountName}</span>
                    ) : null}
                  </span>
                  <span className="text-ds-text-3">
                    {row.frequency === "monthly"
                      ? `Mensual · día ${row.dayOfMonth}`
                      : `Semanal · ${WEEKDAYS[row.weekday] ?? ""}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

function VisitPreviewDocument({
  data,
  periodLabel,
}: {
  data: VisitReportData;
  periodLabel: string | null;
}) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        background: "#ffffff",
        color: "#0f172a",
        padding: "32px",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "2px solid #0f172a",
          paddingBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 100 100" aria-hidden="true">
            <path
              d="M50 5L15 20V50C15 70 30 85 50 95C70 85 85 70 85 50V20L50 5ZM50 10L80 23V50C80 67.5 67.5 80 50 90C32.5 80 20 67.5 20 50V23L50 10Z"
              fill="#0059A3"
            />
            <path
              d="M50 15L25 25V50C25 65 35 75 50 82.5C65 75 75 65 75 50V25L50 15ZM50 85C30 77.5 20 65 20 50V22.5L50 7.5L80 22.5V50C80 65 70 77.5 50 85Z"
              fill="#0059A3"
            />
            <path
              d="M42.5 62.5L30 50L35 45L42.5 52.5L65 30L70 35L42.5 62.5Z"
              fill="#0059A3"
            />
          </svg>
          <div>
            <p style={{ margin: 0, fontWeight: 700, letterSpacing: "0.28em", fontSize: 13 }}>
              GARD
            </p>
            <p style={{ margin: 0, letterSpacing: "0.22em", fontSize: 12, color: "#0f766e" }}>
              SECURITY
            </p>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "#64748b" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>
            Informe de visitas de supervisión
          </p>
          <p style={{ margin: "4px 0 0" }}>{periodLabel ?? data.periodLabel}</p>
        </div>
      </div>
      <h3 style={{ margin: "16px 0 0", fontSize: 20 }}>{data.accountName}</h3>
      {data.installations.map((inst) => (
        <section key={inst.id} style={{ marginTop: 24 }}>
          <h4
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              borderBottom: "1px solid #e2e8f0",
              paddingBottom: 4,
            }}
          >
            {inst.name}
          </h4>
          {inst.visits.length === 0 ? (
            <p style={{ marginTop: 8, fontSize: 13, color: "#64748b", fontStyle: "italic" }}>
              No hay visitas de supervisión en este período.
            </p>
          ) : (
            inst.visits.map((v) => (
              <article
                key={v.id}
                style={{ marginTop: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 12 }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                  {formatDateTimeCl(v.checkInAt)}
                  {v.durationMinutes != null ? ` · ${v.durationMinutes} min` : ""}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569" }}>
                  Supervisor: {v.supervisorName}
                </p>
                {v.installationState && (
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569" }}>
                    Estado: {v.installationState}
                  </p>
                )}
                {v.generalComments && (
                  <p style={{ margin: "8px 0 0", fontSize: 13 }}>{v.generalComments}</p>
                )}
                {v.findings.map((f, i) => (
                  <p key={i} style={{ margin: "4px 0 0", fontSize: 13 }}>
                    · {f.description} ({f.status})
                  </p>
                ))}
              </article>
            ))
          )}
        </section>
      ))}
    </div>
  );
}
