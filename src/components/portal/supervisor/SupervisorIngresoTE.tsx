"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { GuardiaTeIngresoForm } from "@/components/ops/GuardiaTeIngresoForm";

interface SupervisorIngresoTEProps {
  onBack: () => void;
  onCreated: () => void;
}

export function SupervisorIngresoTE({ onBack, onCreated }: SupervisorIngresoTEProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">Ingresar guardia TE (persona nueva)</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Registra una persona nueva que no existe en el sistema como guardia de Turno Extra.
      </p>
      <GuardiaTeIngresoForm
        userRole="supervisor"
        compact
        apiUrl="/api/portal/supervisor/ingreso-te"
        navigateOnSuccess={false}
        onSuccess={onCreated}
      />
    </div>
  );
}
