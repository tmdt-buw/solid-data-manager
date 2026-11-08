export const MAX_MEDIA_PREVIEW_BYTES = 128 * 1024 * 1024;

const mediaTypes = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
  mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
};
const textExtensions = new Set(['', 'txt', 'json', 'jsonld', 'csv', 'tsv', 'ttl', 'n3', 'nt', 'nq', 'trig', 'xml', 'gpx', 'html', 'md', 'log', 'yaml', 'yml', 'js', 'css']);

export function previewFormat(name, contentType = '') {
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const generic = ['', 'application/octet-stream', 'binary/octet-stream'].includes(mime);
  const media = mediaTypes[extension];
  const resolved = mime.startsWith('image/') || mime.startsWith('video/')
    ? mime : (generic || mime === 'text/plain') && media ? media : '';
  if (resolved) return { kind: resolved.startsWith('image/') ? 'image' : 'video', mime: resolved };
  if (mime.startsWith('text/') || /[+/](json|xml)$/.test(mime) ||
      ['application/n-triples', 'application/n-quads', 'application/trig', 'application/javascript', 'application/yaml'].includes(mime) ||
      (generic && textExtensions.has(extension))) return { kind: 'text', mime };
  return { kind: 'unsupported', mime };
}

export async function readMediaPreview(response, mime, signal, maxBytes = MAX_MEDIA_PREVIEW_BYTES) {
  const tooLarge = () => Object.assign(new Error('Media preview exceeds size limit.'), { code: 'PREVIEW_TOO_LARGE' });
  if (Number(response.headers?.get('Content-Length')) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!response.body?.getReader) {
    const blob = await response.blob();
    if (blob.size > maxBytes) throw tooLarge();
    return blob.slice(0, blob.size, mime);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Preview cancelled.', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw tooLarge();
      chunks.push(value);
    }
    return new Blob(chunks, { type: mime });
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function previewErrorMessage(error) {
  if (error?.code === 'PREVIEW_TOO_LARGE') return 'This file is too large for the preview (128 MiB). Download it to view the original.';
  if (error?.status === 401) return 'Authentication required (401). Please log in again.';
  if (error?.status === 403) return 'Preview denied (403). You do not have read permission for this file.';
  if (error?.status === 404) return 'File not found (404). It may have been moved or deleted.';
  return 'The preview could not be loaded. Try again or download the file.';
}
