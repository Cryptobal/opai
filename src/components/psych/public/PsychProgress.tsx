"use client";

interface Props {
  current: number;
  total: number;
  primaryColor: string;
}

export default function PsychProgress({ current, total, primaryColor }: Props) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full mb-4">
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span>Pregunta {current} de {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${pct}%`, background: primaryColor }}
        />
      </div>
    </div>
  );
}
