'use client';

/**
 * Presentations List — Refactored
 *
 * Desktop: Compact table-like rows (~50px) with hover-reveal actions + ⋯ menu
 * Mobile: Compact cards (~75px) with swipe-to-reveal actions + tap expand
 * Filtros: Pills horizontales en una sola fila (reemplaza dropdowns)
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  ExternalLink,
  Eye,
  Copy,
  Check,
  Building2,
  FileText,
  MessageCircle,
  Trash2,
  MoreHorizontal,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { Presentation, Template, PresentationView } from '@prisma/client';
import { EmailStatusBadge } from './EmailStatusBadge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCanDelete } from '@/lib/permissions-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PresentationWithRelations = Presentation & {
  template: Template;
  views: PresentationView[];
  crmDealId?: string | null;
};

interface PresentationsListProps {
  presentations: PresentationWithRelations[];
  initialFilter?: string;
}

/* ────────────────────────────────────────────────────────────────
   Avatar — color determinístico por nombre
   ──────────────────────────────────────────────────────────────── */
const AVATAR_COLORS = [
  'bg-blue-500/20 text-blue-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-purple-500/20 text-purple-400',
  'bg-amber-500/20 text-amber-400',
  'bg-cyan-500/20 text-cyan-400',
  'bg-rose-500/20 text-rose-400',
  'bg-indigo-500/20 text-indigo-400',
  'bg-teal-500/20 text-teal-400',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitial(name: string) {
  return (name.charAt(0) || '?').toUpperCase();
}

/* ────────────────────────────────────────────────────────────────
   Filter pills
   ──────────────────────────────────────────────────────────────── */
const VIEW_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'sent', label: 'Enviadas' },
  { key: 'viewed', label: 'Vistas' },
  { key: 'pending', label: 'Sin leer' },
  { key: 'draft', label: 'Borradores' },
] as const;

const DATE_FILTERS = [
  { key: 'all', label: 'Siempre' },
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: '7d' },
  { key: 'month', label: '30d' },
  { key: 'quarter', label: '90d' },
] as const;

/* ────────────────────────────────────────────────────────────────
   Formatear fecha compacta
   ──────────────────────────────────────────────────────────────── */
function formatShortDate(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);

  if (diffH < 1) return 'hace ' + Math.max(1, Math.floor(diffMs / (1000 * 60))) + 'min';
  if (diffH < 24) return 'hace ' + Math.floor(diffH) + 'h';
  if (diffH < 48) return 'ayer';

  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');
}

function formatFullDate(date: Date | string | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════ */
export function PresentationsList({ presentations: initialPresentations, initialFilter = 'all' }: PresentationsListProps) {
  const canDeletePresentation = useCanDelete('docs', 'presentaciones');
  const [presentations, setPresentations] = useState(initialPresentations);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewFilter, setViewFilter] = useState<string>(initialFilter);
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: string; companyName: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { setViewFilter(initialFilter); }, [initialFilter]);
  useEffect(() => { setPresentations(initialPresentations); }, [initialPresentations]);

  const filteredPresentations = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    return presentations.filter((p) => {
      const clientData = p.clientData as any;
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = searchTerm === '' ||
        clientData?.account?.Account_Name?.toLowerCase().includes(searchLower) ||
        clientData?.contact?.First_Name?.toLowerCase().includes(searchLower) ||
        clientData?.contact?.Last_Name?.toLowerCase().includes(searchLower) ||
        clientData?.quote?.Subject?.toLowerCase().includes(searchLower) ||
        p.recipientName?.toLowerCase().includes(searchLower) ||
        p.recipientEmail?.toLowerCase().includes(searchLower);

      let matchesView = true;
      if (viewFilter === 'sent') matchesView = p.status === 'sent';
      else if (viewFilter === 'viewed') matchesView = p.viewCount > 0;
      else if (viewFilter === 'pending' || viewFilter === 'not-viewed') matchesView = p.status === 'sent' && p.viewCount === 0;
      else if (viewFilter === 'draft') matchesView = p.status === 'draft';

      let matchesDate = true;
      const sentDate = p.emailSentAt ? new Date(p.emailSentAt) : p.createdAt ? new Date(p.createdAt) : null;
      if (dateFilter === 'today' && sentDate) matchesDate = sentDate >= today;
      else if (dateFilter === 'week' && sentDate) matchesDate = sentDate >= weekAgo;
      else if (dateFilter === 'month' && sentDate) matchesDate = sentDate >= monthAgo;
      else if (dateFilter === 'quarter' && sentDate) matchesDate = sentDate >= quarterAgo;

      return matchesSearch && matchesView && matchesDate;
    });
  }, [presentations, searchTerm, viewFilter, dateFilter]);

  const copyToClipboard = async (uniqueId: string) => {
    const url = `${window.location.origin}/p/${uniqueId}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(uniqueId);
    toast.success('Link copiado');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [waProposalTemplate, setWaProposalTemplate] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/crm/whatsapp-templates")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const tpl = data.data?.find((t: { slug: string }) => t.slug === "proposal_sent");
          if (tpl) setWaProposalTemplate(tpl.body);
        }
      })
      .catch(() => {});
  }, []);

  const shareWhatsApp = (uniqueId: string, clientData: any) => {
    const url = `${window.location.origin}/p/${uniqueId}`;
    const phone = clientData?.contact?.Mobile || clientData?.contact?.Phone || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const companyName = clientData?.account?.Account_Name || 'Cliente';
    const contactName = `${clientData?.contact?.First_Name || ''} ${clientData?.contact?.Last_Name || ''}`.trim();

    let template = waProposalTemplate || `Hola {contactName}, te envío la propuesta de Gard Security para {companyName}:\n\n{proposalUrl}`;
    template = template
      .replaceAll("{contactName}", contactName)
      .replaceAll("{companyName}", companyName)
      .replaceAll("{proposalUrl}", url)
      .replace(/\{[a-zA-Z_]+\}/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(template)}`, '_blank');
  };

  const deletePresentation = async (id: string, companyName: string, skipConfirm = false) => {
    if (!canDeletePresentation) {
      toast.error('No tienes permisos para eliminar esta presentación');
      return;
    }
    if (!skipConfirm) {
      setDeleteModal({ id, companyName });
      return;
    }

    setDeletingId(id);
    setDeleteModal(null);
    try {
      const response = await fetch(`/api/presentations/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Error al eliminar');
      setPresentations((prev) => prev.filter((p) => p.id !== id));
      toast.success('Documento eliminado correctamente');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo eliminar el documento');
    } finally {
      setDeletingId(null);
    }
  };

  const onConfirmDelete = () => {
    if (!deleteModal) return;
    deletePresentation(deleteModal.id, deleteModal.companyName, true);
  };

  return (
    <div className="space-y-3">
      {/* ── Filtros: búsqueda + pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar empresa, contacto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {VIEW_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setViewFilter(f.key)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0 ${
                viewFilter === f.key
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
          {DATE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors shrink-0 ${
                dateFilter === f.key
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Desktop: Table header ── */}
      <div className="hidden lg:grid lg:grid-cols-[40px_1.5fr_1fr_1fr_100px_72px_80px_36px] gap-3 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-b border-border">
        <span />
        <span>Empresa</span>
        <span>Contacto</span>
        <span>Email</span>
        <span>Fecha</span>
        <span className="text-center">Vistas</span>
        <span>Estado</span>
        <span />
      </div>

      {/* ── Lista ── */}
      {filteredPresentations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay presentaciones</p>
        </div>
      ) : (
        <div className="space-y-[2px] lg:space-y-0">
          {filteredPresentations.map((presentation) => (
            <PresentationRow
              key={presentation.id}
              presentation={presentation}
              isExpanded={expandedId === presentation.id}
              onToggleExpand={() => setExpandedId(expandedId === presentation.id ? null : presentation.id)}
              onCopy={copyToClipboard}
              onWhatsApp={shareWhatsApp}
              onDelete={deletePresentation}
              copiedId={copiedId}
              deletingId={deletingId}
              canDelete={canDeletePresentation}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteModal}
        onOpenChange={(open) => !open && setDeleteModal(null)}
        title="Eliminar documento comercial"
        description={
          deleteModal
            ? `¿Eliminar el documento "${deleteModal.companyName}"? Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={onConfirmDelete}
        variant="destructive"
        loading={deleteModal ? deletingId === deleteModal.id : false}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PRESENTATION ROW — Desktop: table row, Mobile: compact card
   ════════════════════════════════════════════════════════════════ */
interface PresentationRowProps {
  presentation: PresentationWithRelations;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCopy: (uniqueId: string) => void;
  onWhatsApp: (uniqueId: string, clientData: any) => void;
  onDelete: (id: string, companyName: string) => void;
  copiedId: string | null;
  deletingId: string | null;
  canDelete: boolean;
}

function PresentationRow({
  presentation,
  isExpanded,
  onToggleExpand,
  onCopy,
  onWhatsApp,
  onDelete,
  copiedId,
  deletingId,
  canDelete,
}: PresentationRowProps) {
  const clientData = presentation.clientData as any;
  const companyName = clientData?.account?.Account_Name || 'Sin nombre';
  const contactName = presentation.recipientName ||
    `${clientData?.contact?.First_Name || ''} ${clientData?.contact?.Last_Name || ''}`.trim() ||
    'Sin contacto';
  const recipientEmail = presentation.recipientEmail || clientData?.contact?.Email || '';
  const sentDate = presentation.emailSentAt || presentation.createdAt;

  const dealIdFromPayload =
    (typeof clientData?._cpqDealId === 'string' && clientData._cpqDealId) ||
    (typeof clientData?.dealId === 'string' && clientData.dealId) ||
    (typeof clientData?.deal?.id === 'string' && clientData.deal.id) ||
    null;
  const crmDealId = presentation.crmDealId || dealIdFromPayload;
  const crmDealUrl = crmDealId ? `/crm/deals/${crmDealId}` : null;
  const legacyZohoQuoteId =
    typeof clientData?.quote?.id === 'string' && /^[0-9]+$/.test(clientData.quote.id)
      ? clientData.quote.id
      : null;
  const zohoQuoteUrl = legacyZohoQuoteId
    ? `https://crm.zoho.com/crm/org846916834/tab/Quotes/${legacyZohoQuoteId}`
    : null;
  const dealUrl = crmDealUrl || zohoQuoteUrl;

  const avatarColor = getAvatarColor(companyName);
  const initial = getInitial(companyName);

  const [showMobileActions, setShowMobileActions] = useState(false);
  const touchStartX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 60) setShowMobileActions(true);
    else if (diff < -60) setShowMobileActions(false);
  };

  return (
    <>
      {/* ── Desktop row (lg+) ── */}
      <div
        className="hidden lg:grid lg:grid-cols-[40px_1.5fr_1fr_1fr_100px_72px_80px_36px] gap-3 items-center px-3 py-2.5 rounded-md hover:bg-accent/40 transition-colors duration-150 cursor-pointer group border border-transparent hover:border-border/50"
        onClick={onToggleExpand}
      >
        <div className={`h-8 w-8 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor}`}>
          {initial}
        </div>
        <span className="text-[13px] font-semibold truncate text-foreground">
          {companyName}
        </span>
        <span className="text-[13px] text-muted-foreground truncate">
          {contactName}
        </span>
        <span className="text-[12px] text-muted-foreground truncate font-mono">
          {recipientEmail}
        </span>
        <span className="text-[11px] text-muted-foreground font-mono" title={formatFullDate(sentDate)}>
          {formatShortDate(sentDate)}
        </span>
        <span className="flex items-center justify-center gap-1 text-xs">
          <Eye className="h-3 w-3 text-muted-foreground/60" />
          <span className={`font-semibold font-mono ${presentation.viewCount > 0 ? 'text-emerald-400' : 'text-muted-foreground/50'}`}>
            {presentation.viewCount}
          </span>
        </span>
        <EmailStatusBadge presentation={presentation} compact />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-accent text-muted-foreground transition-all"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <a href={`/p/${presentation.uniqueId}?preview=true`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                Ver presentación
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopy(presentation.uniqueId); }}>
              {copiedId === presentation.uniqueId ? <Check className="h-3.5 w-3.5 mr-2" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
              Copiar link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onWhatsApp(presentation.uniqueId, clientData); }}>
              <MessageCircle className="h-3.5 w-3.5 mr-2" />
              Enviar WhatsApp
            </DropdownMenuItem>
            {dealUrl && (
              <DropdownMenuItem asChild>
                <a href={dealUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <Building2 className="h-3.5 w-3.5 mr-2" />
                  Ver en CRM
                </a>
              </DropdownMenuItem>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onDelete(presentation.id, companyName); }}
                  disabled={deletingId === presentation.id}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Mobile card (< lg) ── */}
      <div
        className="lg:hidden relative overflow-hidden rounded-xl border border-border bg-card"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe actions */}
        <div
          className={`absolute inset-y-0 right-0 flex items-stretch transition-opacity duration-150 z-10 ${
            showMobileActions ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            onClick={() => { onWhatsApp(presentation.uniqueId, clientData); setShowMobileActions(false); }}
            className="w-14 flex items-center justify-center bg-emerald-600 text-white"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          <button
            onClick={() => { onCopy(presentation.uniqueId); setShowMobileActions(false); }}
            className="w-14 flex items-center justify-center bg-blue-600 text-white"
          >
            <Copy className="h-4 w-4" />
          </button>
          {canDelete && (
            <button
              onClick={() => { onDelete(presentation.id, companyName); setShowMobileActions(false); }}
              className="w-14 flex items-center justify-center bg-red-600 text-white"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Card content */}
        <div
          className="flex items-center gap-3 px-4 py-3 transition-transform duration-200"
          style={{
            transform: showMobileActions ? `translateX(-${canDelete ? 168 : 112}px)` : 'translateX(0)',
            transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
          onClick={() => { if (!showMobileActions) onToggleExpand(); else setShowMobileActions(false); }}
        >
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor}`}>
            {initial}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14.5px] font-semibold truncate text-foreground leading-tight">
                {companyName}
              </span>
              <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                {formatShortDate(sentDate)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <span className="truncate">{contactName}</span>
              <span className="text-muted-foreground/30">·</span>
              <span className="flex items-center gap-0.5 shrink-0">
                <Eye className="h-3 w-3" />
                {presentation.viewCount}
              </span>
              <EmailStatusBadge presentation={presentation} compact />
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/60 shrink-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <a href={`/p/${presentation.uniqueId}?preview=true`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="h-3.5 w-3.5 mr-2" />
                  Ver presentación
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopy(presentation.uniqueId); }}>
                <Copy className="h-3.5 w-3.5 mr-2" />
                Copiar link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onWhatsApp(presentation.uniqueId, clientData); }}>
                <MessageCircle className="h-3.5 w-3.5 mr-2" />
                Enviar WhatsApp
              </DropdownMenuItem>
              {dealUrl && (
                <DropdownMenuItem asChild>
                  <a href={dealUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    <Building2 className="h-3.5 w-3.5 mr-2" />
                    Ver en CRM
                  </a>
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); onDelete(presentation.id, companyName); }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Expanded detail */}
        {isExpanded && !showMobileActions && (
          <div className="px-4 pb-3 pt-1 border-t border-border/50 space-y-2 animate-fade-in">
            {recipientEmail && (
              <div className="text-xs text-muted-foreground font-mono truncate">
                {recipientEmail}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {formatFullDate(sentDate)}
            </div>
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <a
                href={`/p/${presentation.uniqueId}?preview=true`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 px-3 text-xs font-medium transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ver
              </a>
              <button
                onClick={(e) => { e.stopPropagation(); onCopy(presentation.uniqueId); }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 px-3 text-xs font-medium transition-colors"
              >
                {copiedId === presentation.uniqueId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copiar
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onWhatsApp(presentation.uniqueId, clientData); }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 px-3 text-xs font-medium transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </button>
              {dealUrl && (
                <a
                  href={dealUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 px-3 text-xs font-medium transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  CRM
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
