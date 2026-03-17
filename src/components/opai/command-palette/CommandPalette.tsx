'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Clock,
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Loader2,
  Users,
  Building2,
  Contact,
  TrendingUp,
  MapPin,
  FileText,
  ShieldUser,
  File,
  CalendarDays,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommandItem } from './types';
import { useCommandPalette } from './use-command-palette';
import { defaultCommands, ICON_MAP, CATEGORY_LABELS } from './commands';
import { useIsMobile } from '@/lib/pwa/use-is-mobile';

// ── Fuzzy matching ──

function fuzzyScore(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();

  // Exact match
  if (lower === q) return 100;
  // Starts with
  if (lower.startsWith(q)) return 90;
  // Contains as substring
  const idx = lower.indexOf(q);
  if (idx !== -1) return 80 - idx * 0.5;
  // Word-start match (e.g. "pm" matches "pauta mensual")
  const words = lower.split(/\s+/);
  const qChars = q.split('');
  let wordIdx = 0;
  let charIdx = 0;
  for (; wordIdx < words.length && charIdx < qChars.length; wordIdx++) {
    if (words[wordIdx][0] === qChars[charIdx]) {
      charIdx++;
    }
  }
  if (charIdx === qChars.length) return 60;

  // Fuzzy: all query chars in order
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 40 - (lower.length - q.length) * 0.2;

  return 0;
}

function getCommandScore(cmd: CommandItem, query: string): number {
  if (!query) return 0;
  const scores = [
    fuzzyScore(cmd.label, query) * 1.5,
    cmd.description ? fuzzyScore(cmd.description, query) * 0.8 : 0,
    ...(cmd.keywords?.map((kw) => fuzzyScore(kw, query)) ?? []),
  ];
  return Math.max(...scores);
}

// ── Highlight matching text ──

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-semibold">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

// ── Search result types ──

type SearchResultType =
  | 'lead' | 'account' | 'contact' | 'deal' | 'quote'
  | 'installation' | 'guardia' | 'document' | 'pauta_mensual' | 'channel';

type ApiSearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  href: string;
  badgeLabel?: string;
  badgeClass?: string;
  imageUrl?: string;
  pinDisplay?: string;
};

const SEARCH_TYPE_CONFIG: Record<SearchResultType, { icon: typeof Users; color: string; bgColor: string; label: string }> = {
  lead:           { icon: Users,        color: 'text-emerald-400', bgColor: 'bg-emerald-400/10', label: 'Lead' },
  account:        { icon: Building2,    color: 'text-blue-400',    bgColor: 'bg-blue-400/10',    label: 'Cuenta' },
  contact:        { icon: Contact,      color: 'text-sky-400',     bgColor: 'bg-sky-400/10',     label: 'Contacto' },
  deal:           { icon: TrendingUp,   color: 'text-purple-400',  bgColor: 'bg-purple-400/10',  label: 'Negocio' },
  quote:          { icon: FileText,     color: 'text-amber-400',   bgColor: 'bg-amber-400/10',   label: 'Cotización' },
  installation:   { icon: MapPin,       color: 'text-teal-400',    bgColor: 'bg-teal-400/10',    label: 'Instalación' },
  guardia:        { icon: ShieldUser,   color: 'text-sky-400',     bgColor: 'bg-sky-400/10',     label: 'Guardia' },
  document:       { icon: File,         color: 'text-orange-400',  bgColor: 'bg-orange-400/10',  label: 'Documento' },
  pauta_mensual:  { icon: CalendarDays, color: 'text-teal-400',    bgColor: 'bg-teal-400/10',    label: 'Pauta' },
  channel:        { icon: MessageCircle,color: 'text-teal-400',    bgColor: 'bg-teal-400/10',    label: 'Chat' },
};

// ── Main component ──

interface CommandPaletteProps {
  userRole?: string;
  onOpenChat?: (channelId: string) => void;
}

export function CommandPalette({ userRole, onOpenChat }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { isOpen, close, addRecent, getRecents, externalCommands } = useCommandPalette();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [apiResults, setApiResults] = useState<ApiSearchResult[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Merge default + external commands, filter by role
  const allCommands = useMemo(() => {
    const merged = [...defaultCommands, ...externalCommands];
    if (!userRole) return [];
    return merged.filter((cmd) => !cmd.canShow || cmd.canShow(userRole));
  }, [userRole, externalCommands]);

  // Build recent items as CommandItems
  const recentItems = useMemo<CommandItem[]>(() => {
    if (query) return [];
    const recents = getRecents();
    return recents
      .map((r) => {
        const IconComp = ICON_MAP[r.icon] ?? Clock;
        return {
          id: `recent-${r.id}`,
          label: r.label,
          category: 'recent' as const,
          icon: IconComp,
          href: r.href,
        };
      })
      .slice(0, 5);
  }, [query, getRecents]);

  // Filter & sort commands
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      const suggested = allCommands
        .filter((c) => c.category === 'action')
        .slice(0, 4);
      return [...recentItems, ...suggested];
    }

    const scored = allCommands
      .map((cmd) => ({ cmd, score: getCommandScore(cmd, query.trim()) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.map(({ cmd }) => cmd);
  }, [query, allCommands, recentItems]);

  // Convert API results to CommandItems
  const searchItems = useMemo<CommandItem[]>(() => {
    return apiResults.map((r) => {
      const config = SEARCH_TYPE_CONFIG[r.type];
      return {
        id: `search-${r.type}-${r.id}`,
        label: r.title,
        description: r.subtitle,
        category: 'search' as const,
        icon: config?.icon ?? File,
        href: r.type === 'channel' ? undefined : r.href,
        action: r.type === 'channel' && onOpenChat ? () => onOpenChat(r.id) : undefined,
        keywords: [],
        imageUrl: r.imageUrl,
        pinDisplay: r.pinDisplay,
        badgeLabel: r.badgeLabel,
        badgeClass: r.badgeClass,
      };
    });
  }, [apiResults, onOpenChat]);

  // All items = static commands + API search results
  const allItems = useMemo(() => [...filteredCommands, ...searchItems], [filteredCommands, searchItems]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    const order = ['recent', 'navigation', 'action', 'config', 'search'];

    for (const cmd of allItems) {
      const cat = cmd.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cmd);
    }

    return order
      .filter((cat) => groups[cat]?.length)
      .map((cat) => ({
        category: cat,
        label: CATEGORY_LABELS[cat] ?? cat,
        items: groups[cat],
      }));
  }, [allItems]);

  // Debounced API search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!isOpen || query.trim().length < 2) {
      setApiResults([]);
      setApiLoading(false);
      return;
    }

    setApiLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/global?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setApiResults(json.data);
        }
      } catch {
        setApiResults([]);
      } finally {
        setApiLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, isOpen]);

  // Execute command
  const runCommand = useCallback(
    (cmd: CommandItem) => {
      close();
      setQuery('');

      if (cmd.href) {
        const iconName =
          Object.entries(ICON_MAP).find(
            ([, comp]) => comp === cmd.icon,
          )?.[0] ?? 'FileText';
        addRecent({
          id: cmd.id.replace(/^(recent|search)-/, ''),
          label: cmd.label,
          icon: iconName,
          href: cmd.href,
        });
      }

      if (cmd.action) {
        cmd.action();
      } else if (cmd.href) {
        router.push(cmd.href);
      }
    },
    [close, router, addRecent],
  );

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setApiResults([]);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Track page visits for recents
  useEffect(() => {
    if (!pathname) return;
    const matching = defaultCommands.find(
      (cmd) => cmd.href === pathname && cmd.category === 'navigation',
    );
    if (matching) {
      const iconName =
        Object.entries(ICON_MAP).find(
          ([, comp]) => comp === matching.icon,
        )?.[0] ?? 'FileText';
      addRecent({
        id: matching.id,
        label: matching.label,
        icon: iconName,
        href: matching.href!,
      });
    }
  }, [pathname, addRecent]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[8vh] sm:pt-[15vh] lg:pt-[20vh]"
      role="dialog"
      aria-label="Command palette"
      aria-modal="true"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => {
          close();
          setQuery('');
        }}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-[640px] mx-4 animate-in fade-in zoom-in-95 duration-200">
        <Command
          className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
          filter={() => 1} // We handle filtering ourselves
          loop
        >
          {/* ── Search input ── */}
          <div className="flex items-center border-b border-border px-4 focus-within:ring-2 focus-within:ring-primary/20 focus-within:ring-inset transition-shadow">
            <Search className="mr-3 h-5 w-5 shrink-0 text-muted-foreground" />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder={isMobile ? 'Buscar...' : 'Buscar guardias, instalaciones, chats, acciones...'}
              className="flex h-14 min-w-0 flex-1 bg-transparent pr-2 text-base text-foreground outline-none placeholder:text-muted-foreground"
              aria-label="Buscar en el command palette"
            />
            {apiLoading && (
              <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            )}
            <button
              type="button"
              onClick={() => {
                close();
                setQuery('');
              }}
              className="shrink-0 rounded border border-border bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors sm:px-1.5 sm:py-0.5"
            >
              {isMobile ? 'Cerrar' : 'ESC'}
            </button>
          </div>

          {/* ── Results ── */}
          <Command.List
            className="max-h-[min(70vh,480px)] overflow-y-auto overscroll-contain p-2"
            role="listbox"
          >
            {allItems.length === 0 && !apiLoading && (
              <Command.Empty className="py-12 text-center">
                <Search className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  No se encontraron resultados para &ldquo;{query}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground/80 mt-1">
                  Prueba con otro término o busca por nombre, instalación o acción
                </p>
              </Command.Empty>
            )}

            {grouped.map((group, idx) => (
              <Command.Group
                key={group.category}
                heading={group.label}
                className={cn(
                  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:bg-card [&_[cmdk-group-heading]]:z-10',
                  idx > 0 && 'border-t border-border/50',
                )}
              >
                {group.items.map((cmd) => {
                  const isSearch = cmd.category === 'search';
                  const searchType = isSearch ? cmd.id.split('-')[1] as SearchResultType : null;
                  const searchConfig = searchType ? SEARCH_TYPE_CONFIG[searchType] : null;

                  const showImage = isSearch && cmd.imageUrl;
                  const showPin = isSearch && cmd.pinDisplay;
                  const showStatusBadge = isSearch && (cmd.badgeLabel ?? searchConfig?.label);

                  return (
                    <Command.Item
                      key={cmd.id}
                      value={cmd.id}
                      onSelect={() => runCommand(cmd)}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm cursor-pointer transition-colors duration-150 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                      role="option"
                    >
                      <div
                        className={cn(
                          'relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg',
                          isSearch && searchConfig && !showImage
                            ? searchConfig.bgColor
                            : cmd.category === 'recent'
                              ? 'bg-muted'
                              : cmd.category === 'action'
                                ? 'bg-primary/10'
                                : cmd.category === 'config'
                                  ? 'bg-amber-500/10'
                                  : 'bg-blue-500/10',
                        )}
                      >
                        {showImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cmd.imageUrl}
                            alt={cmd.label}
                            className="h-9 w-9 rounded-lg object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling;
                              if (fallback) (fallback as HTMLElement).style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className={cn(
                            'h-full w-full items-center justify-center',
                            showImage ? 'hidden' : 'flex',
                          )}
                        >
                          <cmd.icon
                            className={cn(
                              'h-4 w-4',
                              isSearch && searchConfig
                                ? searchConfig.color
                                : cmd.category === 'recent'
                                  ? 'text-muted-foreground'
                                  : cmd.category === 'action'
                                    ? 'text-primary'
                                    : cmd.category === 'config'
                                      ? 'text-amber-500'
                                      : 'text-blue-500',
                            )}
                          />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate leading-tight">
                            {highlightMatch(cmd.label, query)}
                          </p>
                          {showPin && (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                              {cmd.pinDisplay}
                            </span>
                          )}
                        </div>
                        {cmd.description && (
                          <p className="text-xs text-muted-foreground/90 truncate mt-0.5">
                            {highlightMatch(cmd.description, query)}
                          </p>
                        )}
                      </div>

                      {cmd.shortcut && (
                        <kbd className="hidden sm:inline-flex shrink-0 h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                          {cmd.shortcut}
                        </kbd>
                      )}

                      {cmd.category === 'recent' && (
                        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                      )}

                      {showStatusBadge && (
                        <span
                          className={cn(
                            'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                            cmd.badgeLabel && cmd.badgeClass
                              ? cmd.badgeClass
                              : searchConfig
                                ? `${searchConfig.bgColor} ${searchConfig.color}`
                                : '',
                          )}
                        >
                          {cmd.badgeLabel ?? searchConfig?.label}
                        </span>
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2 sm:py-2">
            <div className={cn('flex items-center gap-3 text-xs text-muted-foreground', isMobile && 'hidden')}>
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted">
                  <ArrowUp className="h-3 w-3" />
                </span>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted">
                  <ArrowDown className="h-3 w-3" />
                </span>
                <span className="ml-0.5">navegar</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted">
                  <CornerDownLeft className="h-3 w-3" />
                </span>
                <span className="ml-0.5">seleccionar</span>
              </span>
            </div>
            <span className={cn('text-[10px] text-muted-foreground/60', isMobile && 'ml-auto')}>
              {allItems.length} resultado{allItems.length !== 1 ? 's' : ''}
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
