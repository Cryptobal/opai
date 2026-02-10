'use client';

/**
 * Presentations List
 * 
 * Lista de todas las presentaciones enviadas con:
 * - Filtros y búsqueda
 * - Links públicos
 * - Botón WhatsApp
 * - Analytics inline
 * - Mobile-first responsive
 */

import { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  ExternalLink, 
  Mail, 
  Eye, 
  MousePointer,
  Copy,
  Check,
  Calendar,
  Building2,
  User,
  FileText,
  MessageCircle,
  TrendingUp,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { Presentation, Template, PresentationView } from '@prisma/client';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { EmailStatusBadge } from './EmailStatusBadge';

type PresentationWithRelations = Presentation & {
  template: Template;
  views: PresentationView[];
  crmDealId?: string | null;
};

interface PresentationsListProps {
  presentations: PresentationWithRelations[];
  initialFilter?: string;
}

export function PresentationsList({ presentations: initialPresentations, initialFilter = 'all' }: PresentationsListProps) {
  const [presentations, setPresentations] = useState(initialPresentations);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewFilter, setViewFilter] = useState<string>(initialFilter);
  const [emailStatusFilter, setEmailStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sincronizar viewFilter cuando cambia initialFilter (KPIs clickeables)
  useEffect(() => {
    setViewFilter(initialFilter);
  }, [initialFilter]);

  // Sincronizar presentations cuando cambia initialPresentations
  useEffect(() => {
    setPresentations(initialPresentations);
  }, [initialPresentations]);

  // Filtrar presentaciones
  const filteredPresentations = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    return presentations.filter((p) => {
      // Filtro por búsqueda
      const clientData = p.clientData as any;
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = searchTerm === '' || 
        clientData?.account?.Account_Name?.toLowerCase().includes(searchLower) ||
        clientData?.contact?.First_Name?.toLowerCase().includes(searchLower) ||
        clientData?.contact?.Last_Name?.toLowerCase().includes(searchLower) ||
        clientData?.quote?.Subject?.toLowerCase().includes(searchLower) ||
        p.recipientName?.toLowerCase().includes(searchLower) ||
        p.recipientEmail?.toLowerCase().includes(searchLower);

      // Filtro por vistas
      let matchesView = true;
      if (viewFilter === 'sent') {
        // Filtrar por enviadas (sin importar si fueron vistas o no)
        matchesView = p.status === 'sent';
      } else if (viewFilter === 'viewed') {
        // Filtrar por vistas (viewCount > 0)
        matchesView = p.viewCount > 0;
      } else if (viewFilter === 'pending' || viewFilter === 'not-viewed') {
        // Filtrar por no vistas (enviadas pero sin vistas)
        matchesView = p.status === 'sent' && p.viewCount === 0;
      } else if (viewFilter === 'draft') {
        matchesView = p.status === 'draft';
      }

      // Filtro por estado de email
      let matchesEmailStatus = true;
      if (emailStatusFilter === 'sent') {
        matchesEmailStatus = p.emailSentAt !== null && !p.deliveredAt;
      } else if (emailStatusFilter === 'delivered') {
        matchesEmailStatus = p.deliveredAt !== null && p.openCount === 0;
      } else if (emailStatusFilter === 'opened') {
        matchesEmailStatus = p.openCount > 0 && p.clickCount === 0;
      } else if (emailStatusFilter === 'clicked') {
        matchesEmailStatus = p.clickCount > 0;
      }

      // Filtro por fecha
      let matchesDate = true;
      const sentDate = p.emailSentAt ? new Date(p.emailSentAt) : p.createdAt ? new Date(p.createdAt) : null;
      if (dateFilter === 'today' && sentDate) {
        matchesDate = sentDate >= today;
      } else if (dateFilter === 'week' && sentDate) {
        matchesDate = sentDate >= weekAgo;
      } else if (dateFilter === 'month' && sentDate) {
        matchesDate = sentDate >= monthAgo;
      } else if (dateFilter === 'quarter' && sentDate) {
        matchesDate = sentDate >= quarterAgo;
      }

      return matchesSearch && matchesView && matchesEmailStatus && matchesDate;
    });
  }, [presentations, searchTerm, viewFilter, emailStatusFilter, dateFilter, initialFilter]);

  // Copiar link al portapapeles (SIN preview=true para que el cliente sí trackee)
  const copyToClipboard = async (uniqueId: string) => {
    const url = `${window.location.origin}/p/${uniqueId}`; // Sin preview=true
    await navigator.clipboard.writeText(url);
    setCopiedId(uniqueId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Compartir por WhatsApp (SIN preview=true para que el cliente sí trackee)
  const shareWhatsApp = (uniqueId: string, clientData: any) => {
    const url = `${window.location.origin}/p/${uniqueId}`;
    const phone = clientData?.contact?.Mobile || clientData?.contact?.Phone || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const companyName = clientData?.account?.Account_Name || 'Cliente';
    const contactName = `${clientData?.contact?.First_Name || ''} ${clientData?.contact?.Last_Name || ''}`.trim();
    
    const message = encodeURIComponent(
      `Hola ${contactName}, te envío la propuesta de Gard Security para ${companyName}:\n\n${url}`
    );
    
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  // Eliminar presentación (solo drafts)
  const deletePresentation = async (id: string, companyName: string) => {
    if (!window.confirm(`¿Eliminar el borrador de "${companyName}"?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

    setDeletingId(id);
    try {
      const response = await fetch(`/api/presentations/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Error al eliminar');
      }

      // Actualizar lista localmente
      setPresentations((prev) => prev.filter((p) => p.id !== id));
      toast.success('Borrador eliminado correctamente');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo eliminar el documento');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Filtros */}
      <div className="p-3 sm:p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-2 border-b border-border">
        {/* Búsqueda */}
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
          <input
            type="text"
            placeholder="Buscar empresa, contacto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          />
        </div>

        {/* Filtro por Vistas */}
        <div className="relative">
          <Eye className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
          <select
            value={viewFilter}
            onChange={(e) => setViewFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 sm:py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 appearance-none cursor-pointer"
          >
            <option value="all">Todas</option>
            <option value="viewed">Vistas</option>
            <option value="not-viewed">No vistas</option>
            <option value="draft">Borradores</option>
          </select>
        </div>

        {/* Filtro por Estado Email */}
        <div className="relative">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
          <select
            value={emailStatusFilter}
            onChange={(e) => setEmailStatusFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 sm:py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 appearance-none cursor-pointer"
          >
            <option value="all">Todos los correos</option>
            <option value="sent">Enviado</option>
            <option value="delivered">Entregado</option>
            <option value="opened">Abierto</option>
            <option value="clicked">Clicked</option>
          </select>
        </div>

        {/* Filtro por fecha */}
        <div className="relative">
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 sm:py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 appearance-none cursor-pointer"
          >
            <option value="all">Todas las fechas</option>
            <option value="today">Hoy</option>
            <option value="week">Última semana</option>
            <option value="month">Último mes</option>
            <option value="quarter">Último trimestre</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="p-3 space-y-3 overflow-x-hidden">
        {filteredPresentations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay presentaciones</p>
          </div>
        ) : (
          filteredPresentations.map((presentation) => {
            const clientData = presentation.clientData as any;
            const companyName = clientData?.account?.Account_Name || 'Sin nombre';
            // Usar recipientName si existe, sino usar el de Zoho
            const contactName = presentation.recipientName || 
              `${clientData?.contact?.First_Name || ''} ${clientData?.contact?.Last_Name || ''}`.trim() || 
              'Sin contacto';
            const subject = clientData?.quote?.Subject || 'Sin asunto';
            const recipientEmail = presentation.recipientEmail || clientData?.contact?.Email || '';

            // Nuevas presentaciones: abrir negocio del CRM interno.
            const dealIdFromPayload =
              (typeof clientData?._cpqDealId === 'string' && clientData._cpqDealId) ||
              (typeof clientData?.dealId === 'string' && clientData.dealId) ||
              (typeof clientData?.deal?.id === 'string' && clientData.deal.id) ||
              null;
            const crmDealId = presentation.crmDealId || dealIdFromPayload;
            const crmDealUrl = crmDealId ? `/crm/deals/${crmDealId}` : null;

            // Fallback legacy: mantener acceso Zoho solo para IDs numéricos antiguos.
            const legacyZohoQuoteId =
              typeof clientData?.quote?.id === 'string' && /^[0-9]+$/.test(clientData.quote.id)
                ? clientData.quote.id
                : null;
            const zohoQuoteUrl = legacyZohoQuoteId
              ? `https://crm.zoho.com/crm/org846916834/tab/Quotes/${legacyZohoQuoteId}`
              : null;

            return (
              <div
                key={presentation.id}
                className="group rounded-md border border-white/10 bg-white/5 hover:bg-white/10 p-4 sm:p-3 transition-all hover:shadow-lg"
              >
                <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                  {/* Info principal */}
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-sm font-semibold text-white truncate mb-1">
                      {companyName}
                    </h3>
                    <p className="text-sm sm:text-xs text-cyan-400 truncate mb-1">{subject}</p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:text-xs text-white/60">
                      <span className="flex items-center gap-1 min-w-0">
                        <User className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{contactName}</span>
                      </span>
                      {recipientEmail && (
                        <span className="flex items-center gap-1 min-w-0">
                          <Mail className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{recipientEmail}</span>
                        </span>
                      )}
                      {presentation.emailSentAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 flex-shrink-0" />
                          {new Date(presentation.emailSentAt).toLocaleDateString('es-CL', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-nowrap items-center gap-2">
                      <div className="inline-flex h-9 items-center gap-2 rounded-md bg-green-500/10 border border-green-500/20 px-3 text-xs text-green-300">
                        <Eye className="w-3.5 h-3.5" />
                        <span className="font-semibold">{presentation.viewCount}</span>
                        <span className="text-white/50">vistas</span>
                      </div>
                      <EmailStatusBadge presentation={presentation} />
                    </div>
                  </div>

                  {/* Acciones a la derecha */}
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={`/p/${presentation.uniqueId}?preview=true`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-colors"
                      title="Ver (modo preview, no se contabiliza)"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => copyToClipboard(presentation.uniqueId)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors"
                      title="Copiar link"
                    >
                      {copiedId === presentation.uniqueId ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => shareWhatsApp(presentation.uniqueId, clientData)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-green-500/20 hover:bg-green-500/30 text-green-300 transition-colors"
                      title="Compartir por WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    {presentation.status === 'draft' ? (
                      <button
                        onClick={() => deletePresentation(presentation.id, companyName)}
                        disabled={deletingId === presentation.id}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors disabled:opacity-50"
                        title="Eliminar borrador"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : crmDealUrl ? (
                      <a
                        href={crmDealUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 transition-colors"
                        title="Ver negocio en CRM"
                      >
                        <Building2 className="w-4 h-4" />
                      </a>
                    ) : zohoQuoteUrl ? (
                      <a
                        href={zohoQuoteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 transition-colors"
                        title="Ver en Zoho CRM"
                      >
                        <Building2 className="w-4 h-4" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
