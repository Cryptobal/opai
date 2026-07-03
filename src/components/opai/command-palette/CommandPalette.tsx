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
  X,
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
  Package,
  Cpu,
  Phone,
  Sparkles,
  FileInput,
  FileOutput,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsIOS } from '@/hooks/usePlatform';
import type { CommandItem, CommandCategory } from './types';
import { useCommandPalette } from './use-command-palette';
import { defaultCommands, ICON_MAP, CATEGORY_LABELS } from './commands';
import { useIsMobile } from '@/lib/pwa/use-is-mobile';
import { normalizeForSearch } from '@/lib/search-normalize-pure';

// ── Fuzzy matching ──
// Acento-insensible: normaliza ambos lados con NFD + strip de diacríticos
// para que "Munoz" matchee "Muñoz" y viceversa.

function fuzzyScore(text: string, query: string): number {
  const lower = normalizeForSearch(text);
  const q = normalizeForSearch(query);

  if (lower === q) return 100;
  if (lower.startsWith(q)) return 90;
  const idx = lower.indexOf(q);
  if (idx !== -1) return 80 - idx * 0.5;

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
// Busca el match en la versión normalizada (sin tildes/case) pero resalta
// el slice correspondiente del texto original para preservar acentos.

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const normText = normalizeForSearch(text);
  const normQuery = normalizeForSearch(query);
  const idx = normText.indexOf(normQuery);
  if (idx === -1) return text;
  // Asume que cada char base+diacrítico precompuesto del original se reduce a
  // 1 char base tras NFD+strip, lo cual es cierto para todo el español
  // (vocales tildadas + ñ + ü). Bajo ese supuesto los offsets de la cadena
  // normalizada se corresponden 1:1 con el original.
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-semibold">{text.slice(idx, idx + normQuery.length)}</span>
      {text.slice(idx + normQuery.length)}
    </>
  );
}

// ── Search result types ──

type SearchResultType =
  | 'lead' | 'account' | 'contact' | 'deal' | 'quote'
  | 'installation' | 'guardia' | 'document' | 'pauta_mensual' | 'channel'
  | 'inventory_product' | 'inventory_asset' | 'inventory_phone_line'
  | 'dte_issued' | 'dte_received' | 'config_page';

type SearchResultGroup = 'crm' | 'ops' | 'docs' | 'chat' | 'inventory' | 'finance' | 'config';

type ApiSearchResult = {
  id: string;
  type: SearchResultType;
  group: SearchResultGroup;
  title: string;
  subtitle: string;
  href: string;
  badgeLabel?: string;
  badgeClass?: string;
  imageUrl?: string;
  pinDisplay?: string;
};

// ── Paleta única por TIPO de resultado ──
// Cada tipo tiene su propio color distintivo para distinguirse visualmente
// entre módulos y subtipos. Usamos los tints de OPAI DS + status semánticos.
const SEARCH_TYPE_CONFIG: Record<SearchResultType, { icon: typeof Users; color: string; bgColor: string; label: string }> = {
  // CRM
  lead:                  { icon: Users,        color: 'text-tint-emerald-fg', bgColor: 'bg-tint-emerald',     label: 'Lead' },
  account:               { icon: Building2,    color: 'text-tint-sky-fg',     bgColor: 'bg-tint-sky',         label: 'Cuenta' },
  contact:               { icon: Contact,      color: 'text-tint-rose-fg',    bgColor: 'bg-tint-rose',        label: 'Contacto' },
  deal:                  { icon: TrendingUp,   color: 'text-tint-violet-fg',  bgColor: 'bg-tint-violet',      label: 'Negocio' },
  quote:                 { icon: FileText,     color: 'text-tint-amber-fg',   bgColor: 'bg-tint-amber',       label: 'Cotización' },
  installation:          { icon: MapPin,       color: 'text-tint-teal-fg',    bgColor: 'bg-tint-teal',        label: 'Instalación' },
  // Ops
  guardia:               { icon: ShieldUser,   color: 'text-status-info-fg',  bgColor: 'bg-status-info-soft', label: 'Guardia' },
  pauta_mensual:         { icon: CalendarDays, color: 'text-tint-teal-fg',    bgColor: 'bg-tint-teal',        label: 'Pauta' },
  // Docs
  document:              { icon: File,         color: 'text-status-warn-fg',  bgColor: 'bg-status-warn-soft', label: 'Documento' },
  // Chat
  channel:               { icon: MessageCircle,color: 'text-tint-rose-fg',    bgColor: 'bg-tint-rose',        label: 'Chat' },
  // Inventario
  inventory_product:     { icon: Package,      color: 'text-tint-violet-fg',  bgColor: 'bg-tint-violet',      label: 'Producto' },
  inventory_asset:       { icon: Cpu,          color: 'text-tint-amber-fg',   bgColor: 'bg-tint-amber',       label: 'Activo' },
  inventory_phone_line:  { icon: Phone,        color: 'text-tint-sky-fg',     bgColor: 'bg-tint-sky',         label: 'Línea' },
  // Finanzas — DTE
  dte_issued:            { icon: FileOutput,   color: 'text-status-ok-fg',    bgColor: 'bg-status-ok-soft',   label: 'DTE Emitido' },
  dte_received:          { icon: FileInput,    color: 'text-status-warn-fg',  bgColor: 'bg-status-warn-soft', label: 'DTE Recibido' },
  // Configuración — páginas/acciones
  config_page:           { icon: Settings,     color: 'text-muted-foreground', bgColor: 'bg-muted',           label: 'Configuración' },
};

const GROUP_CATEGORY: Record<SearchResultGroup, CommandCategory> = {
  crm:       'search_crm',
  ops:       'search_ops',
  docs:      'search_docs',
  chat:      'search_chat',
  inventory: 'search_inventory',
  finance:   'search_finance',
  config:    'search_config',
};

// ── Paleta por categoría de COMANDO (recent/navigation/action/config) ──
// Para que cada item de navegación tenga color en base al módulo destino.
function getNavTone(href?: string): { color: string; bg: string } {
  const path = href ?? '';
  if (path.startsWith('/crm') || path.includes('/configuracion/crm'))
    return { color: 'text-tint-violet-fg', bg: 'bg-tint-violet' };
  if (
    path.startsWith('/ops') ||
    path.startsWith('/personas') ||
    path.startsWith('/te') ||
    path.startsWith('/reportes/dt') ||
    path.startsWith('/portales') ||
    path.includes('/configuracion/ops') ||
    path.includes('/configuracion/ats')
  )
    return { color: 'text-tint-sky-fg', bg: 'bg-tint-sky' };
  if (path.startsWith('/finanzas') || path.includes('/configuracion/finanzas'))
    return { color: 'text-tint-emerald-fg', bg: 'bg-tint-emerald' };
  if (path.startsWith('/payroll') || path.includes('/configuracion/payroll'))
    return { color: 'text-tint-amber-fg', bg: 'bg-tint-amber' };
  if (path.startsWith('/chat'))
    return { color: 'text-tint-rose-fg', bg: 'bg-tint-rose' };
  if (path.startsWith('/cpq') || path.includes('/configuracion/cpq'))
    return { color: 'text-tint-teal-fg', bg: 'bg-tint-teal' };
  if (path.startsWith('/opai/documentos'))
    return { color: 'text-status-warn-fg', bg: 'bg-status-warn-soft' };
  if (path.startsWith('/opai/notificaciones'))
    return { color: 'text-tint-rose-fg', bg: 'bg-tint-rose' };
  if (path.startsWith('/opai/configuracion'))
    return { color: 'text-muted-foreground', bg: 'bg-muted' };
  if (path === '/hub')
    return { color: 'text-primary', bg: 'bg-primary/10' };
  return { color: 'text-status-info-fg', bg: 'bg-status-info-soft' };
}

// ── Main component ──

interface CommandPaletteProps {
  userRole?: string;
  onOpenChat?: (channelId: string) => void;
}

export function CommandPalette({ userRole, onOpenChat }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const isIOS = useIsIOS();
  const { isOpen, close, addRecent, getRecents, externalCommands } = useCommandPalette();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [apiResults, setApiResults] = useState<ApiSearchResult[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        category: GROUP_CATEGORY[r.group] ?? 'search_crm',
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

  const allItems = useMemo(() => [...filteredCommands, ...searchItems], [filteredCommands, searchItems]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    const order = ['recent', 'search_crm', 'search_ops', 'search_finance', 'search_chat', 'search_docs', 'search_inventory', 'search_config', 'navigation', 'action', 'config'];

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

  // Debounced API search with AbortController for out-of-order cancellation
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!isOpen || query.trim().length < 2) {
      setApiResults([]);
      setApiLoading(false);
      return;
    }

    setApiLoading(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/search/global?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!controller.signal.aborted && json.success && Array.isArray(json.data)) {
          setApiResults(json.data);
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') setApiResults([]);
      } finally {
        if (!controller.signal.aborted) setApiLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
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

  // Reset on open + focus input
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setApiResults([]);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Lock body scroll while open (prevents background scroll on iOS)
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
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

  const handleClose = () => {
    close();
    setQuery('');
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-[70]',
        // Desktop: centered modal | Mobile: full-screen sheet
        'flex flex-col sm:items-start sm:justify-center sm:pt-[12vh]',
      )}
      role="dialog"
      aria-label="Buscador global"
      aria-modal="true"
      style={{
        // iOS keyboard + safe areas
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Overlay — visible mobile + desktop */}
      <button
        type="button"
        aria-label="Cerrar buscador"
        onClick={handleClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      />

      {/* Sheet / Modal — liquid glass mobile + desktop */}
      <div
        className={cn(
          'relative flex flex-col min-h-0 opai-liquid-glass',
          // Mobile: fill screen (slide up from bottom) with bottom-sheet feel
          'flex-1 w-full rounded-t-3xl animate-in slide-in-from-bottom-4 fade-in duration-200',
          // Desktop: centered card
          'sm:flex-none sm:w-full sm:max-w-[640px] sm:mx-auto sm:rounded-2xl sm:slide-in-from-top-4 sm:zoom-in-[0.98] sm:overflow-hidden',
          isIOS && 'opai-ios-command-palette',
        )}
        style={{
          // Mobile gets full dvh height; subtract safe area top
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px))',
        }}
      >
        <Command
          className="flex flex-col min-h-0 flex-1 sm:max-h-[min(70dvh,560px)]"
          filter={() => 1}
          loop
          shouldFilter={false}
        >
          {/* ── Search input (sticky top) ── */}
          <div
            className={cn(
              'flex items-center gap-2 border-b border-border/60 px-4 sm:px-5 shrink-0',
              // Mobile input area is taller for comfortable thumb reach
              'h-16 sm:h-[60px]',
              isIOS && 'opai-ios-command-palette-chrome',
            )}
          >
            <Search className="h-5 w-5 shrink-0 text-muted-foreground/70" aria-hidden />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder={isMobile ? 'Buscar…' : 'Buscar guardias, instalaciones, chats, acciones…'}
              className={cn(
                'flex min-w-0 flex-1 bg-transparent outline-none',
                'text-[17px] sm:text-[15px] text-foreground',
                'placeholder:text-muted-foreground/60',
                // Prevent iOS auto-cap/auto-correct noise
              )}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="search"
              enterKeyHint="search"
              aria-label="Buscar"
            />
            {apiLoading && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            )}
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'shrink-0 inline-flex items-center justify-center rounded-md transition-colors',
                // Mobile: 40px touch target with X icon
                'sm:hidden h-10 w-10 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95',
              )}
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
            <kbd
              className={cn(
                'hidden sm:inline-flex shrink-0 items-center rounded-md border border-border/60 bg-muted/60 px-1.5 h-6 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors cursor-pointer select-none',
              )}
              onClick={handleClose}
              aria-label="Cerrar (Esc)"
              role="button"
              tabIndex={-1}
            >
              esc
            </kbd>
          </div>

          {/* ── Results ── */}
          <Command.List
            className={cn(
              'flex-1 min-h-0 overflow-y-auto overscroll-contain',
              'p-2 sm:p-2.5',
              '[-webkit-overflow-scrolling:touch]',
            )}
            role="listbox"
          >
            {allItems.length === 0 && !apiLoading && (
              <Command.Empty className="py-16 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
                  {query ? (
                    <Search className="h-5 w-5 text-muted-foreground/70" />
                  ) : (
                    <Sparkles className="h-5 w-5 text-primary/80" />
                  )}
                </div>
                <p className="text-sm font-medium text-foreground">
                  {query ? (
                    <>Sin resultados para <span className="text-muted-foreground">&ldquo;{query}&rdquo;</span></>
                  ) : (
                    'Empieza a escribir para buscar'
                  )}
                </p>
                <p className="text-xs text-muted-foreground/80 mt-1.5 px-6">
                  {query
                    ? 'Prueba con otro término: nombre, RUT, instalación, acción…'
                    : 'Guardias, instalaciones, documentos, chats y más'}
                </p>
              </Command.Empty>
            )}

            {grouped.map((group, idx) => (
              <Command.Group
                key={group.category}
                heading={group.label}
                className={cn(
                  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5',
                  '[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold',
                  '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em]',
                  '[&_[cmdk-group-heading]]:text-muted-foreground/70',
                  idx === 0 && '[&_[cmdk-group-heading]]:pt-1',
                )}
              >
                {group.items.map((cmd) => {
                  const isSearch = cmd.category.startsWith('search_');
                  const searchType = isSearch ? (cmd.id.split('-')[1] as SearchResultType) : null;
                  const searchConfig = searchType ? SEARCH_TYPE_CONFIG[searchType] : null;

                  const showImage = isSearch && cmd.imageUrl;
                  const showPin = isSearch && cmd.pinDisplay;
                  const showStatusBadge = isSearch && (cmd.badgeLabel ?? searchConfig?.label);

                  // Tono por destino para navegación/acciones/recientes — cada
                  // módulo recibe su propio color para identificación visual.
                  const navTone = !isSearch ? getNavTone(cmd.href) : null;

                  return (
                    <Command.Item
                      key={cmd.id}
                      value={cmd.id}
                      onSelect={() => runCommand(cmd)}
                      className={cn(
                        'group flex items-center gap-3 rounded-xl px-3 text-sm cursor-pointer',
                        'transition-colors duration-150 mx-0.5',
                        // Mobile touch-friendly rows; desktop compact
                        'py-3 sm:py-2.5',
                        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                        'active:bg-accent/80',
                      )}
                      role="option"
                    >
                      <div
                        className={cn(
                          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg',
                          'h-9 w-9',
                          isSearch && searchConfig && !showImage
                            ? searchConfig.bgColor
                            : cmd.category === 'config'
                              ? 'bg-muted'
                              : navTone?.bg ?? 'bg-status-info-soft',
                        )}
                      >
                        {showImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cmd.imageUrl}
                            alt=""
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
                              'h-[18px] w-[18px]',
                              isSearch && searchConfig
                                ? searchConfig.color
                                : cmd.category === 'config'
                                  ? 'text-muted-foreground'
                                  : navTone?.color ?? 'text-status-info-fg',
                            )}
                          />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate leading-tight text-[14px] sm:text-[13.5px]">
                            {highlightMatch(cmd.label, query)}
                          </p>
                          {showPin && (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground tabular-nums">
                              {cmd.pinDisplay}
                            </span>
                          )}
                        </div>
                        {cmd.description && (
                          <p className="text-[12px] text-muted-foreground/80 truncate mt-0.5 leading-snug">
                            {highlightMatch(cmd.description, query)}
                          </p>
                        )}
                      </div>

                      {cmd.shortcut && (
                        <kbd className="hidden sm:inline-flex shrink-0 h-5 items-center gap-0.5 rounded border border-border/60 bg-muted/60 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                          {cmd.shortcut}
                        </kbd>
                      )}

                      {cmd.category === 'recent' && (
                        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-hidden />
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

          {/* ── Footer (desktop only — keyboard hints) ── */}
          <div className="hidden sm:flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2 shrink-0">
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-white/15 bg-white/10 px-1">
                  <ArrowUp className="h-3 w-3" />
                </span>
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-white/15 bg-white/10 px-1">
                  <ArrowDown className="h-3 w-3" />
                </span>
                <span>navegar</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-white/15 bg-white/10 px-1">
                  <CornerDownLeft className="h-3 w-3" />
                </span>
                <span>abrir</span>
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {allItems.length} {allItems.length === 1 ? 'resultado' : 'resultados'}
            </span>
          </div>

          {/* ── Footer (mobile — compact count + safe area spacer) ── */}
          <div
            className={cn(
              'sm:hidden flex items-center justify-center border-t border-white/10 bg-white/5 px-4 py-2 shrink-0 text-[11px] text-muted-foreground/70 tabular-nums',
              isIOS && 'opai-ios-command-palette-chrome',
            )}
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
            }}
          >
            {allItems.length} {allItems.length === 1 ? 'resultado' : 'resultados'}
          </div>
        </Command>
      </div>
    </div>
  );
}
