"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/opai-ds";
import { EventoFormFields } from "./evento/EventoFormFields";
import { ContactsField } from "./nueva-visita/ContactsField";
import { useNuevaVisita } from "./nueva-visita/useNuevaVisita";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dealId?: string | null;
  accountId?: string | null;
  installationId?: string | null;
  editEventId?: string | null;
  onCreated?: () => void;
};

export function NuevaVisitaModal(props: Props) {
  const { open, onOpenChange, editEventId } = props;
  const {
    form,
    users,
    currentUserId,
    loading,
    saving,
    error,
    canSubmit,
    submitHint,
    submit,
    applyEventoPatch,
    eventoValue,
  } = useNuevaVisita(props);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {editEventId ? "Editar evento" : "Agendar"}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[min(70vh,640px)] min-w-0 w-full space-y-3 overflow-y-auto pr-1 -mr-1">
          {loading ? (
            <Spinner className="mx-auto py-8" />
          ) : (
            <>
              <EventoFormFields
                value={eventoValue}
                onChange={applyEventoPatch}
                users={users}
                currentUserId={currentUserId}
                density="default"
                showContextPickers
                installationLocation={
                  form.installationId
                    ? {
                        address: form.installationAddress || null,
                        lat: form.installationLat,
                        lng: form.installationLng,
                      }
                    : null
                }
              />
              {form.account?.id && (
                <ContactsField
                  accountId={form.account.id}
                  selected={form.contactIds}
                  onChange={(ids) => applyEventoPatch({ contactIds: ids })}
                />
              )}
            </>
          )}

          {error && <p className="text-[12px] text-status-danger-fg">{error}</p>}
        </div>

        <div className="flex flex-col items-end gap-1.5 border-t border-ds-border-default pt-3">
          {!canSubmit && submitHint ? (
            <p className="w-full text-right text-[12px] text-ds-text-4">{submitHint}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={saving || !canSubmit} onClick={() => void submit()}>
              {saving ? "Guardando…" : editEventId ? "Guardar" : "Agendar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
