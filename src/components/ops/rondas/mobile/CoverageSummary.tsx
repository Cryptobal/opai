"use client";

interface GuardiaData {
  status: string;
  turno: string;
}

interface InstalacionData {
  coberturaStatus: string;
  guardias: GuardiaData[];
}

interface CoverageSummaryProps {
  instalaciones: InstalacionData[];
}

function countByStatus(guardias: GuardiaData[]) {
  let presentes = 0, enCamino = 0, noViene = 0, pendiente = 0;
  for (const g of guardias) {
    if (g.status === "presente" || g.status === "reemplazo") presentes++;
    else if (g.status === "en_camino") enCamino++;
    else if (g.status === "no_viene") noViene++;
    else pendiente++;
  }
  return { total: guardias.length, presentes, enCamino, noViene, pendiente };
}

export function CoverageSummary({ instalaciones }: CoverageSummaryProps) {
  let descubiertas = 0;
  const allNoche: GuardiaData[] = [];
  const allDia: GuardiaData[] = [];

  for (const inst of instalaciones) {
    const guardias = inst.guardias ?? [];
    for (const g of guardias) {
      if (g.turno === "diurno") allDia.push(g);
      else allNoche.push(g);
    }
    if (inst.coberturaStatus === "descubierta") descubiertas++;
  }

  const noche = countByStatus(allNoche);
  const dia = countByStatus(allDia);

  return (
    <div className="bg-slate-800/80 rounded-xl mx-3 p-3 space-y-3">
      {/* TURNO NOCHE */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-slate-400">TURNO NOCHE</span>
          <span className={`text-xs font-bold ${
            noche.presentes >= noche.total ? "text-status-ok-fg" :
            noche.noViene > 0 ? "text-status-danger-fg" : "text-status-warn-fg"
          }`}>
            {noche.presentes}/{noche.total}
          </span>
        </div>
        <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden flex">
          <div className="bg-status-ok h-full transition-all duration-500"
            style={{ width: `${(noche.presentes / Math.max(noche.total, 1)) * 100}%` }} />
          <div className="bg-amber-400 h-full transition-all duration-500"
            style={{ width: `${(noche.enCamino / Math.max(noche.total, 1)) * 100}%` }} />
          <div className="bg-status-danger h-full transition-all duration-500"
            style={{ width: `${(noche.noViene / Math.max(noche.total, 1)) * 100}%` }} />
        </div>
        <div className="flex gap-2 mt-1.5 flex-wrap">
          <span className="text-[10px] text-status-ok-fg">{noche.presentes} presentes</span>
          {noche.enCamino > 0 && <span className="text-[10px] text-status-warn-fg">{noche.enCamino} en camino</span>}
          {noche.noViene > 0 && <span className="text-[10px] text-status-danger-fg font-bold">{noche.noViene} no viene</span>}
          {noche.pendiente > 0 && <span className="text-[10px] text-slate-500">{noche.pendiente} pendiente</span>}
        </div>
      </div>

      <div className="border-t border-slate-700/50" />

      {/* RELEVO DÍA */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-slate-400">RELEVO DÍA</span>
          <span className={`text-xs font-bold ${
            dia.total === 0 ? "text-slate-600" :
            dia.presentes >= dia.total ? "text-status-ok-fg" :
            dia.presentes > 0 ? "text-status-warn-fg" : "text-slate-500"
          }`}>
            {dia.presentes}/{dia.total}
          </span>
        </div>
        <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden flex">
          <div className="bg-status-ok h-full transition-all duration-500"
            style={{ width: `${(dia.presentes / Math.max(dia.total, 1)) * 100}%` }} />
          <div className="bg-amber-400 h-full transition-all duration-500"
            style={{ width: `${(dia.enCamino / Math.max(dia.total, 1)) * 100}%` }} />
        </div>
        <div className="flex gap-2 mt-1.5 flex-wrap">
          <span className="text-[10px] text-status-ok-fg">{dia.presentes} llegaron</span>
          {dia.enCamino > 0 && <span className="text-[10px] text-status-warn-fg">{dia.enCamino} en camino</span>}
          {dia.pendiente > 0 && <span className="text-[10px] text-slate-500">{dia.pendiente} pendientes</span>}
        </div>
      </div>

      {/* Posiciones descubiertas */}
      {descubiertas > 0 && (
        <>
          <div className="border-t border-status-danger-border" />
          <div className="flex items-center gap-2 bg-status-danger-soft rounded-lg px-3 py-2">
            <span className="text-status-danger-fg text-sm">{"\uD83D\uDD34"}</span>
            <span className="text-xs text-status-danger-fg font-medium">
              {descubiertas} posici&oacute;n{descubiertas > 1 ? "es" : ""} descubierta{descubiertas > 1 ? "s" : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
