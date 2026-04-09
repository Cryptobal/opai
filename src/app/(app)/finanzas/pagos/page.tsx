import { redirect } from "next/navigation";

export default function PagosPage() {
  redirect("/finanzas/rendiciones?tab=pagos");
}
