"use client";

import { SectionHeader } from "@/components/opai-ds";
import { AgendaHubCard } from "@/components/agenda/AgendaHubCard";
import { HubEmailProvider } from "@/components/hub/hub-email-context";
import { RecentEmailCard } from "@/components/hub/RecentEmailCard";
import { TareasHubCard } from "@/components/tareas/TareasHubCard";

export interface ProductividadHomePerms {
  hasAgenda: boolean;
  hasCorreos: boolean;
  hasTareas: boolean;
  canEditTareas: boolean;
}

/**
 * Home de la superficie Productividad — solo Mi día
 * (Agenda → Correos → Tareas). Sin Centro de control ni pulso ERP.
 */
export function ProductividadHomeView({
  perms,
  currentUserId,
}: {
  perms: ProductividadHomePerms;
  currentUserId: string;
}) {
  return (
    <div className="ds-page-enter flex min-w-0 flex-col gap-5">
      <section className="min-w-0 space-y-3" aria-labelledby="prod-my-day">
        <SectionHeader
          title={<span id="prod-my-day">Mi día</span>}
          hint="Agenda, correos y tareas de los próximos días."
        />
        {/* grid-cols-1 explícito: sin él, el track implícito `auto` crece
            al min-content de los textos nowrap (truncate) y las tarjetas
            se salen de la pantalla en móvil. */}
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {perms.hasAgenda && <AgendaHubCard />}
          {perms.hasCorreos && (
            <HubEmailProvider enabled>
              <RecentEmailCard />
            </HubEmailProvider>
          )}
          {perms.hasTareas && (
            <TareasHubCard
              currentUserId={currentUserId}
              canEdit={perms.canEditTareas}
              className="lg:col-span-2"
            />
          )}
        </div>
      </section>
    </div>
  );
}
