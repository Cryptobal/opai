import { IncidenteGuardiaDetail } from "@/components/portal/incidentes/IncidenteGuardiaDetail";

export default async function PortalIncidenteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IncidenteGuardiaDetail id={id} />;
}
