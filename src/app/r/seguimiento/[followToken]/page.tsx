import type { Metadata } from "next";
import { IncidenteError } from "@/lib/incidentes-instalacion/errors";
import { getPublicFollowTimeline } from "@/lib/incidentes-instalacion/timeline";
import { ReporteErrorState } from "../../_components/ReporteErrorState";
import { SeguimientoClient } from "./SeguimientoClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seguimiento del reporte",
  robots: { index: false, follow: false },
};

export default async function SeguimientoPage({
  params,
}: {
  params: Promise<{ followToken: string }>;
}) {
  const { followToken } = await params;
  try {
    const data = await getPublicFollowTimeline(followToken);
    return <SeguimientoClient data={data} />;
  } catch (err) {
    const message =
      err instanceof IncidenteError
        ? err.message
        : "El enlace de seguimiento no es válido o ya no está vigente.";
    return (
      <ReporteErrorState
        title="No encontramos este reporte"
        message={`${message} Si tienes el código, pide ayuda a la administración del edificio.`}
      />
    );
  }
}
