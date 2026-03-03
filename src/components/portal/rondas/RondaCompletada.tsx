"use client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  trustScore: number;
  porcentajeCompletado: number;
  durationMinutes: number | null;
  missed: number;
  onBackToRondas: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trustColor(score: number): string {
  if (score >= 80) return "#22c55e"; // green
  if (score >= 50) return "#eab308"; // yellow
  return "#ef4444"; // red
}

function trustLabel(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bueno";
  if (score >= 40) return "Regular";
  return "Bajo";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RondaCompletada({
  trustScore,
  porcentajeCompletado,
  durationMinutes,
  missed,
  onBackToRondas,
}: Props) {
  const clampedScore = Math.min(100, Math.max(0, Math.round(trustScore)));
  const color = trustColor(clampedScore);

  // SVG circular gauge calculations
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedScore / 100) * circumference;

  return (
    <div className="flex min-h-dvh flex-col" style={{ backgroundColor: "#0a0a0f" }}>
      {/* ============ Header ============ */}
      <header
        className="sticky top-0 z-10 border-b border-gray-800 px-4 py-3"
        style={{ backgroundColor: "#0a0a0f" }}
      >
        <h1 className="text-center text-lg font-semibold text-white">Ronda Completada</h1>
      </header>

      {/* ============ Content ============ */}
      <main className="flex flex-1 flex-col items-center justify-center space-y-6 px-4 pb-8 pt-6">
        {/* ---- Trust Score Gauge ---- */}
        <div className="relative flex items-center justify-center">
          <svg
            width="140"
            height="140"
            viewBox="0 0 140 140"
            className="-rotate-90"
            aria-hidden="true"
          >
            {/* Background circle */}
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="#1f2937"
              strokeWidth="10"
            />
            {/* Score arc */}
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-1000"
            />
          </svg>
          {/* Score text in center */}
          <div className="absolute flex flex-col items-center">
            <span className="text-3xl font-bold text-white">{clampedScore}</span>
            <span className="text-xs text-gray-400">Trust Score</span>
          </div>
        </div>

        {/* Trust label */}
        <p className="text-lg font-semibold" style={{ color }}>
          {trustLabel(clampedScore)}
        </p>

        {/* ---- Summary Card ---- */}
        <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="space-y-4">
            {/* Checkpoints completed */}
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-400">Completado</span>
              <span className="text-base font-medium text-white">
                {Math.round(porcentajeCompletado)}%
              </span>
            </div>

            {/* Duration */}
            {durationMinutes != null && (
              <div className="flex items-center justify-between">
                <span className="text-base text-gray-400">Duracion</span>
                <span className="text-base font-medium text-white">
                  {durationMinutes} min
                </span>
              </div>
            )}

            {/* Missed checkpoints */}
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-400">Puntos omitidos</span>
              <span
                className={`text-base font-medium ${
                  missed > 0 ? "text-red-400" : "text-green-400"
                }`}
              >
                {missed}
              </span>
            </div>
          </div>
        </div>

        {/* ---- Success icon ---- */}
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(34,197,94,0.15)" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* ---- Back Button ---- */}
        <button
          onClick={onBackToRondas}
          className="w-full max-w-sm rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700"
          style={{ minHeight: 56 }}
        >
          Volver a Mis Rondas
        </button>
      </main>
    </div>
  );
}
