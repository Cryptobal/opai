"use client";

import { useEffect, useState } from "react";
import PsychArcoCtaCard from "./PsychArcoCtaCard";

interface Strength {
  dimension: string;
  label: string;
}

interface MyProfileResponse {
  success: boolean;
  hasAssessment: boolean;
  assessment?: {
    id: string;
    status: string;
    submittedAt: string | null;
    nextReevaluationDate: string | null;
  };
  topStrengths?: Strength[];
  arcoRequestUrl: string;
}

interface Props {
  guardiaId: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function MyPsychTab({ guardiaId }: Props) {
  const [data, setData] = useState<MyProfileResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(
      `/api/collaborator-portal/psych/my-profile?guardiaId=${encodeURIComponent(guardiaId)}`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setData(j);
        else setErr(j.error ?? "Error");
      })
      .catch((e) => setErr(String(e)));
  }, [guardiaId]);

  if (err) {
    return <p className="text-sm text-status-danger-fg">No se pudo cargar: {err}</p>;
  }
  if (!data) return <p className="text-sm text-slate-400">Cargando…</p>;

  if (!data.hasAssessment) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 text-center">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-slate-200 font-medium">Aún no tienes evaluaciones</p>
          <p className="text-xs text-slate-400 mt-1">
            Cuando Recursos Humanos te envíe un test psicolaboral, aparecerá aquí.
          </p>
        </div>
        <PsychArcoCtaCard arcoRequestUrl={data.arcoRequestUrl} />
      </div>
    );
  }

  const a = data.assessment!;
  const next = a.nextReevaluationDate;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400">
            Última evaluación
          </p>
          <p className="text-slate-100 mt-1">{formatDate(a.submittedAt)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400">
            Próxima reevaluación
          </p>
          <p className="text-slate-100 mt-1">{formatDate(next)}</p>
        </div>
      </div>

      {data.topStrengths && data.topStrengths.length > 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5">
          <h4 className="text-sm font-medium text-slate-100 mb-3">
            Tus fortalezas detectadas
          </h4>
          <div className="flex flex-wrap gap-2">
            {data.topStrengths.map((s) => (
              <span
                key={s.dimension}
                className="text-xs px-3 py-1.5 rounded-full bg-status-ok-soft text-status-ok-fg"
              >
                ✓ {s.label}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3 leading-relaxed">
            Estas son las áreas donde destacaste en tu última evaluación. Si
            querés ver tu informe completo con todos los detalles, puedes
            solicitarlo por el flujo ARCO.
          </p>
        </div>
      ) : null}

      <PsychArcoCtaCard arcoRequestUrl={data.arcoRequestUrl} />
    </div>
  );
}
