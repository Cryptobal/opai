"use client";

import { ExternalLink, MapPin, Building2, Clock, DollarSign, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExternalJob } from "@/lib/ats/jooble.service";

function timeAgo(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `Hace ${days} días`;
  return date.toLocaleDateString("es-CL");
}

/** Strip HTML tags to get plain text (Jooble snippets may contain HTML) */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function ExternalJobCard({
  job,
  onImport,
}: {
  job: ExternalJob;
  onImport?: (job: ExternalJob) => void;
}) {
  return (
    <Card className="group hover:border-primary/30 transition-colors">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            {/* Title + source badge */}
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold leading-tight break-words">
                {job.title}
              </h3>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Fuente: Jooble
              </Badge>
              {job.type && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {job.type}
                </Badge>
              )}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {job.company && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {job.company}
                </span>
              )}
              {job.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </span>
              )}
              {job.salary && (
                <span className="inline-flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {job.salary}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo(job.postedAt)}
              </span>
            </div>

            {/* Description snippet (plain text, HTML stripped) */}
            {job.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {stripHtml(job.description)}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 flex-col gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
              <a href={job.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Ver
              </a>
            </Button>
            {onImport && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => onImport(job)}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Importar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
