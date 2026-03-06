"use client";

import { useState, useTransition } from "react";
import { Briefcase, Loader2, Mail, Pencil, Save, Shield, User, X } from "lucide-react";
import { updateDisplayName, updateCargo } from "@/app/(app)/opai/perfil/actions";

interface UserInfoProps {
  user: {
    name: string;
    email: string;
    role: string;
    cargo?: string | null;
  };
}

const roleLabels: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  editor: "Editor",
  solo_documentos: "Solo Documentos",
  solo_crm: "Solo CRM",
  solo_ops: "Solo Ops",
  solo_payroll: "Solo Payroll",
  viewer: "Visualizador",
};

export function UserInfo({ user }: UserInfoProps) {
  const [isPending, startTransition] = useTransition();
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentName, setCurrentName] = useState(user.name ?? "");
  const [draftName, setDraftName] = useState(user.name ?? "");
  const [isEditingCargo, setIsEditingCargo] = useState(false);
  const [currentCargo, setCurrentCargo] = useState(user.cargo ?? "");
  const [draftCargo, setDraftCargo] = useState(user.cargo ?? "");
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const startEditName = () => {
    setStatusMessage(null);
    setDraftName(currentName);
    setIsEditingName(true);
  };

  const cancelEditName = () => {
    setStatusMessage(null);
    setDraftName(currentName);
    setIsEditingName(false);
  };

  const startEditCargo = () => {
    setStatusMessage(null);
    setDraftCargo(currentCargo);
    setIsEditingCargo(true);
  };

  const cancelEditCargo = () => {
    setStatusMessage(null);
    setDraftCargo(currentCargo);
    setIsEditingCargo(false);
  };

  const saveCargo = () => {
    setStatusMessage(null);
    startTransition(async () => {
      const result = await updateCargo(draftCargo);
      if (!result.success) {
        setStatusMessage({
          type: "error",
          message: result.error || "No se pudo actualizar el cargo",
        });
        return;
      }
      const newCargo = result.cargo ?? draftCargo.trim();
      setCurrentCargo(newCargo);
      setDraftCargo(newCargo);
      setIsEditingCargo(false);
      setStatusMessage({
        type: "success",
        message: "Cargo actualizado correctamente",
      });
    });
  };

  const saveName = () => {
    setStatusMessage(null);
    startTransition(async () => {
      const result = await updateDisplayName(draftName);
      if (!result.success) {
        setStatusMessage({
          type: "error",
          message: result.error || "No se pudo actualizar el nombre",
        });
        return;
      }
      const newName = result.name ?? draftName.trim();
      setCurrentName(newName);
      setDraftName(newName);
      setIsEditingName(false);
      setStatusMessage({
        type: "success",
        message: "Nombre actualizado correctamente",
      });
    });
  };

  return (
    <div className="bg-muted rounded-lg border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <User className="h-5 w-5 text-teal-400" />
        Información de la cuenta
      </h2>

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <User className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Nombre</p>
            {!isEditingName ? (
              <button
                type="button"
                onClick={startEditName}
                className="group mt-0.5 inline-flex items-center gap-2 rounded-md border border-transparent px-1 py-0.5 text-left transition-colors hover:border-border hover:bg-accent/40"
                title="Haz clic para cambiar tu nombre"
              >
                <span className="text-foreground font-medium">{currentName}</span>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
              </button>
            ) : (
              <div className="mt-1 space-y-2">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={isPending}
                  maxLength={120}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveName}
                    disabled={isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditName}
                    disabled={isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
            <p className="text-foreground font-medium">{user.email}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Rol</p>
            <p className="text-foreground font-medium">
              {roleLabels[user.role] || user.role}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Cargo</p>
            {!isEditingCargo ? (
              <button
                type="button"
                onClick={startEditCargo}
                className="group mt-0.5 inline-flex items-center gap-2 rounded-md border border-transparent px-1 py-0.5 text-left transition-colors hover:border-border hover:bg-accent/40"
                title="Haz clic para cambiar tu cargo"
              >
                <span className="text-foreground font-medium">
                  {currentCargo || <span className="text-muted-foreground italic">Sin cargo</span>}
                </span>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
              </button>
            ) : (
              <div className="mt-1 space-y-2">
                <input
                  type="text"
                  value={draftCargo}
                  onChange={(e) => setDraftCargo(e.target.value)}
                  disabled={isPending}
                  maxLength={120}
                  placeholder="ej: Gerente Comercial"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveCargo}
                    disabled={isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditCargo}
                    disabled={isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {statusMessage && (
          <div
            className={
              statusMessage.type === "success"
                ? "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400"
                : "rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
            }
          >
            {statusMessage.message}
          </div>
        )}
      </div>
    </div>
  );
}
