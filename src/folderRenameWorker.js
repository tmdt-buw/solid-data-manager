export async function createRenameWorker(fetcher, webId) {
  const root = new URL('/sync-worker/participants/relocations', window.location.origin).href;
  const response = await fetcher(`${root}?webId=${encodeURIComponent(webId)}`, { cache: 'no-store' });
  if (!response.ok) throw Error('Folder rename coordination is unavailable. No files were changed.');
  const status = await response.json();
  if (typeof status.namespace !== 'string' || !('active' in status)) throw Error('Folder rename coordination is unavailable. No files were changed.');
  return {
    status,
    async call(action, record) {
      const response = await fetcher(root, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webId, action, id: record.id, source: record.source, target: record.target }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Folder rename coordination failed.');
      return result;
    }
  };
}
