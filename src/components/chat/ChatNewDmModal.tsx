"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";

type AdminUser = {
  id: string;
  name: string;
  email: string;
};

interface ChatNewDmModalProps {
  onClose: () => void;
  onSelectDm: (channelId: string, channelName: string) => void;
}

export function ChatNewDmModal({ onClose, onSelectDm }: ChatNewDmModalProps) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async (query?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      const res = await fetch(`/api/chat/mentions/users?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch users");
      const json = await res.json();
      if (json.success) {
        setUsers(json.data);
      }
    } catch (err) {
      console.error("[ChatNewDmModal] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchUsers(value || undefined);
      }, 300);
    },
    [fetchUsers]
  );

  // Create or open DM
  const handleSelectUser = useCallback(
    async (user: AdminUser) => {
      if (isCreating) return;
      setIsCreating(true);
      try {
        const res = await fetch("/api/chat/dms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetAdminId: user.id }),
        });
        if (!res.ok) throw new Error("Failed to create DM");
        const json = await res.json();
        if (json.success) {
          onSelectDm(json.data.id, user.name);
        }
      } catch (err) {
        console.error("[ChatNewDmModal] create DM error:", err);
      } finally {
        setIsCreating(false);
      }
    },
    [isCreating, onSelectDm]
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-md rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-100">Nuevo mensaje directo</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar usuario..."
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 py-2 pl-8 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
          </div>
        </div>

        {/* User list */}
        <div className="max-h-[300px] overflow-y-auto px-2 pb-3">
          {isLoading && users.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : users.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-500">
              {search ? "Sin resultados" : "Sin usuarios disponibles"}
            </div>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelectUser(user)}
                disabled={isCreating}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-info-soft text-status-info-fg text-xs font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-200 truncate">{user.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
