'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Upload,
  Trash2,
  FileText,
  X,
  RefreshCw,
  RotateCw,
  Loader2,
} from 'lucide-react';

interface KnowledgeBase {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  status: string;
  chunkCount: number;
  category: string | null;
  enabled: boolean;
  createdAt: string;
}

const CATEGORIES = [
  'producto',
  'funcionalidades',
  'FAQ',
  'normativa',
  'documentación',
  'otro',
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    processing: 'bg-status-warn-soft text-status-warn-fg',
    ready: 'bg-status-ok-soft text-status-ok-fg',
    error: 'bg-status-danger-soft text-status-danger-fg',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status === 'processing' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {status}
    </span>
  );
}

export default function PlatformKnowledgePage() {
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState<string | null>(null);

  // Upload form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/platform/knowledge');
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

  // Poll for processing items
  useEffect(() => {
    const hasProcessing = items.some((i) => i.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(fetchItems, 5000);
    return () => clearInterval(interval);
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

      const res = await fetch('/api/platform/knowledge', {
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
    await fetch(`/api/platform/knowledge/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    fetchItems();
  };

  const handleReprocess = async (id: string) => {
    setReprocessing(id);
    try {
      const res = await fetch(`/api/platform/knowledge/${id}/reprocess`, { method: 'POST' });
      const text = await res.text();
      let payload: { success?: boolean; error?: string; processed?: { chunks: number } } = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        alert('Respuesta inválida del servidor al reprocesar.');
        return;
      }
      if (!res.ok || payload.success === false) {
        alert(payload.error ?? 'No se pudo reprocesar el documento.');
      } else if (payload.processed) {
        alert(`Reprocesado: ${payload.processed.chunks} chunks generados.`);
      }
      fetchItems();
    } finally {
      setReprocessing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta base de conocimiento? Esta acción no se puede deshacer.')) return;
    setDeleting(id);
    try {
      await fetch(`/api/platform/knowledge/${id}`, { method: 'DELETE' });
      fetchItems();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <BookOpen className="h-6 w-6" />
            Bases de Conocimiento — Plataforma
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Documentos de conocimiento global que alimentan al asistente IA de todos los tenants.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 rounded-lg bg-status-info px-4 py-2 text-sm font-medium text-white hover:brightness-110 transition-colors"
        >
          <Upload className="h-4 w-4" />
          Subir documento
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Subir documento de conocimiento
              </h2>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Título *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Ej: Catálogo de módulos OPAI"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Categoría
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">Sin categoría</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Descripción opcional del documento"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Archivo *
                </label>
                <input
                  type="file"
                  accept=".pdf,.md,.txt,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                  className="mt-1 w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-status-info-soft file:px-4 file:py-2 file:text-sm file:font-medium file:text-status-info-fg hover:file:brightness-110 dark:text-gray-400"
                />
                <p className="mt-1 text-xs text-gray-400">PDF, Markdown, TXT o DOCX. Máx 10MB.</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading || !file || !title.trim()}
                  className="flex items-center gap-2 rounded-lg bg-status-info px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition-colors"
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
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay documentos de conocimiento. Sube el primero para alimentar al asistente IA.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Título</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Categoría</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Archivo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Chunks</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Tamaño</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Habilitado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{item.title}</div>
                    {item.description && (
                      <div className="mt-0.5 text-xs text-gray-500 line-clamp-1">{item.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {item.category || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="max-w-[150px] truncate">{item.fileName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{item.chunkCount}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatBytes(item.fileSize)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(item.id, item.enabled)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        item.enabled ? 'bg-status-info' : 'bg-gray-300 dark:bg-gray-600'
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
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                        title="Refrescar"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleReprocess(item.id)}
                        disabled={reprocessing === item.id}
                        className="rounded p-1 text-gray-400 hover:bg-status-info-soft hover:text-status-info-fg disabled:opacity-50"
                        title="Reprocesar (regenerar embeddings)"
                      >
                        {reprocessing === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCw className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleting === item.id}
                        className="rounded p-1 text-gray-400 hover:bg-status-danger-soft hover:text-status-danger-fg disabled:opacity-50"
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
