import { getAppVersion } from "@/lib/app-version";
import { IncidentesClient } from "@/components/fiscalizacion-dt/IncidentesClient";

export default function IncidentesPage() {
  return <IncidentesClient version={getAppVersion()} />;
}
