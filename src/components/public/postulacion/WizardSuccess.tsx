"use client";

import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function WizardSuccess({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="h-14 w-14 text-status-ok-fg" />
        <p className="text-lg font-semibold text-foreground">¡Postulación enviada!</p>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
