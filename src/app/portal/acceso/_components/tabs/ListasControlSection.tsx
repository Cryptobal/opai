"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Search,
  Inbox,
  Building2,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import SkeletonCard from "../ui/SkeletonCard";
import type { AccessControlListEntry } from "@/lib/access-control/types";
import { formatRut } from "@/lib/access-control/utils";

// ── Props ───────────────────────────────────────────────────────────────────

interface ListasControlSectionProps {
  installationId: string;
}

type ListFilter = "all" | "whitelist" | "blacklist";

// ── Component ───────────────────────────────────────────────────────────────

export default function ListasControlSection({
  installationId,
}: ListasControlSectionProps) {
  const [entries, setEntries] = useState<AccessControlListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ListFilter>("all");

  const fetchLists = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/access-control/lists/${installationId}`
      );
      const json = await res.json();
      if (json.success) {
        setEntries(json.data ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // Filter entries
  const filteredEntries = entries.filter((entry) => {
    if (filter === "whitelist" && entry.listType !== "whitelist") return false;
    if (filter === "blacklist" && entry.listType !== "blacklist") return false;

    if (search) {
      const q = search.toLowerCase();
      const matchesName = entry.fullName?.toLowerCase().includes(q);
      const matchesRut = entry.rut?.toLowerCase().includes(q);
      const matchesCompany = entry.company?.toLowerCase().includes(q);
      if (!matchesName && !matchesRut && !matchesCompany) return false;
    }

    return true;
  });

  const whitelistCount = entries.filter(
    (e) => e.listType === "whitelist"
  ).length;
  const blacklistCount = entries.filter(
    (e) => e.listType === "blacklist"
  ).length;

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-48 rounded bg-[#1F2937] animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[#F9FAFB]">
        <Shield className="h-5 w-5 text-[#06B6D4]" />
        Listas de Control
      </h2>

      {/* Summary badges */}
      <div className="flex gap-2">
        <Badge
          variant="outline"
          className="border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]"
        >
          <ShieldCheck className="mr-1 h-3 w-3" />
          {whitelistCount} autorizados
        </Badge>
        <Badge
          variant="outline"
          className="border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]"
        >
          <ShieldX className="mr-1 h-3 w-3" />
          {blacklistCount} bloqueados
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, RUT o empresa..."
          className="pl-9 bg-[#111827] border-[#374151] text-[#F9FAFB] placeholder:text-[#9CA3AF]"
        />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {(
          [
            { key: "all", label: "Todos" },
            { key: "whitelist", label: "Autorizados" },
            { key: "blacklist", label: "Bloqueados" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === key
                ? "bg-[#06B6D4]/20 text-[#06B6D4] border border-[#06B6D4]/40"
                : "bg-[#1F2937] text-[#9CA3AF] border border-[#374151] active:bg-[#374151]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Entries list */}
      {filteredEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#374151] bg-[#111827] py-12 px-4">
          <Inbox className="h-12 w-12 text-[#374151]" />
          <p className="mt-3 text-sm font-medium text-[#9CA3AF]">
            {search || filter !== "all"
              ? "Sin resultados para los filtros aplicados"
              : "No hay entradas en las listas de control"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEntries.map((entry) => {
            const isWhitelist = entry.listType === "whitelist";

            return (
              <div
                key={entry.id}
                className={`rounded-lg border border-l-4 bg-[#111827] p-3 ${
                  isWhitelist
                    ? "border-[#374151] border-l-[#10B981]"
                    : "border-[#374151] border-l-[#EF4444]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${
                          isWhitelist
                            ? "border-[#10B981]/30 text-[#10B981]"
                            : "border-[#EF4444]/30 text-[#EF4444]"
                        }`}
                      >
                        {isWhitelist ? (
                          <ShieldCheck className="mr-1 h-3 w-3" />
                        ) : (
                          <ShieldX className="mr-1 h-3 w-3" />
                        )}
                        {isWhitelist ? "Autorizado" : "Bloqueado"}
                      </Badge>
                      {!entry.isActive && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 border-[#9CA3AF]/30 text-[#9CA3AF]"
                        >
                          Inactivo
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm font-medium text-[#F9FAFB] truncate">
                      {entry.fullName}
                    </p>

                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
                      {entry.rut && <span>{formatRut(entry.rut)}</span>}
                      {entry.company && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {entry.company}
                        </span>
                      )}
                    </div>

                    {entry.blockReason && (
                      <p className="mt-1 text-xs text-[#EF4444] italic">
                        {entry.blockReason}
                      </p>
                    )}

                    {(entry.validFrom || entry.validUntil) && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-[#9CA3AF]">
                        <Calendar className="h-3 w-3" />
                        {entry.validFrom && `Desde ${entry.validFrom}`}
                        {entry.validFrom && entry.validUntil && " — "}
                        {entry.validUntil && `Hasta ${entry.validUntil}`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
