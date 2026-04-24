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
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
        Aún no hay evaluaciones. Usa el botón &ldquo;Nueva evaluación&rdquo;.
      </div>
    );
  }
  return (
    <>
      {/* Mobile: cards stackeadas */}
      <div className="md:hidden grid grid-cols-1 gap-2">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/personas/psicolaboral/${r.id}`}
            className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-3 active:bg-muted/60"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground truncate">{r.targetName}</p>
              {r.targetRut ? (
                <p className="text-xs text-muted-foreground">{r.targetRut}</p>
              ) : null}
              <p className="text-xs text-muted-foreground mt-1">
                {STATUS_LABEL[r.status] ?? r.status} ·{" "}
                {new Date(r.createdAt).toLocaleDateString("es-CL")}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {r.result ? (
                <span className="text-lg font-semibold text-foreground">
                  {r.result.globalScore.toFixed(1)}
                </span>
              ) : null}
              <PsychBandBadge band={r.result?.band ?? null} />
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop: tabla clásica */}
      <div className="hidden md:block rounded-xl border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
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
              <tr
                key={r.id}
                className="border-t border-border hover:bg-muted/50"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{r.targetName}</div>
                  {r.targetRut ? (
                    <div className="text-xs text-muted-foreground">{r.targetRut}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-foreground/90">
                  {STATUS_LABEL[r.status] ?? r.status}
                </td>
                <td className="px-4 py-3 text-foreground font-medium">
                  {r.result ? r.result.globalScore.toFixed(1) : "—"}
                </td>
                <td className="px-4 py-3">
                  <PsychBandBadge band={r.result?.band ?? null} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString("es-CL")}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/personas/psicolaboral/${r.id}`}
                    className="text-foreground/90 underline"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
