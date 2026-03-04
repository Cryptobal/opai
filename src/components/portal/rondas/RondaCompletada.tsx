"use client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckpointDetail {
  name: string;
  status: "COMPLETED" | "MISSED";
  timestamp?: string;
  distanceM?: number;
  geoValidada?: boolean;
  qrScanned?: boolean;
  hasPhoto?: boolean;
}

interface Props {
  trustScore: number;
  porcentajeCompletado: number;
  durationMinutes: number | null;
  missed: number;
  checkpoints?: CheckpointDetail[];
  scheduledAt?: string;
  startedAt?: string;
  onBackToRondas: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trustColor(score: number): string {
  if (score >= 80) return "#22c55e"; // green
  if (score >= 60) return "#eab308"; // yellow
  return "#ef4444"; // red
}

function trustLabel(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Buen trabajo";
  return "Puedes mejorar";
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function getPunctuality(scheduledAt?: string, startedAt?: string): string {
  if (!scheduledAt || !startedAt) return "—";
  const scheduled = new Date(scheduledAt).getTime();
  const started = new Date(startedAt).getTime();
  const diffMin = Math.round((started - scheduled) / 60000);
  if (diffMin <= 0) return "A tiempo";
  return `${diffMin} min tarde`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RondaCompletada({
  trustScore,
  porcentajeCompletado,
  durationMinutes,
  missed,
  checkpoints,
  scheduledAt,
  startedAt,
  onBackToRondas,
}: Props) {
  const clampedScore = Math.min(100, Math.max(0, Math.round(trustScore)));
  const color = trustColor(clampedScore);

  // SVG circular gauge calculations
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedScore / 100) * circumference;

  // Derived counts
  const completedCount = checkpoints
    ? checkpoints.filter((c) => c.status === "COMPLETED").length
    : null;
  const totalCount = checkpoints ? checkpoints.length : null;

  // Punctuality
  const punctuality = getPunctuality(scheduledAt, startedAt);
  const isLate = punctuality !== "A tiempo" && punctuality !== "—";

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
      <main className="flex flex-1 flex-col items-center space-y-6 px-4 pb-8 pt-6">
        {/* ---- Trust Score Gauge ---- */}
        <div
          className="relative flex items-center justify-center"
          role="status"
          aria-label={`Trust Score: ${clampedScore} de 100, ${trustLabel(clampedScore)}`}
        >
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

        {/* ---- Expanded Summary Card ---- */}
        <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="space-y-3">
            {/* Completado */}
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-400">
                {"\u2705"} Completado
              </span>
              <span className="text-base font-medium text-white">
                {Math.round(porcentajeCompletado)}%
              </span>
            </div>

            {/* Duracion */}
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-400">
                {"\u23F1\uFE0F"} Duraci&oacute;n
              </span>
              <span className="text-base font-medium text-white">
                {durationMinutes !== null ? `${durationMinutes} min` : "—"}
              </span>
            </div>

            {/* Puntos */}
            {completedCount !== null && totalCount !== null && (
              <div className="flex items-center justify-between">
                <span className="text-base text-gray-400">
                  {"\uD83D\uDCCD"} Puntos
                </span>
                <span className="text-base font-medium text-white">
                  {completedCount}/{totalCount}
                </span>
              </div>
            )}

            {/* Puntualidad */}
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-400">
                {"\u23F0"} Puntualidad
              </span>
              <span
                className={`text-base font-medium ${
                  isLate ? "text-yellow-400" : "text-green-400"
                }`}
              >
                {punctuality}
              </span>
            </div>

            {/* Omitidos */}
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-400">
                {"\uD83D\uDEAB"} Omitidos
              </span>
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

        {/* ---- Per-Checkpoint Detail List ---- */}
        {checkpoints && checkpoints.length > 0 && (
          <div className="w-full max-w-sm">
            <h2 className="mb-3 text-base font-semibold text-white">
              Detalle por Checkpoint
            </h2>
            <div className="space-y-2">
              {checkpoints.map((cp, idx) => {
                const isCompleted = cp.status === "COMPLETED";
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3 ${
                      isCompleted
                        ? "border-gray-800 bg-gray-900/60"
                        : "border-red-900/40 bg-red-950/20"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Status icon */}
                      <span className="mt-0.5 shrink-0 text-base">
                        {isCompleted ? "\u2705" : "\u274C"}
                      </span>

                      <div className="min-w-0 flex-1">
                        {/* Name + timestamp */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-sm font-medium ${
                              isCompleted ? "text-gray-200" : "text-red-400"
                            }`}
                          >
                            {cp.name}
                          </span>
                          <span className="shrink-0 text-xs text-gray-500">
                            {isCompleted && cp.timestamp
                              ? formatTime(cp.timestamp)
                              : "No visitado"}
                          </span>
                        </div>

                        {/* Badges */}
                        {isCompleted && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {cp.geoValidada && (
                              <span className="rounded-md bg-green-500/15 px-1.5 py-0.5 text-xs text-green-400">
                                GPS {"\u2713"}
                              </span>
                            )}
                            {cp.qrScanned && (
                              <span className="rounded-md bg-purple-500/15 px-1.5 py-0.5 text-xs text-purple-400">
                                QR {"\u2713"}
                              </span>
                            )}
                            {cp.hasPhoto && (
                              <span className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-xs text-blue-400">
                                Foto {"\u2713"}
                              </span>
                            )}
                            {cp.distanceM != null && (
                              <span className="rounded-md bg-gray-700/50 px-1.5 py-0.5 text-xs text-gray-400">
                                {Math.round(cp.distanceM)}m
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
