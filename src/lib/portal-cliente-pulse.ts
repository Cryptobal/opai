import { toChileTime } from "@/lib/rondas/timezone";
import type {
  Round24hStatus,
  SummaryOnDuty,
  SummaryRound24hSlot,
} from "@/lib/portal-cliente-types";

const SLOT_MS = 2 * 60 * 60 * 1000;
const WINDOW_MS = 12 * SLOT_MS;

export type PulseRound = {
  scheduledAt: Date;
  status: string;
  startedAt?: Date | null;
};

export type PulseMarcacion = {
  tipo: string;
  timestamp: Date;
  guardiaId: string;
  guardName: string | null;
};

export function buildRounds24h(
  rounds: PulseRound[],
  now: Date,
  hasRondaEnCurso: boolean,
): SummaryRound24hSlot[] {
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const slots: SummaryRound24hSlot[] = [];
  for (let i = 0; i < 12; i++) {
    const start = new Date(windowStart.getTime() + i * SLOT_MS);
    const end = new Date(start.getTime() + SLOT_MS);
    const hour = toChileTime(start).getHours();
    const inSlot = rounds.filter((r) => {
      const t = r.startedAt ?? r.scheduledAt;
      return t >= start && t < end;
    });
    const isNowWindow = now >= start && now <= end;
    let status: Round24hStatus = "pending";
    if ((hasRondaEnCurso && isNowWindow) || inSlot.some((r) => r.status === "en_curso")) {
      status = "now";
    } else if (inSlot.some((r) => r.status === "completada")) {
      status = "ok";
    } else if (inSlot.some((r) => r.status === "incompleta" || r.status === "no_realizada")) {
      status = "warn";
    }
    slots.push({ hour, status });
  }
  return slots;
}

export function resolveOnDuty(marcaciones: PulseMarcacion[], now: Date): SummaryOnDuty | null {
  const latestByGuard = new Map<string, PulseMarcacion>();
  for (const m of marcaciones) {
    const prev = latestByGuard.get(m.guardiaId);
    if (!prev || m.timestamp > prev.timestamp) latestByGuard.set(m.guardiaId, m);
  }
  let best: PulseMarcacion | null = null;
  for (const m of latestByGuard.values()) {
    if (m.tipo !== "entrada") continue;
    if (!best || m.timestamp > best.timestamp) best = m;
  }
  if (!best) return null;
  const sinceMinutes = Math.max(0, Math.floor((now.getTime() - best.timestamp.getTime()) / 60000));
  return {
    guardName: best.guardName?.trim() || "Guardia en turno",
    shiftStart: best.timestamp.toISOString(),
    shiftEnd: null,
    sinceMinutes,
  };
}
