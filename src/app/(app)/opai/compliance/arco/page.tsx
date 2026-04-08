import { Metadata } from "next";
import { ArcoAdminClient } from "@/components/compliance/ArcoAdminClient";

export const metadata: Metadata = {
  title: "Solicitudes ARCO — Cumplimiento",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ArcoAdminPage() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Solicitudes ARCO (Ley 21.719)</h1>
        <p className="text-sm text-muted-foreground">
          Derechos de acceso, rectificación, cancelación y oposición de los titulares de
          datos. Plazo legal de respuesta: 30 días desde la solicitud.
        </p>
      </div>
      <ArcoAdminClient />
    </div>
  );
}
