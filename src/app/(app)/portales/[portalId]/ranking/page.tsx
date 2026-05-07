'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Eye, LogIn, Search, Users, Building2,
  MapPin, Calendar, Route, Ticket, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHero } from '@/components/opai-ds';
import { Trophy } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

const PORTAL_LABELS: Record<string, string> = {
  guardia: 'Portal Guardia',
  rondas: 'Portal Rondas',
  cliente: 'Portal de Clientes',
};

const VALID_PORTALS = ['guardia', 'rondas', 'cliente'];

const DAYS_OPTIONS = [
  { value: 7, label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
  { value: 365, label: '1 año' },
];

interface RankingEntry {
  userId: string;
  userName: string;
  userCode?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  isProspect?: boolean;
  installationId?: string | null;
  installationName?: string | null;
  totalActions: number;
  totalLogins?: number;
  totalTickets?: number;
  totalQuoteViews?: number;
  actionLabel?: string;
  lastAccessAt: string | null;
}

export default function PortalRankingPage() {
  const params = useParams();
  const router = useRouter();
  const portalId = params.portalId as string;

  const [data, setData] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');

  const portalLabel = PORTAL_LABELS[portalId] ?? portalId;
  const isValid = VALID_PORTALS.includes(portalId);

  useEffect(() => {
    if (!isValid) { setLoading(false); return; }
    setLoading(true);
    const sp = new URLSearchParams({ portal: portalId, days: String(days) });
    fetch(`/api/portales/ranking?${sp}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setData(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [portalId, days, isValid]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (r) =>
        r.userName.toLowerCase().includes(q) ||
        r.accountName?.toLowerCase().includes(q) ||
        r.installationName?.toLowerCase().includes(q) ||
        r.userCode?.toLowerCase().includes(q)
    );
  }, [data, search]);

  if (!isValid) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/portales')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <p className="text-sm text-muted-foreground">Este portal no tiene ranking disponible.</p>
      </div>
    );
  }

  const descriptionMap: Record<string, string> = {
    rondas: `Guardias con más rondas ejecutadas (últimos ${days} días)`,
    guardia: `Guardias más activos en el portal (últimos ${days} días)`,
    cliente: `Contactos más activos en el portal (últimos ${days} días)`,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/portales')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHero
          icon={<Trophy />}
          iconTone="sky"
          title={`Ranking — ${portalLabel}`}
          subtitle={`últimos ${days} días`}
          description={descriptionMap[portalId]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={
              portalId === 'cliente'
                ? 'Buscar cliente o contacto...'
                : 'Buscar guardia o instalación...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          {DAYS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={days === opt.value ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sin datos de actividad en este periodo.</p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-border bg-card overflow-hidden">
          <RankingTable portalId={portalId} entries={filtered} />
        </div>
      )}
    </div>
  );
}

function RankingTable({ portalId, entries }: { portalId: string; entries: RankingEntry[] }) {
  if (portalId === 'rondas') return <RondasTable entries={entries} />;
  if (portalId === 'guardia') return <GuardiaTable entries={entries} />;
  if (portalId === 'cliente') return <ClienteTable entries={entries} />;
  return null;
}

function RondasTable({ entries }: { entries: RankingEntry[] }) {
  return (
    <>
      <div className="bg-muted/30 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground grid"
        style={{ gridTemplateColumns: '32px 1.5fr 1fr 80px 100px' }}
      >
        <span>#</span>
        <span>Guardia</span>
        <span>Instalación</span>
        <span className="text-center">Rondas</span>
        <span className="text-right">Última ronda</span>
      </div>
      {entries.map((e, idx) => (
        <div key={e.userId} className="px-4 py-2.5 border-b border-border/50 grid items-center hover:bg-accent/10 transition-colors"
          style={{ gridTemplateColumns: '32px 1.5fr 1fr 80px 100px' }}
        >
          <RankNumber idx={idx} />
          <div className="flex items-center gap-1.5 min-w-0">
            <Users className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <span className="text-sm font-medium truncate">{e.userName}</span>
            {e.userCode && <span className="text-xs text-muted-foreground">({e.userCode})</span>}
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <MapPin className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{e.installationName ?? '—'}</span>
          </div>
          <span className="flex items-center justify-center gap-1 text-sm tabular-nums text-muted-foreground">
            <Route className="h-3 w-3" /> {e.totalActions}
          </span>
          <span className="text-right text-xs text-muted-foreground">
            {e.lastAccessAt ? timeAgo(e.lastAccessAt) : '—'}
          </span>
        </div>
      ))}
    </>
  );
}

function GuardiaTable({ entries }: { entries: RankingEntry[] }) {
  return (
    <>
      <div className="bg-muted/30 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground grid"
        style={{ gridTemplateColumns: '32px 1.5fr 1fr 80px 80px 100px' }}
      >
        <span>#</span>
        <span>Guardia</span>
        <span>Instalación</span>
        <span className="text-center">Ingresos</span>
        <span className="text-center">Tickets</span>
        <span className="text-right">Último acceso</span>
      </div>
      {entries.map((e, idx) => (
        <div key={e.userId} className="px-4 py-2.5 border-b border-border/50 grid items-center hover:bg-accent/10 transition-colors"
          style={{ gridTemplateColumns: '32px 1.5fr 1fr 80px 80px 100px' }}
        >
          <RankNumber idx={idx} />
          <div className="flex items-center gap-1.5 min-w-0">
            <Users className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <span className="text-sm font-medium truncate">{e.userName}</span>
            {e.userCode && <span className="text-xs text-muted-foreground">({e.userCode})</span>}
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <MapPin className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{e.installationName ?? '—'}</span>
          </div>
          <span className="flex items-center justify-center gap-1 text-sm tabular-nums text-muted-foreground">
            <LogIn className="h-3 w-3" /> {e.totalLogins ?? 0}
          </span>
          <span className="flex items-center justify-center gap-1 text-sm tabular-nums text-muted-foreground">
            <Ticket className="h-3 w-3" /> {e.totalTickets ?? 0}
          </span>
          <span className="text-right text-xs text-muted-foreground">
            {e.lastAccessAt ? timeAgo(e.lastAccessAt) : '—'}
          </span>
        </div>
      ))}
    </>
  );
}

function ClienteTable({ entries }: { entries: RankingEntry[] }) {
  return (
    <>
      <div className="bg-muted/30 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground grid"
        style={{ gridTemplateColumns: '32px 1.5fr 1fr 80px 80px 100px' }}
      >
        <span>#</span>
        <span>Empresa</span>
        <span>Contacto</span>
        <span className="text-center">Acciones</span>
        <span className="text-center">Cotizaciones</span>
        <span className="text-right">Último acceso</span>
      </div>
      {entries.map((e, idx) => (
        <div key={e.userId} className="px-4 py-2.5 border-b border-border/50 grid items-center hover:bg-accent/10 transition-colors"
          style={{ gridTemplateColumns: '32px 1.5fr 1fr 80px 80px 100px' }}
        >
          <RankNumber idx={idx} />
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <span className="text-sm font-medium truncate">{e.accountName ?? '—'}</span>
            {e.isProspect && (
              <Badge variant="outline" className="text-xs h-4 px-1 border-status-warn-border text-status-warn-fg shrink-0">
                Prospecto
              </Badge>
            )}
          </div>
          <span className="text-sm text-muted-foreground truncate">{e.userName}</span>
          <span className="flex items-center justify-center gap-1 text-sm tabular-nums text-muted-foreground">
            <Activity className="h-3 w-3" /> {e.totalActions}
          </span>
          <span className="flex items-center justify-center gap-1 text-sm tabular-nums text-muted-foreground">
            <Eye className="h-3 w-3" /> {e.totalQuoteViews ?? 0}
          </span>
          <span className="text-right text-xs text-muted-foreground">
            {e.lastAccessAt ? timeAgo(e.lastAccessAt) : '—'}
          </span>
        </div>
      ))}
    </>
  );
}

function RankNumber({ idx }: { idx: number }) {
  return (
    <span className={`text-xs tabular-nums font-medium ${idx < 3 ? 'text-status-info-fg' : 'text-muted-foreground'}`}>
      {idx + 1}
    </span>
  );
}
