import { permanentRedirect } from "next/navigation";

export default function LegacyPagosPage() {
  permanentRedirect("/finanzas/rendiciones/pagos");
}
