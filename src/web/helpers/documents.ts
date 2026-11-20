import { currentCsrfToken } from '../api';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEXT = 'text/plain';
const MARKDOWN = 'text/markdown';

/**
 * Browsers do not always report a MIME type (or report application/octet-stream) for .md and
 * .docx files. Fall back to the extension so the local vault accepts the upload.
 */
export function resolveDocumentMime(file: { name: string; type: string }): string {
  const type = file.type.split(';')[0]!.trim().toLowerCase();
  if (type && type !== 'application/octet-stream') return type;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return PDF;
  if (ext === 'docx') return DOCX;
  if (ext === 'md' || ext === 'markdown') return MARKDOWN;
  if (ext === 'txt') return TEXT;
  return type || 'application/octet-stream';
}

/** Upload a document as raw bytes. Returns a message for the candidate. */
export async function uploadDocument(file: File, kind: 'resume' | 'cover_letter' | 'other'): Promise<string> {
  try {
    const csrf = currentCsrfToken();
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': resolveDocumentMime(file),
        'x-cs-filename': encodeURIComponent(file.name),
        'x-cs-document-kind': kind,
        'x-cs-csrf': csrf,
      },
      body: file,
    });
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return res.ok ? `Uploaded ${file.name}.` : (body?.message ?? 'Upload failed.');
  } catch {
    return 'Upload failed. Check that the service is running.';
  }
}
