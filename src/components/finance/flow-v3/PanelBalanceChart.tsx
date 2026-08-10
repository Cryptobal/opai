"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Label,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PanelWeekPoint } from "@/modules/finance/flow-v3/insights-series";
import { fmtClp, fmtClpShort, fmtDayMonth } from "./format";
import { PanelBalanceTooltip, type ChartPoint } from "./PanelBalanceTooltip";

const TOKEN = {
  primary: "hsl(var(--primary))",
  text3: "hsl(var(--ds-text-3))",
  ok: "hsl(var(--ds-ok))",
  danger: "hsl(var(--ds-danger))",
  warn: "hsl(var(--ds-warn))",
  info: "hsl(var(--ds-info))",
  border: "hsl(var(--ds-border-default))",
  muted: "hsl(var(--ds-text-4))",
} as const;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useIsSmUp(): boolean {
  const [sm, setSm] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    setSm(mq.matches);
    const onChange = () => setSm(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return sm;
}

function pointFill(p: PanelWeekPoint, buffer: number): string {
  if (p.sealed) return TOKEN.info;
  if (p.balance < 0) return TOKEN.danger;
  if (buffer > 0 && p.balance < buffer) return TOKEN.warn;
  return TOKEN.primary;
}

function Dot({
  cx,
  cy,
  payload,
  buffer,
}: {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
  buffer: number;
}) {
  if (cx == null || cy == null || !payload) return null;
  const fill = pointFill(payload, buffer);
  return (
    <g>
      {payload.breakDelta != null && (
        <circle
          cx={cx}
          cy={cy}
          r={7}
          fill="none"
          stroke={TOKEN.warn}
          strokeWidth={1.5}
        />
      )}
      {payload.anchored && (
        <circle
          cx={cx}
          cy={cy}
          r={5.5}
          fill="none"
          stroke={TOKEN.text3}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}
      <circle cx={cx} cy={cy} r={3.5} fill={fill} stroke="none" />
    </g>
  );
}

export function PanelBalanceChart({
  weeks,
  buffer,
  currentWeek,
  showFlow = true,
  onSelectWeek,
}: {
  weeks: PanelWeekPoint[];
  buffer: number;
  currentWeek: string;
  showFlow?: boolean;
  onSelectWeek?: (weekStart: string) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const smUp = useIsSmUp();
  const height = smUp ? 320 : 240;
  const yWidth = smUp ? 60 : 44;

  const data: ChartPoint[] = useMemo(() => {
    return weeks.map((w, i) => {
      const opening = i === 0 ? w.balance - w.net : weeks[i - 1]!.balance;
      const isHistOrCurrent = w.weekStart <= currentWeek;
      const isProjOrCurrent = w.weekStart >= currentWeek;
      return {
        ...w,
        opening: Math.round(opening),
        balanceReal: isHistOrCurrent ? w.balance : null,
        balanceProj: isProjOrCurrent ? w.balance : null,
        // Barras de egreso como magnitud positiva para apilar visualmente
        outflowBar: Math.abs(w.outflow),
      };
    });
  }, [weeks, currentWeek]);

  const currentLabel = weeks.find((w) => w.weekStart === currentWeek)?.label;
  const xInterval = weeks.length > 14 ? 1 : 0;

  const minPt = useMemo(
    () =>
      weeks.reduce(
        (a, b) => (b.balance < a.balance ? b : a),
        weeks[0] ?? { balance: 0, label: "", weekStart: "" },
      ),
    [weeks],
  );
  const last = weeks[weeks.length - 1];
  const below = weeks.filter((w) =>
    buffer > 0 ? w.balance < buffer : w.balance < 0,
  ).length;

  if (weeks.length === 0) {
    return (
      <p className="text-[13px] text-ds-text-4">
        Sin datos de flujo en el horizonte
      </p>
    );
  }

  return (
    <div className="relative w-full">
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 16, right: 12, left: 0, bottom: 4 }}
            accessibilityLayer
            onClick={(state) => {
              const payload = (
                state as { activePayload?: Array<{ payload?: ChartPoint }> }
              )?.activePayload?.[0]?.payload;
              if (payload?.weekStart && onSelectWeek) {
                onSelectWeek(payload.weekStart);
              }
            }}
          >
            <CartesianGrid
              stroke={TOKEN.border}
              strokeDasharray="3 3"
              vertical={false}
              opacity={0.5}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: TOKEN.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: TOKEN.border }}
              interval={xInterval}
            />
            <YAxis
              tickFormatter={fmtClpShort}
              width={yWidth}
              tick={{ fill: TOKEN.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              domain={([dataMin, dataMax]: readonly [number, number]) => {
                const lo = Math.min(dataMin, 0, buffer || 0);
                const hi = Math.max(dataMax, 0);
                const pad = Math.max((hi - lo) * 0.08, 100_000);
                return [lo - pad, hi + pad] as [number, number];
              }}
            />
            <Tooltip
              content={<PanelBalanceTooltip buffer={buffer} />}
              cursor={{ stroke: TOKEN.text3, strokeDasharray: "3 3" }}
              wrapperStyle={{ outline: "none", zIndex: 20 }}
            />
            {showFlow && (
              <Bar
                dataKey="inflow"
                name="Ingresos"
                fill={TOKEN.ok}
                fillOpacity={0.25}
                radius={[2, 2, 0, 0]}
                isAnimationActive={!reducedMotion}
                maxBarSize={28}
              />
            )}
            {showFlow && (
              <Bar
                dataKey="outflowBar"
                name="Egresos"
                fill={TOKEN.danger}
                fillOpacity={0.25}
                radius={[2, 2, 0, 0]}
                isAnimationActive={!reducedMotion}
                maxBarSize={28}
              />
            )}
            <ReferenceLine y={0} stroke={TOKEN.border} strokeWidth={1} />
            {buffer > 0 && (
              <ReferenceLine
                y={buffer}
                stroke={TOKEN.warn}
                strokeDasharray="5 4"
                strokeWidth={1}
              >
                <Label
                  value={`Colchón ${fmtClp(buffer)}`}
                  position="insideTopRight"
                  fill={TOKEN.warn}
                  fontSize={12}
                />
              </ReferenceLine>
            )}
            {currentLabel && (
              <ReferenceLine
                x={currentLabel}
                stroke={TOKEN.text3}
                strokeDasharray="4 4"
                strokeWidth={1}
              >
                <Label
                  value="HOY"
                  position="insideTopLeft"
                  fill={TOKEN.text3}
                  fontSize={12}
                />
              </ReferenceLine>
            )}
            <Line
              type="monotone"
              dataKey="balanceReal"
              name="Histórico"
              stroke={TOKEN.text3}
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
              dot={<Dot buffer={buffer} />}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="balanceProj"
              name="Proyección"
              stroke={TOKEN.primary}
              strokeWidth={2.5}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
              dot={<Dot buffer={buffer} />}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ds-text-3">
        <span>
          Mín.{" "}
          <span
            className={`font-medium tabular-nums ${
              minPt.balance < 0 ? "text-status-danger-fg" : "text-ds-text-1"
            }`}
          >
            {fmtClp(minPt.balance)}
          </span>
          <span className="text-ds-text-4">
            {" "}
            · {minPt.label}{" "}
            {"weekStart" in minPt && minPt.weekStart
              ? fmtDayMonth(String(minPt.weekStart))
              : ""}
          </span>
        </span>
        {last && (
          <span>
            Fin horizonte{" "}
            <span
              className={`font-medium tabular-nums ${
                last.balance < 0 ? "text-status-danger-fg" : "text-ds-text-1"
              }`}
            >
              {fmtClp(last.balance)}
            </span>
            <span className="text-ds-text-4">
              {" "}
              · {last.label} {fmtDayMonth(last.weekStart)}
            </span>
          </span>
        )}
        <span className="text-ds-text-4">
          Semanas bajo colchón {below} de {weeks.length}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-ds-text-4">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-0.5 w-3"
            style={{ background: TOKEN.text3 }}
          />
          Histórico
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-0.5 w-3"
            style={{ background: TOKEN.primary }}
          />
          Proyección
        </span>
        {showFlow && (
          <>
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm opacity-40"
                style={{ background: TOKEN.ok }}
              />
              Ingresos
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm opacity-40"
                style={{ background: TOKEN.danger }}
              />
              Egresos
            </span>
          </>
        )}
      </div>

      <table className="sr-only">
        <caption>Serie de saldo proyectado por semana</caption>
        <thead>
          <tr>
            <th>Semana</th>
            <th>Saldo</th>
            <th>Ingresos</th>
            <th>Egresos</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart}>
              <td>
                {w.label} {fmtDayMonth(w.weekStart)}
              </td>
              <td>{fmtClp(w.balance)}</td>
              <td>{fmtClp(w.inflow)}</td>
              <td>{fmtClp(w.outflow)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
