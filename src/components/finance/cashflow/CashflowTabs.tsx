"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { WeeklyMatrix } from "./WeeklyMatrix";
import { MonthlyMatrix } from "./MonthlyMatrix";
import { ItemsList } from "./ItemsList";
import { QuickItemModal } from "./QuickItemModal";
import { MatrixDnDProvider } from "./MatrixDnDProvider";
import { CashflowMobileList } from "./CashflowMobileList";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";

interface CategoryLite {
  id: string;
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
}

interface Props {
  initialProjection: ProjectionMatrix;
  canManage: boolean;
  defaultWeeks: number;
  defaultMonths: number;
}

export function CashflowTabs({
  initialProjection,
  canManage,
  defaultWeeks,
  defaultMonths,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("weekly");
  // En viewport < sm, la matriz horizontal es ilegible: reemplazamos por
  // el list view mobile-first. La detección es reactiva al resize porque
  // el usuario puede rotar el dispositivo o redimensionar la ventana.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // --- Quick-item modal state ---
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDay, setQuickDay] = useState<number | undefined>(undefined);
  const [quickCategories, setQuickCategories] = useState<CategoryLite[]>([]);
  const [quickDefaultAmount, setQuickDefaultAmount] = useState<number | undefined>(
    undefined,
  );
  const [quickDefaultCategoryId, setQuickDefaultCategoryId] = useState<
    string | undefined
  >(undefined);
  const [quickHint, setQuickHint] = useState<string | undefined>(undefined);

  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Fetch categories once so the modal is ready when needed.
  useEffect(() => {
    fetch("/api/finance/cashflow/categorias")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setQuickCategories(j.data);
      })
      .catch(() => {});
  }, []);

  // Auto-abre el modal con monto + categoría cuando llega desde el banner de
  // cuadratura vía ?quick=adjustment&amount=N. Espera a tener categorías para
  // poder matchear la "Ajuste de saldo" correcta según el signo del drift.
  useEffect(() => {
    const quick = searchParams?.get("quick");
    const amountStr = searchParams?.get("amount");
    if (quick !== "adjustment" || !amountStr) return;
    if (quickCategories.length === 0) return;

    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount === 0) {
      router.replace(pathname);
      return;
    }

    const wantedKind: "INCOME" | "EXPENSE" = amount > 0 ? "INCOME" : "EXPENSE";
    const match = quickCategories.find((c) => {
      if (c.kind !== wantedKind) return false;
      const haystack = `${c.name} ${c.code}`.toLowerCase();
      return haystack.includes("ajuste") && haystack.includes("saldo");
    });

    setQuickDefaultAmount(Math.abs(amount));
    setQuickDefaultCategoryId(match?.id);
    setQuickHint(
      match
        ? `Ajuste de cuadratura: ${amount > 0 ? "ingreso" : "egreso"} para alinear el saldo real con la proyección.`
        : `No encontré una categoría con "ajuste" y "saldo" (${wantedKind === "INCOME" ? "ingreso" : "egreso"}). Crea una en /finanzas/flujo-caja/configurar o selecciona otra.`,
    );
    setQuickDay(undefined);
    setQuickOpen(true);

    router.replace(pathname);
  }, [searchParams, quickCategories, router, pathname]);

  /** Open the quick-create modal, optionally pre-selecting a day of month. */
  function openQuickFor(dayOfMonth?: number) {
    setQuickDay(dayOfMonth);
    setQuickDefaultAmount(undefined);
    setQuickDefaultCategoryId(undefined);
    setQuickHint(undefined);
    setQuickOpen(true);
  }

  function resetQuickDefaults() {
    setQuickDefaultAmount(undefined);
    setQuickDefaultCategoryId(undefined);
    setQuickHint(undefined);
  }

  // ---------------------------------------------------------------------------
  // DnD helpers
  // ---------------------------------------------------------------------------

  function bucketKeyToDate(key: string, granularity: "weekly" | "monthly"): Date {
    if (granularity === "monthly") {
      // key format "YYYY-MM"
      const [yStr, mStr] = key.split("-");
      const y = Number(yStr);
      const m = Number(mStr);
      return new Date(y, m - 1, 5);
    }
    // weekly: "YYYY-Www" (ISO week)
    const wm = key.match(/^(\d{4})-W(\d{1,2})$/);
    if (!wm) return new Date();
    const y = Number(wm[1]);
    const w = Number(wm[2]);
    // First day of ISO week: Jan 4 is always in week 1.
    const jan4 = new Date(y, 0, 4);
    const jan4Dow = jan4.getDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - (jan4Dow - 1));
    const target = new Date(week1Monday);
    target.setDate(week1Monday.getDate() + (w - 1) * 7);
    return target;
  }

  async function handleMoveById(
    occurrenceId: string,
    targetBucketKey: string,
    granularity: "weekly" | "monthly",
  ) {
    const target = bucketKeyToDate(targetBucketKey, granularity);
    const r = await fetch(`/api/finance/cashflow/occurrences/${occurrenceId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newDate: target.toISOString().slice(0, 10) }),
    });
    const j = await r.json();
    if (!j?.success) {
      alert(j?.error ?? "No se pudo mover la ocurrencia");
      return;
    }
    router.refresh();
  }

  async function handleMoveVirtual(
    itemId: string,
    originalDate: string,
    targetBucketKey: string,
    granularity: "weekly" | "monthly",
  ) {
    const target = bucketKeyToDate(targetBucketKey, granularity);
    const r = await fetch(`/api/finance/cashflow/occurrences/upsert-and-act`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move",
        itemId,
        originalDate,
        newDate: target.toISOString().slice(0, 10),
      }),
    });
    const j = await r.json();
    if (!j?.success) {
      alert(j?.error ?? "No se pudo mover la ocurrencia");
      return;
    }
    router.refresh();
  }

  if (isMobile) {
    // DnD por gestos táctiles está fuera del scope de este PR. El
    // MatrixDnDProvider se mantiene como contexto para que cualquier
    // futuro draggable pueda engancharse, pero CashflowMobileList no
    // renderiza chips draggable: el movimiento se hace desde el drawer
    // del item con un selector de bucket destino.
    return (
      <>
        <MatrixDnDProvider
          onMoveById={(id, key) => handleMoveById(id, key, "monthly")}
          onMoveVirtual={(itemId, origDate, key) =>
            handleMoveVirtual(itemId, origDate, key, "monthly")
          }
        >
          <CashflowMobileList
            initialProjection={initialProjection}
            defaultWeeks={defaultWeeks}
            defaultMonths={defaultMonths}
            canManage={canManage}
          />
        </MatrixDnDProvider>
        <QuickItemModal
          open={quickOpen}
          defaultDayOfMonth={quickDay}
          defaultAmount={quickDefaultAmount}
          defaultCategoryId={quickDefaultCategoryId}
          hint={quickHint}
          categories={quickCategories}
          onClose={() => {
            setQuickOpen(false);
            resetQuickDefaults();
          }}
          onCreated={() => {
            setQuickOpen(false);
            resetQuickDefaults();
            router.refresh();
          }}
        />
      </>
    );
  }

  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        {/* Scrollable container for mobile — fades indicate overflow.
            On desktop the tabs render normally. */}
        <div className="flex items-center gap-2 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-hide">
          <TabsList className="h-11 inline-flex w-max min-w-0 shrink-0">
            <TabsTrigger value="weekly" className="text-[13px] sm:text-sm whitespace-nowrap">
              <span className="sm:hidden">Semanal</span>
              <span className="hidden sm:inline">Proyección semanal</span>
            </TabsTrigger>
            <TabsTrigger value="monthly" className="text-[13px] sm:text-sm whitespace-nowrap">
              <span className="sm:hidden">Mensual</span>
              <span className="hidden sm:inline">Proyección mensual</span>
            </TabsTrigger>
            <TabsTrigger value="items" className="text-[13px] sm:text-sm whitespace-nowrap">
              <span className="sm:hidden">Movimientos</span>
              <span className="hidden sm:inline">Movimientos proyectados</span>
            </TabsTrigger>
          </TabsList>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto shrink-0 h-9 text-[13px]"
              onClick={() => openQuickFor()}
            >
              + Nuevo ítem rápido
            </Button>
          )}
        </div>
        <TabsContent value="weekly" className="mt-4">
          <MatrixDnDProvider
            onMoveById={(id, key) => handleMoveById(id, key, "weekly")}
            onMoveVirtual={(itemId, origDate, key) =>
              handleMoveVirtual(itemId, origDate, key, "weekly")
            }
          >
            <WeeklyMatrix
              initialProjection={initialProjection}
              defaultWeeks={defaultWeeks}
              canManage={canManage}
            />
          </MatrixDnDProvider>
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <MatrixDnDProvider
            onMoveById={(id, key) => handleMoveById(id, key, "monthly")}
            onMoveVirtual={(itemId, origDate, key) =>
              handleMoveVirtual(itemId, origDate, key, "monthly")
            }
          >
            <MonthlyMatrix defaultMonths={defaultMonths} canManage={canManage} />
          </MatrixDnDProvider>
        </TabsContent>
        <TabsContent value="items" className="mt-4">
          <ItemsList canManage={canManage} />
        </TabsContent>
      </Tabs>

      <QuickItemModal
        open={quickOpen}
        defaultDayOfMonth={quickDay}
        defaultAmount={quickDefaultAmount}
        defaultCategoryId={quickDefaultCategoryId}
        hint={quickHint}
        categories={quickCategories}
        onClose={() => {
          setQuickOpen(false);
          resetQuickDefaults();
        }}
        onCreated={() => {
          setQuickOpen(false);
          resetQuickDefaults();
          router.refresh();
        }}
      />
    </>
  );
}
