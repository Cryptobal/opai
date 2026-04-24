"use client";

import { useEffect, useState } from "react";
import PsychHistoryTable, {
  type HistoryAssessment,
} from "@/components/psych/dashboard/PsychHistoryTable";

interface Config {
  reevaluationIntervalMonths: number;
}

interface Props {
  personaId: string;
  guardName: string;
}

const MS_PER_MONTH = 30 * 24 * 3600 * 1000;
const addMonths = (d: Date, months: number): Date =>
  new Date(d.getTime() + months * MS_PER_MONTH);

export default function PersonalPsychPanel({ personaId, guardName }: Props) {
  const [rows, setRows] = useState<HistoryAssessment[] | null>(null);
  const [config, setConfig] = useState<Config>({ reevaluationIntervalMonths: 6 });
  const [canDelete, setCanDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const [a, c, m] = await Promise.all([
        fetch(
          `/api/psych/assessments?personaId=${encodeURIComponent(personaId)}`,
        ).then((r) => r.json()),
        fetch("/api/psych/config").then((r) => r.json()),
        fetch("/api/psych/me").then((r) => r.json()),
      ]);
      if (a.success) {
        const mapped: HistoryAssessment[] = (a.rows as HistoryAssessment[]).map(
          (r) => ({ ...r, targetName: guardName }),
        );
        setRows(mapped);
      }
      if (c.success) {
        setConfig({
          reevaluationIntervalMonths:
            (c.config.reevaluationIntervalMonths as number | undefined) ?? 6,
        });
      }
      if (m.success) setCanDelete(!!m.canAdmin);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
  }, [personaId]);

  async function handleRequestNew() {
    setBusy(true);
    try {
      const res = await fetch("/api/psych/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetName: guardName, personaId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Error");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (err) return <p className="text-sm text-rose-700">{err}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const lastSubmitted = rows.find((r) => r.submittedAt);
  const nextReevaluationDate = lastSubmitted?.submittedAt
    ? addMonths(new Date(lastSubmitted.submittedAt), config.reevaluationIntervalMonths)
    : null;
  const overdue =
    nextReevaluationDate && nextReevaluationDate.getTime() < Date.now();
  const notRec = lastSubmitted?.result?.band === "NOT_RECOMMENDED";

  return (
    <div className="space-y-3">
      {overdue ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex items-center justify-between gap-3">
          <span>
            Reevaluación vencida (última:{" "}
            {lastSubmitted?.submittedAt
              ? new Date(lastSubmitted.submittedAt).toLocaleDateString("es-CL")
              : "—"}
            ).
          </span>
          <button
            onClick={handleRequestNew}
            disabled={busy}
            className="rounded-md bg-amber-600 text-white px-3 py-1.5 text-xs"
          >
            {busy ? "Enviando…" : "Enviar nueva"}
          </button>
        </div>
      ) : null}
      {notRec ? (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-900">
          Última evaluación: <b>No recomendado</b>. Considera activar plan de acción.
        </div>
      ) : null}
      <PsychHistoryTable
        rows={rows}
        canDelete={canDelete}
        onDeleted={load}
      />
      {lastSubmitted ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Próxima reevaluación:{" "}
            <b>{nextReevaluationDate?.toLocaleDateString("es-CL")}</b>
          </span>
          <button
            onClick={handleRequestNew}
            disabled={busy}
            className="rounded-md border border-border px-2 py-1"
          >
            Solicitar reevaluación
          </button>
        </div>
      ) : null}
    </div>
  );
}
