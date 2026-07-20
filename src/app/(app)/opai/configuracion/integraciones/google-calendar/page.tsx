import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { CalendarDays } from "lucide-react";
import { GoogleCalendarConfigClient } from "@/components/configuracion/google-calendar/GoogleCalendarConfigClient";

export default async function GoogleCalendarIntegrationPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/integraciones/google-calendar");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "integraciones")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Google Calendar"
      description="Conectá tu calendario para sincronizar visitas y licitaciones"
      icon={<CalendarDays className="h-[18px] w-[18px]" />}
      backHref="/opai/configuracion/integraciones"
      backLabel="Integraciones"
    >
      <GoogleCalendarConfigClient />
    </ConfigPageLayout>
  );
}
