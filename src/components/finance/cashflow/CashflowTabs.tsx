"use client";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WeeklyMatrix } from "./WeeklyMatrix";
import { MonthlyMatrix } from "./MonthlyMatrix";
import { ItemsList } from "./ItemsList";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";

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
  const [tab, setTab] = useState("weekly");
  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      {/* Scrollable container for mobile — fades indicate overflow.
          On desktop the tabs render normally. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-hide">
        <TabsList className="h-11 inline-flex w-max min-w-full sm:w-auto sm:min-w-0">
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
  );
}
