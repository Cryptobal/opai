"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ErpAdminOption = {
  id: string;
  name: string;
  email: string;
};

export function ErpUserPicker({
  value,
  excludeIds,
  disabled,
  onChange,
  compact,
}: {
  value: { id: string; name: string; email: string } | null;
  excludeIds: string[];
  disabled?: boolean;
  onChange: (admin: ErpAdminOption | null) => Promise<void>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [admins, setAdmins] = useState<ErpAdminOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || admins.length > 0) return;
    let cancelled = false;
    setLoading(true);
    void fetch("/api/ops/admins")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "No se pudieron cargar usuarios");
        if (!cancelled) setAdmins((json.data ?? []) as ErpAdminOption[]);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "No se pudieron cargar usuarios");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, admins.length]);

  const options = useMemo(() => {
    const excluded = new Set(excludeIds.filter((id) => id !== value?.id));
    const q = query.trim().toLowerCase();
    return admins.filter((a) => {
      if (excluded.has(a.id)) return false;
      if (!q) return true;
      return `${a.name} ${a.email}`.toLowerCase().includes(q);
    });
  }, [admins, excludeIds, query, value?.id]);

  async function select(next: ErpAdminOption | null) {
    setSaving(true);
    try {
      await onChange(next);
      setOpen(false);
      setQuery("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo vincular");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={
            compact
              ? "h-10 sm:h-9 max-w-full justify-between gap-1 px-2 font-normal"
              : "h-10 sm:h-9 w-full justify-between gap-2 font-normal"
          }
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate text-left text-[13px]">
            {value ? value.email : "Sin usuario"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Input
          className="h-10 sm:h-9 mb-2"
          placeholder="Buscar usuario…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {loading ? (
            <p className="text-[13px] text-ds-text-3 px-2 py-2">Cargando…</p>
          ) : (
            <>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-ds-text-3 hover:bg-ds-surface-2 min-h-[44px] sm:min-h-0"
                disabled={saving}
                onClick={() => void select(null)}
              >
                Sin usuario
              </button>
              {options.map((admin) => (
                <button
                  key={admin.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-ds-surface-2 min-h-[44px] sm:min-h-0"
                  disabled={saving}
                  onClick={() => void select(admin)}
                >
                  <Check
                    className={`h-3.5 w-3.5 shrink-0 ${admin.id === value?.id ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ds-text-1">{admin.name}</span>
                    <span className="block truncate text-[12px] text-ds-text-3">{admin.email}</span>
                  </span>
                </button>
              ))}
              {options.length === 0 && !loading && (
                <p className="text-[13px] text-ds-text-3 px-2 py-2">Sin resultados</p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
