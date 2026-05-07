import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ModuleSubNav } from "@/components/opai-ds";

export default async function DocumentosLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/documentos");
  return (
    <div className="space-y-3 min-w-0">
      <ModuleSubNav moduleKey="docs" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
