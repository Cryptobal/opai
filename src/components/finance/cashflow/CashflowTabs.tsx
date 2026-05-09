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
      <TabsList>
        <TabsTrigger value="weekly">Proyección semanal</TabsTrigger>
        <TabsTrigger value="monthly">Proyección mensual</TabsTrigger>
        <TabsTrigger value="items">Movimientos proyectados</TabsTrigger>
      </TabsList>
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
