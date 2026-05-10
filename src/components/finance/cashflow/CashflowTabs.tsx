"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { WeeklyMatrix } from "./WeeklyMatrix";
import { MonthlyMatrix } from "./MonthlyMatrix";
import { ItemsList } from "./ItemsList";
import { QuickItemModal } from "./QuickItemModal";
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

  // --- Quick-item modal state ---
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDay, setQuickDay] = useState<number | undefined>(undefined);
  const [quickCategories, setQuickCategories] = useState<CategoryLite[]>([]);

  // Fetch categories once so the modal is ready when needed.
  useEffect(() => {
    fetch("/api/finance/cashflow/categorias")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setQuickCategories(j.data);
      })
      .catch(() => {});
  }, []);

  /** Open the quick-create modal, optionally pre-selecting a day of month. */
  function openQuickFor(dayOfMonth?: number) {
    setQuickDay(dayOfMonth);
    setQuickOpen(true);
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
          <WeeklyMatrix
            initialProjection={initialProjection}
            defaultWeeks={defaultWeeks}
            canManage={canManage}
          />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <MonthlyMatrix defaultMonths={defaultMonths} canManage={canManage} />
        </TabsContent>
        <TabsContent value="items" className="mt-4">
          <ItemsList canManage={canManage} />
        </TabsContent>
      </Tabs>

      <QuickItemModal
        open={quickOpen}
        defaultDayOfMonth={quickDay}
        categories={quickCategories}
        onClose={() => setQuickOpen(false)}
        onCreated={() => {
          setQuickOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
