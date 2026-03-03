"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type QuickCreateType =
  | "lead"
  | "account"
  | "contact"
  | "deal"
  | "ticket"
  | "persona"
  | null;

interface QuickCreateModalProps {
  type: QuickCreateType;
  onClose: () => void;
  /** Pre-fill context (e.g., accountId for creating a contact under a specific account) */
  context?: Record<string, string>;
}

const TYPE_CONFIG: Record<
  NonNullable<QuickCreateType>,
  { title: string; apiEndpoint: string; redirectPrefix: string; fields: { key: string; label: string; type?: string; required?: boolean }[] }
> = {
  lead: {
    title: "Nuevo Lead",
    apiEndpoint: "/api/crm/leads",
    redirectPrefix: "/crm/leads/",
    fields: [
      { key: "companyName", label: "Nombre de empresa", required: true },
      { key: "firstName", label: "Nombre contacto" },
      { key: "lastName", label: "Apellido contacto" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Teléfono", type: "tel" },
    ],
  },
  account: {
    title: "Nueva Cuenta",
    apiEndpoint: "/api/crm/accounts",
    redirectPrefix: "/crm/accounts/",
    fields: [
      { key: "name", label: "Nombre de la empresa", required: true },
      { key: "rut", label: "RUT" },
      { key: "industry", label: "Industria" },
    ],
  },
  contact: {
    title: "Nuevo Contacto",
    apiEndpoint: "/api/crm/quick-create/contact",
    redirectPrefix: "/crm/contacts/",
    fields: [
      { key: "firstName", label: "Nombre", required: true },
      { key: "lastName", label: "Apellido", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Teléfono", type: "tel" },
      { key: "roleTitle", label: "Cargo" },
    ],
  },
  deal: {
    title: "Nuevo Negocio",
    apiEndpoint: "/api/crm/quick-create/deal",
    redirectPrefix: "/crm/deals/",
    fields: [
      { key: "title", label: "Nombre del negocio", required: true },
    ],
  },
  ticket: {
    title: "Nuevo Ticket",
    apiEndpoint: "/api/ops/tickets",
    redirectPrefix: "/ops/tickets/",
    fields: [
      { key: "title", label: "Asunto", required: true },
      { key: "description", label: "Descripción" },
    ],
  },
  persona: {
    title: "Nueva Persona",
    apiEndpoint: "",
    redirectPrefix: "/personas/guardias/",
    fields: [],
  },
};

export function QuickCreateModal({ type, onClose, context }: QuickCreateModalProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    return context ? { ...context } : {};
  });

  if (!type) return null;

  const config = TYPE_CONFIG[type];
  if (!config) return null;

  const handleSubmit = async () => {
    const requiredMissing = config.fields
      .filter((f) => f.required)
      .some((f) => !formData[f.key]?.trim());

    if (requiredMissing) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(formData).map(([k, v]) => [k, v?.trim() || null])
      );
      const res = await fetch(config.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear");

      const newId = data.id ?? data.data?.id;
      toast.success(`${config.title} creado`);
      onClose();
      if (newId) {
        router.push(`${config.redirectPrefix}${newId}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {config.fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs">
                {field.label}
                {field.required && " *"}
              </Label>
              <Input
                type={field.type || "text"}
                value={formData[field.key] || ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.label}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
