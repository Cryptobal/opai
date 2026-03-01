import { redirect } from "next/navigation";

export default function RondasProgramacionRedirect() {
  redirect("/ops/rondas/configuracion?tab=programacion");
}
