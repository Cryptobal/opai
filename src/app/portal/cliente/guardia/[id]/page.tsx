import { GuardiaDetalleClient } from "@/components/portal/cliente/guardia-detalle/GuardiaDetalleClient";

export const dynamic = "force-dynamic";

export default async function GuardiaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GuardiaDetalleClient guardiaId={id} />;
}
