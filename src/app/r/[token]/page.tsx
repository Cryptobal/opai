import { IncidenteError } from "@/lib/incidentes-instalacion/errors";
import { getPublicReportContext } from "@/lib/incidentes-instalacion/create-public";
import { ReportePublicoClient } from "./ReportePublicoClient";
import { ReporteErrorState } from "../_components/ReporteErrorState";

export const dynamic = "force-dynamic";

export default async function ReportePublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  try {
    const context = await getPublicReportContext(token);
    return <ReportePublicoClient token={token} context={context} />;
  } catch (err) {
    const tenantName =
      err instanceof IncidenteError && typeof err.details?.tenantName === "string"
        ? err.details.tenantName
        : null;
    const message =
      err instanceof IncidenteError
        ? err.message
        : "Este QR ya no está vigente.";
    return (
      <ReporteErrorState
        title="Este QR ya no está vigente"
        message={`${message} Contacta a la administración del edificio${tenantName ? ` o a ${tenantName}.` : "."}`}
      />
    );
  }
}
