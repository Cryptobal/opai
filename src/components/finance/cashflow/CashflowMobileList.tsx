"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Surface } from "@/components/opai-ds";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { CashflowItemDrawer, type DrawerItemTarget } from "./CashflowItemDrawer";
import { CashflowMobileSection } from "./CashflowMobileSection";
import {
  CashflowMobileBucketHeader,
  CashflowMobileBucketSummary,
} from "./CashflowMobileBucketHeader";
import { BankBalanceAdjustDrawer } from "./BankBalanceAdjustDrawer";
import { useHasCapability } from "@/lib/permissions-context";
import {
  getChipLabel,
  hydrateProjection,
} from "./cashflow-mobile-helpers";

export { getBucketDisplayLabel, getChipLabel } from "./cashflow-mobile-helpers";

interface Props {
  initialProjection: ProjectionMatrix;
  defaultWeeks: number;
  defaultMonths: number;
  canManage: boolean;
}

export function CashflowMobileList({
  initialProjection,
  defaultWeeks,
  defaultMonths,
  canManage,
}: Props) {
  // defaultWeeks queda en la API por contrato con CashflowTabs. La proyección
  // semanal arranca con la ya hidratada del server.
  void defaultWeeks;

  const router = useRouter();
  // Granularidad — mensual por default en móvil (menos buckets que swipear).
  const [granularity, setGranularity] = useState<"weekly" | "monthly">("monthly");

  // Cache de proyecciones por granularidad. Weekly arranca con la del server.
  const hydratedWeekly = useMemo(
    () => hydrateProjection(initialProjection),
    [initialProjection],
  );
  const [weeklyProjection, setWeeklyProjection] =
    useState<ProjectionMatrix>(hydratedWeekly);
  const [monthlyProjection, setMonthlyProjection] =
    useState<ProjectionMatrix | null>(null);
  const [loading, setLoading] = useState(false);

  // Cuando llega proyección nueva del server (router.refresh), reseteamos
  // weekly al estado fresco. Monthly se re-fetchea bajo demanda.
  useEffect(() => {
    setWeeklyProjection(hydratedWeekly);
    setMonthlyProjection(null);
  }, [hydratedWeekly]);

  // Fetch monthly on demand (primera vez que el usuario cambia a mensual).
  useEffect(() => {
    if (granularity !== "monthly" || monthlyProjection !== null) return;
    const today = new Date().toISOString().slice(0, 10);
    const to = new Date();
    to.setMonth(to.getMonth() + defaultMonths);
    const toStr = to.toISOString().slice(0, 10);
    setLoading(true);
    fetch(
      `/api/finance/cashflow/projection?from=${today}&to=${toStr}&granularity=monthly`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && j.data) {
          setMonthlyProjection(hydrateProjection(j.data));
        }
      })
      .finally(() => setLoading(false));
  }, [granularity, monthlyProjection, defaultMonths]);

  const projection: ProjectionMatrix =
    granularity === "monthly" && monthlyProjection
      ? monthlyProjection
      : weeklyProjection;

  const todayMs = useMemo(() => Date.now(), []);

  const currentBucketIdx = useMemo(() => {
    const idx = projection.buckets.findIndex(
      (b) => b.start.getTime() <= todayMs && todayMs <= b.end.getTime(),
    );
    if (idx >= 0) return idx;
    // Si todos los buckets son pasados/futuros, fallback razonable.
    const future = projection.buckets.findIndex(
      (b) => b.start.getTime() >= todayMs,
    );
    if (future >= 0) return future;
    return Math.max(0, projection.buckets.length - 1);
  }, [projection.buckets, todayMs]);

  const [activeBucketKey, setActiveBucketKey] = useState<string | null>(null);
  useEffect(() => {
    if (projection.buckets[currentBucketIdx]) {
      setActiveBucketKey(projection.buckets[currentBucketIdx].key);
    }
  }, [projection.buckets, currentBucketIdx]);

  const activeBucket = useMemo(
    () => projection.buckets.find((b) => b.key === activeBucketKey) ?? null,
    [projection.buckets, activeBucketKey],
  );
  const activeIdx = useMemo(
    () => projection.buckets.findIndex((b) => b.key === activeBucketKey),
    [projection.buckets, activeBucketKey],
  );

  // Auto-scroll del chip strip al bucket "Hoy" al mount / cuando cambia.
  const chipStripRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!activeBucketKey) return;
    if (hasAutoScrolled.current === activeBucketKey) return;
    const strip = chipStripRef.current;
    if (!strip) return;
    const chip = strip.querySelector<HTMLButtonElement>(
      `[data-bucket-key="${activeBucketKey}"]`,
    );
    if (!chip) return;
    const left =
      chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2;
    // jsdom no implementa scrollTo; fallback a scrollLeft directo.
    if (typeof strip.scrollTo === "function") {
      strip.scrollTo({ left: Math.max(0, left), behavior: "auto" });
    } else {
      strip.scrollLeft = Math.max(0, left);
    }
    hasAutoScrolled.current = activeBucketKey;
  }, [activeBucketKey]);

  function gotoPrev() {
    if (activeIdx > 0) setActiveBucketKey(projection.buckets[activeIdx - 1].key);
  }
  function gotoNext() {
    if (activeIdx >= 0 && activeIdx < projection.buckets.length - 1) {
      setActiveBucketKey(projection.buckets[activeIdx + 1].key);
    }
  }

  // Swipe gesture en el card del bucket: > 60px de delta → cambia bucket.
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const dx = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 60) return;
    if (dx > 0) gotoPrev();
    else gotoNext();
  };

  const incomeRows = useMemo(
    () => projection.rows.filter((r) => r.kind === "INCOME"),
    [projection.rows],
  );
  const expenseRows = useMemo(
    () => projection.rows.filter((r) => r.kind === "EXPENSE"),
    [projection.rows],
  );

  const [drawerTarget, setDrawerTarget] = useState<DrawerItemTarget | null>(
    null,
  );
  const [bankAdjustOpen, setBankAdjustOpen] = useState(false);
  const canEditBalance = useHasCapability("banking_manage");
  const isActiveBucketCurrent = activeIdx >= 0 && activeIdx === currentBucketIdx;

  const cumulativePoint = useMemo(
    () =>
      projection.cumulativePoints.find((p) => p.bucketKey === activeBucketKey),
    [projection.cumulativePoints, activeBucketKey],
  );

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      {/* Granularidad — segmented control */}
      <div className="inline-flex w-full rounded-ds-md border border-border p-1 bg-muted/30">
        <button
          type="button"
          onClick={() => setGranularity("monthly")}
          className={`flex-1 h-10 text-[13px] rounded-ds-sm transition-colors ${
            granularity === "monthly"
              ? "bg-card font-semibold text-ds-text-1 shadow-sm"
              : "text-ds-text-3"
          }`}
          aria-pressed={granularity === "monthly"}
        >
          Mensual
        </button>
        <button
          type="button"
          onClick={() => setGranularity("weekly")}
          className={`flex-1 h-10 text-[13px] rounded-ds-sm transition-colors ${
            granularity === "weekly"
              ? "bg-card font-semibold text-ds-text-1 shadow-sm"
              : "text-ds-text-3"
          }`}
          aria-pressed={granularity === "weekly"}
        >
          Semanal
        </button>
      </div>

      {/* Chips de buckets — scroll horizontal */}
      <div
        ref={chipStripRef}
        className="-mx-4 px-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1"
        role="tablist"
        aria-label="Selector de bucket"
      >
        {projection.buckets.map((b, idx) => {
          const isActive = b.key === activeBucketKey;
          const isToday = idx === currentBucketIdx;
          return (
            <button
              key={b.key}
              type="button"
              data-bucket-key={b.key}
              onClick={() => setActiveBucketKey(b.key)}
              role="tab"
              aria-selected={isActive}
              className={`shrink-0 h-9 px-3 rounded-ds-md text-[12px] font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-ds-text-2 hover:bg-muted/60"
              }`}
            >
              <span>{getChipLabel(b, granularity)}</span>
              {isToday && (
                <span
                  className={`text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-ds-sm ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-status-info-soft text-status-info-fg"
                  }`}
                >
                  Hoy
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading && (
        <p className="text-[12px] text-ds-text-3">Cargando proyección…</p>
      )}

      {activeBucket && (
        <>
          <CashflowMobileBucketHeader
            bucket={activeBucket}
            granularity={granularity}
            hasPrev={activeIdx > 0}
            hasNext={activeIdx >= 0 && activeIdx < projection.buckets.length - 1}
            onPrev={gotoPrev}
            onNext={gotoNext}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          />

          <CashflowMobileSection
            title="Ingresos"
            tone="ok"
            storageKey="cashflow.ingresos.expanded"
            rows={incomeRows}
            bucketKey={activeBucket.key}
            emptyText="Sin ingresos proyectados en este período"
            canManage={canManage}
            onOpenItem={setDrawerTarget}
          />
          <CashflowMobileSection
            title="Egresos"
            tone="warn"
            storageKey="cashflow.egresos.expanded"
            rows={expenseRows}
            bucketKey={activeBucket.key}
            emptyText="Sin egresos proyectados en este período"
            canManage={canManage}
            onOpenItem={setDrawerTarget}
          />

          <CashflowMobileBucketSummary
            bucket={activeBucket}
            cumulativePoint={cumulativePoint}
            onAdjustBalance={
              isActiveBucketCurrent && canEditBalance
                ? () => setBankAdjustOpen(true)
                : undefined
            }
          />
        </>
      )}

      <CashflowItemDrawer
        target={drawerTarget}
        granularity={granularity}
        buckets={projection.buckets}
        canManage={canManage}
        onOpenChange={(o) => {
          if (!o) setDrawerTarget(null);
        }}
        onActionDone={() => {
          setDrawerTarget(null);
          router.refresh();
        }}
      />

      <BankBalanceAdjustDrawer
        open={bankAdjustOpen}
        onClose={() => setBankAdjustOpen(false)}
        onSaved={() => {
          setBankAdjustOpen(false);
          router.refresh();
        }}
      />
    </Surface>
  );
}
