import { getAppVersion } from "@/lib/app-version";
import { LoginClient } from "@/components/fiscalizacion-dt/LoginClient";

export default function FiscalizacionDtPage() {
  return <LoginClient version={getAppVersion()} />;
}
