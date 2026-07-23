import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PortalesLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/portales");
  // Admin-only check is enforced at the page level via existing helpers; the
  // module is rendered with adminOnly:true in the registry, so non-admins
  // never see it in the sidebar. Tabs del módulo en la barra superior.
  return <div className="min-w-0">{children}</div>;
}
