"use client";

interface Props {
  contractName: string;
  totalGuards: number;
  evaluatedGuards: number;
  validAssessments: number;
  reportLevel: "SEAL" | "SUMMARY" | "FULL";
  degradedFromFull?: boolean;
}

const LEVEL_LABEL: Record<string, string> = {
  SEAL: "Sello de cobertura",
  SUMMARY: "Resumen agregado",
  FULL: "Informe completo",
};

export default function ClientPsychOverviewCard({
  contractName,
  totalGuards,
  evaluatedGuards,
  validAssessments,
  reportLevel,
  degradedFromFull,
}: Props) {
  const pct = totalGuards > 0 ? Math.round((validAssessments / totalGuards) * 100) : 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase">{contractName}</p>
          <h3 className="text-lg font-semibold text-foreground">
            Evaluación psicolaboral del personal
          </h3>
        </div>
        <span className="text-xs px-2 py-1 rounded-md bg-muted text-foreground/90">
          {LEVEL_LABEL[reportLevel]}
        </span>
      </div>
      {degradedFromFull ? (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-1">
          Nivel solicitado (Completo) no disponible: falta firma de DPA.
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-3 pt-1">
        <Metric label="Guardias asignados" value={totalGuards} />
        <Metric label="Con evaluación" value={evaluatedGuards} />
        <Metric label="Con vigencia" value={validAssessments} tone="ok" />
      </div>
      <div className="pt-2">
        <p className="text-xs text-muted-foreground mb-1">Cobertura vigente</p>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-status-ok transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{pct}%</p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok";
}) {
  return (
    <div>
      <p
        className={`text-2xl font-semibold ${
          tone === "ok" ? "text-status-ok-fg" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
