"use client";

// ---------------------------------------------------------------------------
// CoverageChip — compact 1-line guard coverage indicator for the grid
// ---------------------------------------------------------------------------

interface CoverageChipProps {
  guardias: Array<{
    id: string;
    guardiaNombre: string;
    status: string;
    isExtra: boolean;
  }>;
  guardiasRequeridos: number;
  coberturaStatus: string;
  onClick?: () => void;
}

const STATUS_BAR_COLOR: Record<string, string> = {
  presente: "bg-emerald-400",
  reemplazo: "bg-purple-400",
  en_camino: "bg-blue-400",
  no_viene: "bg-red-400",
  pendiente: "bg-slate-500",
  ppc: "bg-amber-500",
};

function chipName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[1]?.[0] ?? ""}.`;
}

export function CoverageChip({
  guardias,
  guardiasRequeridos,
  coberturaStatus,
  onClick,
}: CoverageChipProps) {
  const active = guardias.filter((g) => g.status !== "no_viene");
  const presentes = guardias.filter(
    (g) => g.status === "presente" || g.status === "reemplazo",
  ).length;
  const enCamino = guardias.filter((g) => g.status === "en_camino").length;

  const ratioColor =
    coberturaStatus === "completa"
      ? "text-emerald-400"
      : coberturaStatus === "parcial"
        ? "text-amber-400"
        : coberturaStatus === "descubierta"
          ? "text-red-400"
          : "text-slate-500";

  const isDescubierta = coberturaStatus === "descubierta";

  // Check if all guards are PPC (Por Cubrir) entries
  const ppcGuards = guardias.filter((g) => g.guardiaNombre === "PPC");
  const hasPPCOnly = guardias.length > 0 && ppcGuards.length === guardias.length;

  if (guardias.length === 0) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer w-full hover:bg-slate-800/60 transition-colors group"
      >
        <span className="text-slate-600 italic text-[10px]">Sin asignar</span>
        <span className="text-slate-700 group-hover:text-teal-400 ml-auto text-[10px] transition-colors">
          ›
        </span>
      </button>
    );
  }

  if (hasPPCOnly) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer w-full bg-amber-500/[0.08] hover:bg-amber-500/[0.15] transition-colors group"
      >
        <div className="flex gap-[2px] flex-shrink-0">
          {ppcGuards.map((_, i) => (
            <div key={i} className="w-1.5 h-4 rounded-sm bg-amber-500" />
          ))}
        </div>
        <span className="text-[10px] font-medium text-amber-400">
          PPC ({ppcGuards.length})
        </span>
        <span className="text-slate-700 group-hover:text-teal-400 ml-auto text-[10px] transition-colors flex-shrink-0">
          ›
        </span>
      </button>
    );
  }

  // Build bars — one per required slot (or per actual guard if more than required)
  const barCount = Math.max(guardiasRequeridos, guardias.length);
  const bars: string[] = [];
  for (let i = 0; i < barCount; i++) {
    if (i < guardias.length) {
      const g = guardias[i];
      // PPC guards get amber bar when still unassigned
      if (g.guardiaNombre === "PPC") {
        bars.push(g.status === "no_viene" ? "bg-red-400" : "bg-amber-500");
      } else {
        bars.push(STATUS_BAR_COLOR[g.status] ?? "bg-slate-600");
      }
    } else {
      bars.push("bg-slate-800");
    }
  }

  // Names — first 2 active guards (exclude PPC from name display)
  const realGuards = active.filter((g) => g.guardiaNombre !== "PPC");
  const ppcCount = active.filter((g) => g.guardiaNombre === "PPC").length;
  const displayGuards = realGuards.slice(0, 2);
  const moreCount = realGuards.length - 2;
  const namesStr = displayGuards.map((g) => chipName(g.guardiaNombre)).join(", ");

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer w-full transition-colors group ${
        isDescubierta
          ? "bg-red-500/[0.08] hover:bg-red-500/[0.12]"
          : "hover:bg-slate-800/60"
      }`}
    >
      {/* Status bars */}
      <div className="flex gap-[2px] flex-shrink-0">
        {bars.map((color, i) => (
          <div key={i} className={`w-1.5 h-4 rounded-sm ${color}`} />
        ))}
      </div>

      {/* Ratio */}
      <span
        className={`text-[10px] font-mono font-medium flex-shrink-0 ${ratioColor}`}
      >
        {presentes}/{guardiasRequeridos}
      </span>

      {enCamino > 0 && (
        <span className="text-[9px] text-blue-400 flex-shrink-0">
          (+{enCamino}ec)
        </span>
      )}

      {/* Names */}
      <span className="text-[10px] text-slate-400 truncate">
        {namesStr}
        {moreCount > 0 && (
          <span className="text-slate-600"> +{moreCount}</span>
        )}
        {ppcCount > 0 && (
          <span className="text-amber-400/70"> +{ppcCount} PPC</span>
        )}
      </span>

      {/* Arrow */}
      <span className="text-slate-700 group-hover:text-teal-400 ml-auto text-[10px] transition-colors flex-shrink-0">
        ›
      </span>
    </button>
  );
}
