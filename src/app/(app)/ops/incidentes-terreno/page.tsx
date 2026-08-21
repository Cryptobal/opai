import { redirect } from "next/navigation";

export default function IncidentesTerrenoPage() {
  redirect("/ops/tickets?type=incidente-instalacion");
}
