import { getAppVersion } from "@/lib/app-version";
import { ClientesClient } from "@/components/fiscalizacion-dt/ClientesClient";

export default function ClientesPage() {
  return <ClientesClient version={getAppVersion()} />;
}
