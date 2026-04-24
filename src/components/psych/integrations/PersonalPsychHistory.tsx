"use client";

import Link from "next/link";
import PsychBandBadge from "@/components/psych/dashboard/PsychBandBadge";

export interface HistoryRow {
  id: string;
  status: string;
  createdAt: string;
  submittedAt: string | null;
  result: { globalScore: number; band: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Enviado",
  STARTED: "En progreso",
  SUBMITTED: "Finalizado",
  SCORED: "Resultado",
  REVIEWED: "Revisado",
  EXPIRED: "Expirado",
};

export default function PersonalPsychHistory({
  rows,
  onInviteNew,
  busy,
}: {
  rows: HistoryRow[];
  onInviteNew: () => void;
  busy: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 flex items-center justify-between gap-3">
        <span>Sin evaluaciones previas.</span>
        <button
          onClick={onInviteNew}
          disabled={busy}
          className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {busy ? "Enviando…" : "Enviar evaluación"}
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white divide-y">
      {rows.map((r) => (
        <div key={r.id} className="p-3 flex items-center justify-between text-sm">
          <div>
            <p className="text-slate-900">
              {r.result
                ? `${r.result.globalScore.toFixed(1)} / 100`
                : STATUS_LABEL[r.status] ?? r.status}
            </p>
            <p className="text-xs text-slate-500">
              {new Date(r.submittedAt ?? r.createdAt).toLocaleDateString("es-CL")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PsychBandBadge band={r.result?.band ?? null} />
            <Link
              href={`/personas/psicolaboral/${r.id}`}
              className="text-xs underline text-slate-700"
            >
              Ver
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
