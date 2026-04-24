"use client";

import Link from "next/link";
import PsychBandBadge from "./PsychBandBadge";

interface Row {
  id: string;
  targetName: string;
  targetRut: string | null;
  status: string;
  createdAt: string;
  result: { globalScore: number; band: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Enviado",
  STARTED: "En progreso",
  SUBMITTED: "Finalizado",
  SCORED: "Resultado listo",
  REVIEWED: "Revisado",
  EXPIRED: "Expirado",
};

export default function PsychAssessmentsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
        Aún no hay evaluaciones. Usa el botón &ldquo;Nueva evaluación&rdquo;.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left px-4 py-3">Evaluado</th>
            <th className="text-left px-4 py-3">Estado</th>
            <th className="text-left px-4 py-3">Score</th>
            <th className="text-left px-4 py-3">Banda</th>
            <th className="text-left px-4 py-3">Creado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{r.targetName}</div>
                {r.targetRut ? (
                  <div className="text-xs text-slate-500">{r.targetRut}</div>
                ) : null}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {STATUS_LABEL[r.status] ?? r.status}
              </td>
              <td className="px-4 py-3 text-slate-900 font-medium">
                {r.result ? r.result.globalScore.toFixed(1) : "—"}
              </td>
              <td className="px-4 py-3">
                <PsychBandBadge band={r.result?.band ?? null} />
              </td>
              <td className="px-4 py-3 text-slate-500">
                {new Date(r.createdAt).toLocaleDateString("es-CL")}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/personas/psicolaboral/${r.id}`}
                  className="text-slate-700 underline"
                >
                  Ver
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
