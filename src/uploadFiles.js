export class UploadError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

export async function uploadFileVerified({ folderUrl, file, contentType, fetcher, signal, onPhase = () => {} }) {
  if (!file || !file.name || /[\\/]/.test(file.name) || ['.', '..'].includes(file.name)) {
    throw new UploadError('INVALID_NAME');
  }
  const url = new URL(encodeURIComponent(file.name), folderUrl).href;
  onPhase('Uploading...');
  // Pass the original File unchanged. In particular, do not parse, slice or
  // buffer CSV contents in memory. The Pod's access rules still apply.
  const response = await fetcher(url, {
    method: 'PUT', body: file, signal, redirect: 'error',
    headers: { 'Content-Type': contentType || 'application/octet-stream' },
  });
  if (!response.ok) throw new UploadError('HTTP', response.status);
  onPhase('Verifying uploaded size...');
  let head;
  try {
    head = await fetcher(url, { method: 'HEAD', cache: 'no-store', signal, redirect: 'error',
      headers: { 'Cache-Control': 'no-cache' } });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { url, verified: false };
  }
  // Write-only access is valid in Solid. Do not claim failure or remove the
  // resource when a writer cannot read it back, or verification is unavailable.
  const length = head.headers.get('Content-Length');
  if (!head.ok || head.headers.get('Content-Encoding') || !/^\d+$/.test(length || '')) return { url, verified: false };
  const writtenEtag = response.headers.get('ETag'), currentEtag = head.headers.get('ETag');
  if (writtenEtag && currentEtag && writtenEtag !== currentEtag) return { url, verified: false };
  if (Number(length) !== file.size) throw new UploadError('SIZE_MISMATCH');
  return { url, verified: true };
}

export function uploadErrorMessage(error) {
  if (error?.code === 'INVALID_NAME') return 'Invalid file name.';
  if (error?.code === 'SIZE_MISMATCH') return 'The saved file size does not match the original. Keep your original file and upload it again.';
  if (error?.status === 401) return 'Authentication required (401). Please log in again.';
  if (error?.status === 403) return 'Upload denied (403). You do not have write permission for this folder.';
  if (error?.status === 413) return 'The Pod server rejected the file size (413). Contact the server administrator.';
  if ([408, 504].includes(error?.status)) return 'The upload timed out. Check the saved file before trying again.';
  if (error?.status === 507) return 'The Pod has insufficient storage (507).';
  if (error?.status === 409) return 'The destination folder is unavailable or has changed. Refresh and try again.';
  if (error?.status === 412) return 'The file changed during upload. Refresh before trying again.';
  if (error?.status >= 500) return 'The Pod server could not complete the upload. Check the saved file before trying again.';
  return 'The upload could not be confirmed. Check your connection and the saved file before trying again.';
}
