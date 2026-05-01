'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Upload,
  Trash2,
  FileText,
  X,
  RefreshCw,
  Loader2,
} from 'lucide-react';

interface KnowledgeBase {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
  chunkCount: number;
  category: string | null;
  enabled: boolean;
  createdAt: string;
}

const TENANT_CATEGORIES = [
  'protocolos',
  'normativa',
  'operaciones',
  'rrhh',
  'clientes',
  'otro',
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    processing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-status-warn-fg',
    ready: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-status-ok-fg',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-status-danger-fg',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status === 'processing' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {status}
    </span>
  );
}

export function KnowledgeBaseManager() {
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge');
      const text = await res.text();
      let data: { success?: boolean; data?: KnowledgeBase[]; error?: string } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        console.error('Respuesta inválida del servidor al listar bases de conocimiento');
        return;
      }
      if (data.success && Array.isArray(data.data)) setItems(data.data);
      else if (!res.ok) console.error('Error fetching knowledge bases:', data.error ?? res.status);
    } catch (err) {
      console.error('Error fetching knowledge bases:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const hasProcessing = items.some((i) => i.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(fetchItems, 10000);
    // Cap polling at 3 minutes to avoid infinite loops
    const timeout = setTimeout(() => clearInterval(interval), 3 * 60 * 1000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [items, fetchItems]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      if (category) formData.append('category', category);
      if (description.trim()) formData.append('description', description.trim());

      const res = await fetch('/api/knowledge', {
        method: 'POST',
        body: formData,
      });

      const text = await res.text();
      let payload: { success?: boolean; error?: string } = {};
      try {
        payload = text ? (JSON.parse(text) as typeof payload) : {};
      } catch {
        alert('El servidor devolvió una respuesta inválida al subir el archivo.');
        return;
      }

      if (res.ok && payload.success !== false) {
        setShowUpload(false);
        setTitle('');
        setDescription('');
        setCategory('');
        setFile(null);
        fetchItems();
      } else {
        console.error('Error al subir documento:', payload.error ?? res.status);
        alert(payload.error ?? 'No se pudo subir el documento.');
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/knowledge/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta base de conocimiento? Esta acción no se puede deshacer.')) return;
    setDeleting(id);
    try {
      await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
      fetchItems();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          {items.length} documento{items.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Upload className="h-3.5 w-3.5" />
          Subir documento
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Subir documento de conocimiento</h2>
              <button onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Título *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  placeholder="Ej: Manual de operaciones"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Categoría</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Sin categoría</option>
                  {TENANT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Descripción</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  placeholder="Descripción opcional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Archivo *</label>
                <input
                  type="file"
                  accept=".pdf,.md,.txt,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                  className="mt-1 w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                />
                <p className="mt-1 text-xs text-muted-foreground">PDF, Markdown, TXT o DOCX. Máx 10MB.</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading || !file || !title.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {uploading ? 'Subiendo...' : 'Subir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No hay documentos de conocimiento. Sube el primero para alimentar al asistente IA de tu empresa.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Título</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categoría</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Archivo</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Chunks</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tamaño</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Activo</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{item.title}</div>
                    {item.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.category || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="max-w-[120px] truncate">{item.fileName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.chunkCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatBytes(item.fileSize)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(item.id, item.enabled)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        item.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          item.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => fetchItems()}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Refrescar"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      {item.status === 'error' && (
                        <button
                          onClick={async () => {
                            await fetch(`/api/knowledge/${item.id}/reprocess`, { method: 'POST' }).catch(() => {});
                            fetchItems();
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          title="Reintentar procesamiento"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleting === item.id}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        title="Eliminar"
                      >
                        {deleting === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
