"use client";

import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, UserPlus } from "lucide-react";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface Account {
  id: string;
  name: string;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (channelId: string) => void;
  defaultStatus?: "prospect" | "client_active";
}

export function NewExternalChatModal({ open, onClose, onCreated, defaultStatus }: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedAccount(null);
      setContacts([]);
      setSelectedContactIds([]);
      setCreateError(null);
    }
  }, [open]);

  // Fetch accounts
  useEffect(() => {
    if (!open) return;
    setLoadingAccounts(true);
    const params = new URLSearchParams({ search: debouncedSearch });
    if (defaultStatus) params.set("status", defaultStatus);
    fetch(`/api/crm/accounts?${params}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setAccounts(j.data ?? []); })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, [open, debouncedSearch, defaultStatus]);

  // Fetch contacts when account is selected
  const fetchContacts = useCallback(async (accountId: string) => {
    setLoadingContacts(true);
    try {
      const res = await fetch(`/api/crm/contacts?accountId=${accountId}&portalEnabled=true`);
      const j = await res.json();
      if (j.success) {
        setContacts(j.data ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  const handleSelectAccount = (account: Account) => {
    setSelectedAccount(account);
    setSelectedContactIds([]);
    fetchContacts(account.id);
  };

  const toggleContact = (id: string) =>
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );

  const handleCreate = async () => {
    if (!selectedAccount || !selectedContactIds.length) return;
    setCreating(true);
    try {
      const res = await fetch("/api/chat/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccount.id,
          contactIds: selectedContactIds,
        }),
      });
      const json = await res.json();
      if (json.success) {
        onCreated(json.data.channelId);
        onClose();
      } else {
        setCreateError(json.error ?? "Error al crear el chat");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo chat externo</DialogTitle>
        </DialogHeader>

        {!selectedAccount ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cuenta..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {loadingAccounts ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm"
                    onClick={() => handleSelectAccount(account)}
                  >
                    <div className="font-medium">{account.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{account.status.replace(/_/g, " ")}</div>
                  </button>
                ))}
                {accounts.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">No se encontraron cuentas</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => { setSelectedAccount(null); setContacts([]); }}
            >
              &larr; {selectedAccount.name}
            </button>
            <p className="text-sm font-medium">Seleccionar contactos</p>
            {loadingContacts ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {contacts.map((contact) => {
                  const selected = selectedContactIds.includes(contact.id);
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => toggleContact(contact.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                        selected ? "bg-primary/10 text-primary" : "hover:bg-accent"
                      }`}
                    >
                      <UserPlus className="h-3.5 w-3.5 shrink-0" />
                      <div>
                        <div className="font-medium">{contact.firstName} {contact.lastName}</div>
                        {contact.email && <div className="text-xs text-muted-foreground">{contact.email}</div>}
                      </div>
                    </button>
                  );
                })}
                {contacts.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">No hay contactos con portal activo</p>
                )}
              </div>
            )}
            <Button
              className="w-full"
              disabled={!selectedContactIds.length || creating}
              onClick={handleCreate}
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Crear chat
            </Button>
            {createError && (
              <p className="text-sm text-destructive text-center">{createError}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
