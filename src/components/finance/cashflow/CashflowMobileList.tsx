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
import { CashflowDriftBanner } from "./CashflowDriftBanner";
import { CashflowMobileWeeklyNav } from "./CashflowMobileWeeklyNav";
import { CashflowMobileWeeklyTable } from "./CashflowMobileWeeklyTable";
import { findTodayBucketIdx } from "./cashflow-mobile-3w-helpers";
import { useHasCapability } from "@/lib/permissions-context";
import { subMonths } from "date-fns";
import { hydrateProjection } from "./cashflow-mobile-helpers";
import { filterRowBySearch } from "./cashflow-search";

const MONTHS_BACK = 2;

export { getBucketDisplayLabel } from "./cashflow-mobile-helpers";

interface Props {
  initialProjection: ProjectionMatrix;
  defaultWeeks: number;
  defaultMonths: number;
  canManage: boolean;
  /** Texto del buscador (Bloque 6 Fase 4). Filtra filas por categoría,
   *  nombre de item, nickname, cliente CRM e instalación. Vive en
   *  CashflowTabs para preservarse entre vistas. */
  searchTerm?: string;
}

export function CashflowMobileList({
  initialProjection,
  defaultWeeks,
  defaultMonths,
  canManage,
  searchTerm = "",
}: Props) {
  // defaultWeeks queda en la API por contrato con CashflowTabs. La proyección
  // semanal arranca con la ya hidratada del server.
  void defaultWeeks;

  const router = useRouter();
  // Granularidad — semanal por default en móvil (matchea expectativa del usuario).
  const [granularity, setGranularity] = useState<"weekly" | "monthly">("weekly");

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
    const today = new Date();
    // Arrancar `MONTHS_BACK` meses atrás para permitir retroceder con el
    // navegador (simétrico con el semanal, que ya viene con weeksBack=2 del
    // server).
    const fromStr = subMonths(today, MONTHS_BACK).toISOString().slice(0, 10);
    const to = new Date();
    to.setMonth(to.getMonth() + defaultMonths);
    const toStr = to.toISOString().slice(0, 10);
    setLoading(true);
    fetch(
      `/api/finance/cashflow/projection?from=${fromStr}&to=${toStr}&granularity=monthly`,
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

  function gotoPrev() {
    if (activeIdx > 0) setActiveBucketKey(projection.buckets[activeIdx - 1].key);
  }
  function gotoNext() {
    if (activeIdx >= 0 && activeIdx < projection.buckets.length - 1) {
      setActiveBucketKey(projection.buckets[activeIdx + 1].key);
    }
  }
  function gotoToday() {
    const idx = findTodayBucketIdx(projection.buckets);
    if (projection.buckets[idx]) setActiveBucketKey(projection.buckets[idx].key);
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

  // Bloque 6 Fase 4: filtra rows por searchTerm + recorta items por
  // cliente/instalación/contrato. Si el filtro es vacío, pasan todas
  // sin recortes. Re-evaluamos con searchTerm en deps.
  const incomeRows = useMemo(
    () =>
      projection.rows
        .filter((r) => r.kind === "INCOME")
        .map((r) => filterRowBySearch(r, searchTerm))
        .filter((r): r is NonNullable<typeof r> => r !== null),
    [projection.rows, searchTerm],
  );
  const expenseRows = useMemo(
    () =>
      projection.rows
        .filter((r) => r.kind === "EXPENSE")
        .map((r) => filterRowBySearch(r, searchTerm))
        .filter((r): r is NonNullable<typeof r> => r !== null),
    [projection.rows, searchTerm],
  );

  const filteredProjection = useMemo((): ProjectionMatrix => {
    if (!searchTerm) return projection;
    const filteredRows = projection.rows
      .map((r) => filterRowBySearch(r, searchTerm))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    return { ...projection, rows: filteredRows };
  }, [projection, searchTerm]);

  const [drawerTarget, setDrawerTarget] = useState<DrawerItemTarget | null>(
    null,
  );
  const [bankAdjustOpen, setBankAdjustOpen] = useState(false);
  const canEditBalance = useHasCapability("banking_manage");
  const isActiveBucketCurrent = activeIdx >= 0 && activeIdx === currentBucketIdx;

  // Acordeón mutuamente exclusivo: solo una sección abierta a la vez.
  const [openSection, setOpenSection] = useState<"income" | "expense" | null>(
    "income",
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem("cashflow.mobile.openSection");
    if (v === "income" || v === "expense") setOpenSection(v);
    else if (v === "none") setOpenSection(null);
  }, []);
  function toggleSection(s: "income" | "expense") {
    setOpenSection((prev) => {
      const next = prev === s ? null : s;
      try {
        window.localStorage.setItem(
          "cashflow.mobile.openSection",
          next ?? "none",
        );
      } catch {
        // ignore
      }
      return next;
    });
  }

  const cumulativePoint = useMemo(
    () =>
      projection.cumulativePoints.find((p) => p.bucketKey === activeBucketKey),
    [projection.cumulativePoints, activeBucketKey],
  );

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      {/* Franja sticky: segmented + navegador, anclados bajo la topbar fija. */}
      <div
        className="sticky z-20 -mx-4 px-4 py-2 space-y-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border"
        style={{ top: "calc(3rem + env(safe-area-inset-top, 0px))" }}
      >
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

        {granularity === "monthly" && activeBucket && (
          <CashflowMobileBucketHeader
            bucket={activeBucket}
            granularity={granularity}
            hasPrev={activeIdx > 0}
            hasNext={activeIdx >= 0 && activeIdx < projection.buckets.length - 1}
            isCurrent={isActiveBucketCurrent}
            onPrev={gotoPrev}
            onNext={gotoNext}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          />
        )}
      </div>

      {loading && (
        <p className="text-[12px] text-ds-text-3">Cargando proyección…</p>
      )}

      {granularity === "weekly" && activeBucket && (
        <>
          {isActiveBucketCurrent && cumulativePoint && (
            <CashflowDriftBanner
              driftClp={cumulativePoint.cumulativeBankVarianceClp}
              onCreateAdjustment={(amount) => {
                router.push(
                  `/finanzas/flujo-caja?quick=adjustment&amount=${Math.round(amount)}`,
                );
              }}
            />
          )}

          <CashflowMobileWeeklyNav
            activeBucket={activeBucket}
            isCurrent={isActiveBucketCurrent}
            hasPrev={activeIdx > 0}
            hasNext={activeIdx >= 0 && activeIdx < projection.buckets.length - 1}
            onPrev={gotoPrev}
            onNext={gotoNext}
            onToday={gotoToday}
          />

          <CashflowMobileWeeklyTable
            projection={filteredProjection}
            activeBucketKey={activeBucketKey}
            canManage={canManage}
            onTapCell={setDrawerTarget}
          />
        </>
      )}

      {granularity === "monthly" && activeBucket && (
        <>
          {isActiveBucketCurrent && cumulativePoint && (
            <CashflowDriftBanner
              driftClp={cumulativePoint.cumulativeBankVarianceClp}
              onCreateAdjustment={(amount) => {
                router.push(
                  `/finanzas/flujo-caja?quick=adjustment&amount=${Math.round(amount)}`,
                );
              }}
            />
          )}

          <CashflowMobileSection
            title="Ingresos"
            tone="ok"
            rows={incomeRows}
            bucketKey={activeBucket.key}
            emptyText="Sin ingresos proyectados en este período"
            canManage={canManage}
            onOpenItem={setDrawerTarget}
            expanded={openSection === "income"}
            onToggle={() => toggleSection("income")}
          />
          <CashflowMobileSection
            title="Egresos"
            tone="warn"
            rows={expenseRows}
            bucketKey={activeBucket.key}
            emptyText="Sin egresos proyectados en este período"
            canManage={canManage}
            onOpenItem={setDrawerTarget}
            expanded={openSection === "expense"}
            onToggle={() => toggleSection("expense")}
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
