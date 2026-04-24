"use client";

interface GuardEntry {
  personaId: string | null;
  name: string;
  evaluatedAt: string | null;
  validUntil: string | null;
  isValid: boolean;
}

interface Props {
  guards: GuardEntry[];
  showEvaluationDate: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL");
}

function statusOf(g: GuardEntry): { label: string; cls: string } {
  if (g.isValid) {
    return {
      label: `Evaluado · vigente hasta ${formatDate(g.validUntil)}`,
      cls: "bg-emerald-100 text-emerald-900",
    };
  }
  if (g.evaluatedAt) {
    return {
      label: `Por reevaluar (último: ${formatDate(g.evaluatedAt)})`,
      cls: "bg-amber-100 text-amber-900",
    };
  }
  return {
    label: "Sin evaluación vigente",
    cls: "bg-slate-100 text-slate-700",
  };
}

export default function ClientPsychGuardsList({
  guards,
  showEvaluationDate,
}: Props) {
  if (guards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        No hay guardias asignados a este contrato.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white divide-y">
      {guards.map((g, i) => {
        const st = statusOf(g);
        const label = showEvaluationDate
          ? st.label
          : g.isValid
            ? "Evaluado · vigente"
            : "Sin evaluación vigente";
        return (
          <div
            key={g.personaId ?? i}
            className="p-3 flex items-center justify-between text-sm"
          >
            <p className="text-slate-900">{g.name}</p>
            <span className={`text-xs px-2 py-1 rounded-md ${st.cls}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
