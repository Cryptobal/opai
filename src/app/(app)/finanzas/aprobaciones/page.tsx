import { permanentRedirect } from "next/navigation";

export default function LegacyAprobacionesPage() {
  permanentRedirect("/finanzas/rendiciones/aprobaciones");
}
