/**
 * Algunos navegadores envían PDF u otros tipos como application/octet-stream o dejan type vacío.
 * Inferimos el MIME desde la extensión para validar y extraer texto.
 */
export function resolveUploadedMime(file: File): string {
  const raw = (file.type || '').trim().toLowerCase();
  if (raw && raw !== 'application/octet-stream') return file.type;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'md':
    case 'markdown':
      return 'text/markdown';
    case 'txt':
      return 'text/plain';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return raw || '';
  }
}
