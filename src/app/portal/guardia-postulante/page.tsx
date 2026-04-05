import { redirect } from "next/navigation";

export default function PortalPostulantePage() {
  // Redirect to registration — the client component handles session check
  redirect("/portal/guardia-postulante/registro");
}
