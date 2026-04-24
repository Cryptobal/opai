"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PsychBandBadge from "@/components/psych/dashboard/PsychBandBadge";
import type { PsychAlert } from "@/lib/psych/types";

interface AssessmentRow {
  id: string;
  status: string;
  createdAt: string;
  submittedAt: string | null;
  expiresAt: string;
  result: {
    globalScore: number;
    band: string;
    alerts: PsychAlert[];
  } | null;
}

interface Props {
  personaId: string;
  candidateName: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Invitación enviada",
  STARTED: "En progreso",
  SUBMITTED: "Esperando scoring",
  SCORED: "Resultado listo",
  REVIEWED: "Revisado",
  EXPIRED: "Expirado",
};

export default function AtsPsychPanel({ personaId, candidateName }: Props) {
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(
        `/api/psych/assessments?personaId=${encodeURIComponent(personaId)}`,
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Error");
      setRows(json.rows ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
  }, [personaId]);

  async function handleInvite() {
    setBusy(true);
    try {
      const res = await fetch("/api/psych/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetName: candidateName, personaId }),
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

  if (err) {
    return <p className="text-sm text-rose-700">No se pudo cargar: {err}</p>;
  }
  if (!rows) return <p className="text-sm text-slate-500">Cargando…</p>;

  const last = rows[0];

  if (!last) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm">
        <p className="text-slate-600 mb-3">Sin evaluación psicolaboral.</p>
        <button
          onClick={handleInvite}
          disabled={busy}
          className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Creando…" : "Invitar a evaluación"}
        </button>
      </div>
    );
  }

  const notRec = last.result?.band === "NOT_RECOMMENDED";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">
            {STATUS_LABEL[last.status] ?? last.status}
          </p>
          {last.result ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-semibold text-slate-900">
                {last.result.globalScore.toFixed(1)}
              </span>
              <PsychBandBadge band={last.result.band} />
            </div>
          ) : (
            <p className="text-sm text-slate-600 mt-1">
              Enviada el {new Date(last.createdAt).toLocaleDateString("es-CL")}
            </p>
          )}
        </div>
        <Link
          href={`/personas/psicolaboral/${last.id}`}
          className="text-xs text-slate-700 underline"
        >
          Ver detalle
        </Link>
      </div>
      {last.result?.alerts && last.result.alerts.length > 0 ? (
        <ul className="text-xs text-slate-600 space-y-1">
          {last.result.alerts.slice(0, 3).map((a, i) => (
            <li key={i}>• {a.message}</li>
          ))}
        </ul>
      ) : null}
      {notRec ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          Esta evaluación sugiere <b>no avanzar</b> con este postulante. Si
          decides avanzar a &ldquo;Contratado&rdquo;, se te pedirá documentar
          la justificación.
        </div>
      ) : null}
    </div>
  );
}
