import { getAppVersion } from "@/lib/app-version";
import { EmpleadoresClient } from "@/components/fiscalizacion-dt/EmpleadoresClient";

export default function EmpleadoresPage() {
  return <EmpleadoresClient version={getAppVersion()} />;
}
