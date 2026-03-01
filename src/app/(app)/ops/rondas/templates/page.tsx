import { redirect } from "next/navigation";

export default function RondasTemplatesRedirect() {
  redirect("/ops/rondas/configuracion?tab=plantillas");
}
