"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X as XIcon } from "lucide-react";

type Photo = {
  id: string;
  url: string;
  alt: string;
  categoryName?: string | null;
};

export function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const prev = useCallback(() => {
    setOpenIndex((i) => (i === null || i === 0 ? photos.length - 1 : i - 1));
  }, [photos.length]);

  const next = useCallback(() => {
    setOpenIndex((i) => (i === null || i === photos.length - 1 ? 0 : i + 1));
  }, [photos.length]);

  // Keyboard navigation
  useEffect(() => {
    if (openIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openIndex, prev, next]);

  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin imágenes adjuntas.</p>;
  }

  const current = openIndex !== null ? photos[openIndex] : null;

  return (
    <>
      {/* Grid: natural aspect ratio thumbnails */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo, idx) => (
          <button
            key={photo.id}
            type="button"
            className="group block overflow-hidden rounded-md border text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpenIndex(idx)}
          >
            {photo.categoryName && (
              <div className="border-b bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {photo.categoryName}
              </div>
            )}
            <img
              src={photo.url}
              alt={photo.alt}
              className="w-full object-contain max-h-64 group-hover:opacity-90 transition-opacity"
            />
          </button>
        ))}
      </div>

      {/* Lightbox overlay */}
      {openIndex !== null && current && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setOpenIndex(null)}
        >
          {/* Prevent click propagation on inner container */}
          <div
            className="relative max-w-5xl max-h-[90vh] w-full px-12 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 text-white hover:bg-white/10"
              onClick={() => setOpenIndex(null)}
            >
              <XIcon className="h-5 w-5" />
            </Button>

            {/* Previous */}
            {photos.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-1 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/10"
                onClick={prev}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
            )}

            {/* Image */}
            <img
              src={current.url}
              alt={current.alt}
              className="max-w-full max-h-[80vh] object-contain rounded"
            />

            {/* Next */}
            {photos.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/10"
                onClick={next}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            )}

            {/* Counter + category */}
            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/60 text-xs">
              {openIndex + 1} / {photos.length}
              {current.categoryName && ` — ${current.categoryName}`}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
