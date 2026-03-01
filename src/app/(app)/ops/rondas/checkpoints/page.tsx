import { redirect } from "next/navigation";

export default function RondasCheckpointsRedirect() {
  redirect("/ops/rondas/configuracion?tab=checkpoints");
}
