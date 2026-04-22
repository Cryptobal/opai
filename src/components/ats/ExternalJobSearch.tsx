"use client";

import { useState } from "react";
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useExternalJobs } from "@/hooks/useExternalJobs";
import { ExternalJobCard } from "./ExternalJobCard";
import type { ExternalJob } from "@/lib/ats/jooble.service";
import { toast } from "sonner";

export function ExternalJobSearch({
  onImport,
}: {
  onImport?: (job: ExternalJob) => void;
}) {
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const { jobs, loading, error, totalCount, page, hasMore, search, nextPage, prevPage } =
    useExternalJobs();

  function handleKeywordsChange(value: string) {
    setKeywords(value);
    search(value, location);
  }

  function handleLocationChange(value: string) {
    setLocation(value);
    if (keywords) search(keywords, value);
  }

  function handleImport(job: ExternalJob) {
    if (onImport) {
      onImport(job);
    } else {
      toast.info(`Importar: ${job.title} (pendiente de implementación)`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search inputs */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empleos (ej: guardia de seguridad)"
            value={keywords}
            onChange={(e) => handleKeywordsChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Input
          placeholder="Ubicación (ej: Santiago)"
          value={location}
          onChange={(e) => handleLocationChange(e.target.value)}
          className="sm:max-w-[200px]"
        />
      </div>

      {/* Status */}
      {loading && (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Buscando en Jooble...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && keywords && jobs.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No se encontraron resultados para &quot;{keywords}&quot;
        </p>
      )}

      {/* Results */}
      {!loading && jobs.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {totalCount.toLocaleString("es-CL")} resultados encontrados
          </p>

          <div className="space-y-2">
            {jobs.map((job) => (
              <ExternalJobCard
                key={job.externalId}
                job={job}
                onImport={handleImport}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={prevPage}
              disabled={page <= 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {page}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={nextPage}
              disabled={!hasMore}
            >
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
