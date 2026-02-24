import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasOpsCapability } from "@/lib/ops-rbac";
import { PageHeader } from "@/components/opai";
import { GuardiaTeIngresoForm } from "@/components/ops/GuardiaTeIngresoForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function GuardiaTeIngresoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/guardias/ingreso-te");
  }

  const canIngresoTe =
    hasOpsCapability(session.user.role, "guardias_manage") ||
    hasOpsCapability(session.user.role, "guardias_te_ingreso");

  if (!canIngresoTe) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Ingreso rápido · Guardia Turno Extra"
        description="Registra un guardia TE para cubrir ausencias. Los datos se guardan en la misma base de guardias con estado Turno Extra."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ficha de ingreso rápido</CardTitle>
          <CardDescription>
            Completa los campos obligatorios. El guardia quedará disponible para asignación en la
            asistencia diaria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GuardiaTeIngresoForm userRole={session.user.role} />
        </CardContent>
      </Card>
    </div>
  );
}
