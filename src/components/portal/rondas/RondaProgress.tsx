"use client";

interface Props {
  completed: number;
  total: number;
}

export function RondaProgress({ completed, total }: Props) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">
          {completed}/{total} checkpoints
        </span>
        <span className="font-medium text-gray-300">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 100 ? "#22c55e" : "#14b8a6",
          }}
        />
      </div>
    </div>
  );
}
