"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/opai-ds";
import { ShieldAlert } from "lucide-react";
import { formatPersonName } from "@/lib/personas";

type BlacklistItem = {
  id: string;
  isBlacklisted: boolean;
  blacklistReason?: string | null;
  blacklistedAt?: string | null;
  persona: {
    firstName: string;
    lastName: string;
    rut?: string | null;
    phone?: string | null;
    email?: string | null;
  };
};

interface ListaNegraClientProps {
  initialItems: BlacklistItem[];
}

export function ListaNegraClient({ initialItems }: ListaNegraClientProps) {
  const [items, setItems] = useState<BlacklistItem[]>(initialItems);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const removeFromBlacklist = async (item: BlacklistItem) => {
    if (!window.confirm("¿Quitar guardia de lista negra?")) return;
    setUpdatingId(item.id);
    try {
      const response = await fetch(`/api/personas/guardias/${item.id}/lista-negra`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlacklisted: false, reason: null }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo actualizar");
      }
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      toast.success("Guardia removido de lista negra");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo remover de lista negra");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Card>
      <CardContent className="pt-5">
        {items.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Lista negra vacía"
            description="No hay guardias bloqueados actualmente."
            compact
          />
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-status-danger-border bg-status-danger-soft p-3 sm:p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {formatPersonName(item.persona.firstName, item.persona.lastName)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.persona.rut || "Sin RUT"}
                    {item.persona.phone ? ` · ${item.persona.phone}` : ""}
                  </p>
                  {item.blacklistReason && (
                    <p className="mt-1 text-xs text-status-danger-fg">Motivo: {item.blacklistReason}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingId === item.id}
                  onClick={() => void removeFromBlacklist(item)}
                >
                  Quitar bloqueo
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
