import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DocumentosLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/documentos");
  // Tabs del módulo en la barra superior (AppShell); layout solo con guard.
  return <div className="min-w-0">{children}</div>;
}
