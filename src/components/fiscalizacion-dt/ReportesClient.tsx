"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PortalFrame } from "./PortalFrame";
import { DT_REPORT_MENU } from "@/modules/reportes-dt/constants";
import { EMPTY_SELECTION_MESSAGE } from "@/modules/reportes-dt/constants";

type Filtros = Awaited<ReturnType<typeof import("@/modules/reportes-dt/filter-options").loadDtFilterOptions>>;

type Built = {
  title: string;
  employerName: string;
  employerRut: string;
  from: string;
  to: string;
  empty: boolean;
  emptyMessage: string;
  columns: { key: string; label: string }[];
  workers: {
    workerId: string;
    workerName: string;
    workerRut: string;
    installationName: string;
    emptyMessage?: string;
    modifiedRowIds?: string[];
    rows: Record<string, string | number | boolean | null>[];
    weeklyTotals?: Record<string, string | number | boolean | null>[];
  }[];
  glossary: string;
};

const REPORT_TIPOS = new Set([
  "asistencia",
  "jornada-diaria",
  "domingos-festivos",
  "modificaciones-turnos",
  "reporte-diario",
]);

export function ReportesClient({ version, tenantId }: { version: string; tenantId: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const tipo = sp.get("tipo") || "asistencia";
  const [email, setEmail] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros | null>(null);
  const [report, setReport] = useState<Built | null>(null);
  const [hash, setHash] = useState("");
  const [hashResult, setHashResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [periodo, setPeriodo] = useState("ultima_semana");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [jornada, setJornada] = useState("");
  const [turnos, setTurnos] = useState<string[]>([]);
  const [region, setRegion] = useState("");
  const [installationIds, setInstallationIds] = useState<string[]>([]);
  const [cargos, setCargos] = useState<string[]>([]);
  const [estRut, setEstRut] = useState("");

  useEffect(() => {
    void fetch("/api/fiscalizacion-dt/sesion")
      .then((r) => r.json())
      .then((json) => {
        if (!json.session) {
          router.replace("/fiscalizacion-dt");
          return;
        }
        if (json.session.tenantId !== tenantId) {
          router.replace("/fiscalizacion-dt/empleadores");
          return;
        }
        setEmail(json.session.email);
      });
  }, [router, tenantId]);

  useEffect(() => {
    void fetch(`/api/fiscalizacion-dt/empleadores/${tenantId}/filtros`)
      .then((r) => r.json())
      .then((json) => setFiltros(json.data ?? null));
  }, [tenantId]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (periodo) p.set("periodo", periodo);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (q) p.set("q", q);
    if (jornada) p.set("jornada", jornada);
    if (turnos.length) p.set("turnos", turnos.join(","));
    if (region) p.set("region", region);
    if (installationIds.length) p.set("installationIds", installationIds.join(","));
    if (cargos.length) p.set("cargos", cargos.join(","));
    if (estRut) p.set("estRut", estRut);
    return p.toString();
  }, [periodo, from, to, q, jornada, turnos, region, installationIds, cargos, estRut]);

  const generar = useCallback(async () => {
    if (!REPORT_TIPOS.has(tipo)) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/fiscalizacion-dt/empleadores/${tenantId}/reportes/${tipo}?${query}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "No se pudo generar el reporte");
      return;
    }
    setReport(json.data);
  }, [query, tenantId, tipo]);

  async function descargar(format: "xlsx" | "pdf" | "docx") {
    window.location.href = `/api/fiscalizacion-dt/empleadores/${tenantId}/reportes/${tipo}?${query}&format=${format}`;
  }

  async function verificarHash(e: React.FormEvent) {
    e.preventDefault();
    setHashResult(null);
    const res = await fetch(
      `/api/fiscalizacion-dt/empleadores/${tenantId}/verificar-hash?hash=${encodeURIComponent(hash)}`,
    );
    const json = await res.json();
    if (!res.ok) {
      setHashResult(json.error || "No encontrada");
      return;
    }
    setHashResult(
      json.data.isValid
        ? `Válida · ${json.data.guardiaName} · ${json.data.timestamp}`
        : `Hash almacenado no coincide · ${json.data.guardiaName}`,
    );
  }

  const instalacionesFiltradas =
    filtros?.instalaciones.filter((i) => !region || i.region === region) ?? [];

  return (
    <PortalFrame version={version} email={email}>
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="lg:w-56 shrink-0 space-y-1">
          {DT_REPORT_MENU.map((item) => {
            const href =
              item.tipo === "clientes"
                ? "/fiscalizacion-dt/clientes"
                : item.tipo === "incidentes"
                  ? "/fiscalizacion-dt/incidentes"
                  : `/fiscalizacion-dt/${tenantId}/reportes?tipo=${item.tipo}`;
            const active = item.tipo === tipo || (item.tipo === "verificar-hash" && tipo === "verificar-hash");
            return (
              <Link
                key={item.tipo}
                href={href}
                className={`ds-tap flex min-h-11 items-center rounded-lg px-3 text-[13px] ${
                  active ? "bg-ds-surface-3 font-medium" : "text-ds-text-2 hover:bg-ds-surface-2"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/fiscalizacion-dt/empleadores" className="ds-tap flex min-h-11 items-center px-3 text-[13px] text-ds-text-3">
            Cambiar empleador
          </Link>
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          {tipo === "verificar-hash" ? (
            <form onSubmit={verificarHash} className="space-y-3 rounded-xl border border-ds-border-default bg-ds-surface-2 p-4">
              <label className="text-[13px]" htmlFor="hash">
                Hash de integridad
              </label>
              <input
                id="hash"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
                className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 font-mono text-[12px]"
              />
              <button type="submit" className="ds-tap h-10 rounded-lg bg-primary px-4 text-[13px] text-primary-foreground">
                Verificar
              </button>
              {hashResult ? <p className="text-[13px]">{hashResult}</p> : null}
            </form>
          ) : (
            <>
              <section className="grid grid-cols-1 gap-3 rounded-xl border border-ds-border-default bg-ds-surface-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Periodo">
                  <select
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                    className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                  >
                    {(filtros?.periodos ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                    <option value="">Personalizado</option>
                  </select>
                </Field>
                <Field label="Desde">
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}                     className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]" />
                </Field>
                <Field label="Hasta">
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)}                     className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]" />
                </Field>
                <Field label="Trabajador (nombre o RUT)">
                  <input value={q} onChange={(e) => setQ(e.target.value)}                     className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]" />
                </Field>
                <Field label="Jornada">
                  <select value={jornada} onChange={(e) => setJornada(e.target.value)}                     className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]">
                    <option value="">Todas</option>
                    {(filtros?.jornadas ?? []).map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Turno">
                  <select
                    multiple
                    value={turnos}
                    onChange={(e) => setTurnos([...e.target.selectedOptions].map((o) => o.value))}
                                        className="min-h-24 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                  >
                    {(filtros?.turnos ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Región">
                  <select
                    value={region}
                    onChange={(e) => {
                      setRegion(e.target.value);
                      setInstallationIds([]);
                    }}
                                        className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                  >
                    <option value="">Todas</option>
                    {(filtros?.regiones ?? []).map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Instalación">
                  <select
                    multiple
                    value={installationIds}
                    onChange={(e) => setInstallationIds([...e.target.selectedOptions].map((o) => o.value))}
                                        className="min-h-24 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                  >
                    {instalacionesFiltradas.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Cargo">
                  <select
                    multiple
                    value={cargos}
                    onChange={(e) => setCargos([...e.target.selectedOptions].map((o) => o.value))}
                                        className="min-h-24 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                  >
                    {(filtros?.cargos ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="EST (RUT mandante)">
                  <select value={estRut} onChange={(e) => setEstRut(e.target.value)}                     className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]">
                    <option value="">Todos</option>
                    {(filtros?.ests ?? []).map((e) => (
                      <option key={e.rut} value={e.rut}>
                        {e.name} ({e.rut})
                      </option>
                    ))}
                  </select>
                </Field>
              </section>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void generar()}
                  className="ds-tap h-10 rounded-lg bg-primary px-4 text-[13px] text-primary-foreground"
                >
                  Generar
                </button>
                <button type="button" onClick={() => descargar("xlsx")} className="ds-tap h-10 rounded-lg border border-ds-border-default px-3 text-[13px]">
                  Excel
                </button>
                <button type="button" onClick={() => descargar("pdf")} className="ds-tap h-10 rounded-lg border border-ds-border-default px-3 text-[13px]">
                  PDF
                </button>
                <button type="button" onClick={() => descargar("docx")} className="ds-tap h-10 rounded-lg border border-ds-border-default px-3 text-[13px]">
                  Word
                </button>
                <button type="button" onClick={() => window.print()} className="ds-tap h-10 rounded-lg border border-ds-border-default px-3 text-[13px]">
                  Imprimir
                </button>
              </div>

              {loading ? <p className="text-[13px] text-ds-text-3">Generando…</p> : null}
              {error ? <p className="text-[13px] text-status-danger-fg">{error}</p> : null}

              {report ? (
                <div className="overflow-hidden rounded-xl border border-ds-border-default bg-ds-surface-2">
                  <div className="max-h-[70vh] overflow-auto p-3" style={{ fontFamily: "Arial, sans-serif", fontSize: "8pt" }}>
                    <p className="mb-2 font-semibold">
                      {report.title} · {report.employerName} · {report.employerRut}
                    </p>
                    {report.empty ? (
                      <p>{report.emptyMessage || EMPTY_SELECTION_MESSAGE}</p>
                    ) : (
                      report.workers.map((w) => (
                        <div key={w.workerId} className="mb-4">
                          <p className="font-semibold">
                            {w.workerName} · {w.workerRut} · {w.installationName}
                          </p>
                          {w.rows.length === 0 ? (
                            <p>{w.emptyMessage || EMPTY_SELECTION_MESSAGE}</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse">
                                <thead>
                                  <tr>
                                    {report.columns.map((c) => (
                                      <th key={c.key} className="border border-ds-border-subtle px-1 text-left">
                                        {c.label}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {w.rows.map((row, idx) => (
                                    <tr
                                      key={String(row.id ?? idx)}
                                      className={
                                        w.modifiedRowIds?.includes(String(row.id ?? ""))
                                          ? "bg-status-warn-soft"
                                          : undefined
                                      }
                                    >
                                      {report.columns.map((c) => (
                                        <td key={c.key} className="border border-ds-border-subtle px-1">
                                          {String(row[c.key] ?? "")}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {w.weeklyTotals && w.weeklyTotals.length > 0 ? (
                            <div className="mt-2 overflow-x-auto">
                              <p className="font-semibold">Totales semanales</p>
                              <table className="w-full border-collapse">
                                <tbody>
                                  {w.weeklyTotals.map((tot, tIdx) => (
                                    <tr key={tIdx}>
                                      {Object.entries(tot).map(([k, v]) => (
                                        <td key={k} className="border border-ds-border-subtle px-1">
                                          {String(v ?? "")}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                    <p className="mt-4 text-ds-text-3">{report.glossary}</p>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </PortalFrame>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-[13px]">
      <span>{label}</span>
      {children}
    </label>
  );
}
