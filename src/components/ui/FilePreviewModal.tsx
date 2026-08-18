"use client";

import { useCallback, useEffect } from "react";
import { Download, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AttachmentPreview } from "@/components/crm/correos/AttachmentPreview";
import { DocumentShareButton } from "@/components/shared/DocumentShareButton";

const IMAGE_MIMES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
]);

const PDF_MIME = "application/pdf";

interface FilePreviewModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    url: string;
    /**
     * URL misma-origen (endpoint autenticado) para leer los bytes: habilita el
     * visor pdf.js compartido (PDF en canvas, imagen, texto, tarjeta tipada) —
     * arregla el PDF en blanco del WebView móvil. Sin previewUrl se conserva el
     * render legacy (iframe/img) para consumidores cross-origin (ops/cpq).
     */
    previewUrl?: string;
    fileName: string;
    mimeType?: string;
}

export function FilePreviewModal({
    open,
    onOpenChange,
    url,
    previewUrl,
    fileName,
    mimeType = "",
}: FilePreviewModalProps) {
    const handleEscape = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") onOpenChange(false);
        },
        [onOpenChange]
    );

    useEffect(() => {
        if (open) {
            document.addEventListener("keydown", handleEscape);
            document.body.style.overflow = "hidden";
        }
        return () => {
            document.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = "";
        };
    }, [open, handleEscape]);

    if (!open) return null;

    const isImage = IMAGE_MIMES.has(mimeType) || /\.(jpe?g|png|gif|webp|svg)$/i.test(url);
    const isPdf = mimeType === PDF_MIME || /\.pdf$/i.test(url);
    const canPreview = isImage || isPdf;

    return (
        <div
            className="fixed inset-0 z-[9999] flex flex-col bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => onOpenChange(false)}
        >
            {/* ── Header bar ── */}
            <div
                className="flex items-center justify-between px-4 py-3 bg-black/60 border-b border-white/10 shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-sm font-medium text-white truncate max-w-[60%]" title={fileName}>
                    {fileName}
                </h3>
                <div className="flex items-center gap-1.5">
                    <DocumentShareButton
                        url={previewUrl || url}
                        filename={fileName}
                        mimeType={mimeType || (isPdf ? PDF_MIME : undefined)}
                        tone="dark"
                        size="md"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-white/80 hover:text-white hover:bg-white/10"
                        asChild
                    >
                        <a
                            href={`/api/files/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(fileName)}`}
                            download={fileName}
                            title="Descargar"
                        >
                            <Download className="h-4 w-4" />
                        </a>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
                        asChild
                    >
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir en nueva pestaña"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
                        onClick={() => onOpenChange(false)}
                        title="Cerrar"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* ── Content ── */}
            <div
                className={cn(
                    "flex-1 min-h-0 overflow-hidden",
                    !previewUrl && "flex items-center justify-center overflow-auto p-4"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {previewUrl ? (
                    <AttachmentPreview url={previewUrl} filename={fileName} mimeType={mimeType} />
                ) : (
                <>
                {isImage && (
                    <img
                        src={url}
                        alt={fileName}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none"
                        draggable={false}
                    />
                )}

                {isPdf && (
                    <iframe
                        src={`${url}#toolbar=1&navpanes=0`}
                        title={fileName}
                        className="w-full h-full max-w-5xl rounded-lg border border-white/10 shadow-2xl bg-white"
                    />
                )}

                {!canPreview && (
                    <div className="text-center space-y-4">
                        <div className="w-20 h-20 mx-auto rounded-2xl bg-white/10 flex items-center justify-center">
                            <ExternalLink className="h-10 w-10 text-white/60" />
                        </div>
                        <p className="text-sm text-white/80">
                            Vista previa no disponible para este tipo de archivo.
                        </p>
                        <div className="flex items-center gap-3 justify-center">
                            <Button variant="secondary" asChild>
                                <a href={url} target="_blank" rel="noopener noreferrer">
                                    Abrir en nueva pestaña
                                </a>
                            </Button>
                            <Button variant="outline" asChild>
                                <a
                                    href={`/api/files/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(fileName)}`}
                                    download={fileName}
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Descargar
                                </a>
                            </Button>
                        </div>
                    </div>
                )}
                </>
                )}
            </div>
        </div>
    );
}
