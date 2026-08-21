"use client";

import { useRef } from "react";

export type MediaItem = {
  id: string;
  file: File;
  previewUrl: string;
  kind: "image" | "video";
  storageKey?: string;
  progress: number;
  error?: string;
};

export function MediaTray(props: {
  items: MediaItem[];
  max: number;
  onAddFiles: (files: FileList) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {props.items.map((item) => (
          <div
            key={item.id}
            style={{
              position: "relative",
              width: 88,
              height: 88,
              borderRadius: 12,
              overflow: "hidden",
              flex: "0 0 auto",
              background: "#dfe6dc",
            }}
          >
            {item.kind === "video" ? (
              <video src={item.previewUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            {item.progress < 100 && !item.error && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 4,
                  background: "#00000033",
                }}
              >
                <div style={{ width: `${item.progress}%`, height: "100%", background: "var(--rp-brand)" }} />
              </div>
            )}
            <button
              type="button"
              aria-label="Quitar archivo"
              onClick={() => props.onRemove(item.id)}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 28,
                height: 28,
                borderRadius: 99,
                border: 0,
                background: "#121714cc",
                color: "#fff",
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>
        ))}
        {props.items.length < props.max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              width: 88,
              height: 88,
              flex: "0 0 auto",
              borderRadius: 12,
              border: "1.5px dashed var(--rp-line)",
              background: "var(--rp-card)",
              color: "var(--rp-brand)",
              fontWeight: 700,
              fontSize: 22,
            }}
            aria-label="Agregar foto o video"
          >
            +
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#5b675f", margin: "8px 0 0" }}>
        {props.items.length} de {props.max}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) props.onAddFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
