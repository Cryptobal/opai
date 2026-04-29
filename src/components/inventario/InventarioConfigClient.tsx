"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { InventarioBodegasManager } from "./InventarioBodegasManager";
import { InventarioAuditList } from "./InventarioAuditList";
import { Building2, ClipboardList } from "lucide-react";

interface Props {
  canDelete: boolean;
}

export function InventarioConfigClient({ canDelete }: Props) {
  const [tab, setTab] = useState<"bodegas" | "auditoria">("bodegas");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
      <TabsList className="grid w-full grid-cols-2 sm:w-auto">
        <TabsTrigger value="bodegas" className="gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          Bodegas
        </TabsTrigger>
        <TabsTrigger value="auditoria" className="gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" />
          Auditoría
        </TabsTrigger>
      </TabsList>

      <TabsContent value="bodegas" className="mt-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <InventarioBodegasManager canDelete={canDelete} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="auditoria" className="mt-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <InventarioAuditList />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
