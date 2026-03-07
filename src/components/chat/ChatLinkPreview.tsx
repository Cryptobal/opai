"use client";

import { useEffect, useState } from "react";

interface LinkPreviewData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
}

interface ChatLinkPreviewProps {
  url: string;
}

export function ChatLinkPreview({ url }: ChatLinkPreviewProps) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/chat/unfurl?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success && j.data?.title) {
          setData(j.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading || !data) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 block max-w-sm overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/60 transition-colors group"
    >
      {data.image && (
        <div className="h-32 w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.image}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="px-3 py-2">
        {data.siteName && (
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">
            {data.siteName}
          </p>
        )}
        <p className="text-xs font-medium text-zinc-200 line-clamp-2">
          {data.title}
        </p>
        {data.description && (
          <p className="mt-0.5 text-[11px] text-zinc-400 line-clamp-2">
            {data.description}
          </p>
        )}
      </div>
    </a>
  );
}
