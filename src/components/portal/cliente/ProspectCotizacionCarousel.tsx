"use client";

import { useState, useEffect, useRef } from "react";

interface Quote {
  id: string;
  code: string;
  status: string;
  monthlyCost: number;
  currency: string;
  totalPositions: number;
  totalGuards: number;
  name: string | null;
}

interface Props {
  onViewDetail: () => void;
  onChat: () => void;
}

export function ProspectCotizacionCarousel({ onViewDetail, onChat }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/portal/cliente/cotizaciones")
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data?.quotes) ? data.quotes : [];
        setQuotes(arr);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-32 rounded-xl bg-zinc-800/50 mb-6" />;
  if (quotes.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Notification banner */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-400" />
        </span>
        <span className="text-sm font-medium text-white">
          Tienes {quotes.length} cotizaci{quotes.length === 1 ? "on" : "ones"} pendiente{quotes.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Mobile: Horizontal scroll carousel */}
      <div className="md:hidden">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {quotes.map((q) => (
            <CotizacionCard key={q.id} quote={q} onViewDetail={onViewDetail} onChat={onChat} />
          ))}
        </div>
        {quotes.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {quotes.map((_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: Grid */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {quotes.map((q) => (
          <CotizacionCard key={q.id} quote={q} onViewDetail={onViewDetail} onChat={onChat} />
        ))}
      </div>
    </div>
  );
}

function CotizacionCard({ quote, onViewDetail, onChat }: { quote: Quote; onViewDetail: () => void; onChat: () => void }) {
  const displayCost = quote.currency === "UF"
    ? `${quote.monthlyCost?.toLocaleString("es-CL") ?? "\u2014"} UF/mes`
    : `$${quote.monthlyCost?.toLocaleString("es-CL") ?? "\u2014"}/mes`;

  return (
    <div
      className="min-w-[280px] snap-center rounded-xl p-4 border transition-all hover:-translate-y-0.5"
      style={{
        background: "linear-gradient(145deg, #1E293B, #1A2332)",
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs text-zinc-400">{quote.code}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
          Pendiente
        </span>
      </div>
      <div className="text-lg font-bold text-white mb-1">{displayCost}</div>
      <div className="text-xs text-zinc-400 mb-1">{quote.name ?? quote.code}</div>
      <div className="text-xs text-zinc-500 mb-3">
        {quote.totalPositions} puesto{quote.totalPositions !== 1 ? "s" : ""} · {quote.totalGuards} guardia{quote.totalGuards !== 1 ? "s" : ""}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onViewDetail}
          className="flex-1 text-xs font-medium py-2 rounded-lg text-center"
          style={{ background: "linear-gradient(135deg, #2dd4bf, #14b8a6)", color: "#042F2E" }}
        >
          Ver propuesta
        </button>
        <button
          onClick={onChat}
          className="text-xs text-teal-400 border border-teal-400/30 rounded-lg px-3 py-2 hover:bg-teal-400/10 transition-colors"
        >
          Consultar
        </button>
      </div>
    </div>
  );
}
