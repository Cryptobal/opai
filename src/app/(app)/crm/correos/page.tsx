import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { CorreosClient } from "@/components/crm/correos/CorreosClient";

export const metadata = { title: "Correos · Productividad" };

export default async function CorreosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/correos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "productividad", "correos")) {
    redirect("/hub");
  }

  return <CorreosClient />;
}
