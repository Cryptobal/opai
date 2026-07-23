import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OpsTurnosExtraLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/turnos-extra/registro");
  // Tabs de Turnos Extra en la barra superior (AppShell); layout solo guard.
  return <div className="min-w-0">{children}</div>;
}
