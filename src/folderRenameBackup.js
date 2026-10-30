import { zipSync, strToU8 } from 'fflate';
import { saveDownload } from './downloadResources';

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('solid-data-manager-folder-renames', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('moves', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(Error('The backup could not be saved. No rename was started.'));
  });
}
export function createRenameJournal(webId) {
  return {
    async save(record) {
      const db = await database();
      try { await new Promise((resolve, reject) => {
        const tx = db.transaction('moves', 'readwrite'); tx.objectStore('moves').put({ ...record, webId });
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(Error('The backup could not be saved.'));
      }); } finally { db.close(); }
    },
    async pending() {
      const db = await database();
      try { return await new Promise((resolve, reject) => {
        const request = db.transaction('moves').objectStore('moves').getAll();
        request.onsuccess = () => resolve(request.result.filter(r => r.webId === webId && r.phase !== 'done'));
        request.onerror = reject;
      }); } finally { db.close(); }
    },
    async remove(id) {
      const db = await database();
      try { await new Promise((resolve, reject) => {
        const tx = db.transaction('moves', 'readwrite'); tx.objectStore('moves').delete(id);
        tx.oncomplete = resolve; tx.onerror = tx.onabort = reject;
      }); } finally { db.close(); }
    }
  };
}
export function renameBackupName(record) {
  let name = 'folder';
  try { name = decodeURIComponent(new URL(record.source).pathname.split('/').filter(Boolean).pop() || '') || name; } catch { /* Use the fallback name. */ }
  // Strip control characters as well as platform-specific filename separators.
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80) || 'folder';
  const date = /^\d{4}-\d{2}-\d{2}/.exec(record.createdAt || '')?.[0] || 'undated';
  return `${name}-backup-${date}.zip`;
}

export function downloadRenameBackup(record) {
  const manifest = { id: record.id, createdAt: record.createdAt, source: record.source, target: record.target, resources: [], references: [], ancestors: [] };
  const files = {};
  for (const [kind, rows] of [['resources', record.resources], ['references', record.references], ['ancestors', record.ancestors]]) {
    rows.forEach((r, i) => {
      const path = `${kind}/${i}.bin`; if (r.bytes) files[path] = r.bytes;
      const item = { url: r.url, file: r.bytes ? path : undefined, contentType: r.type, etag: r.etag, sha256: r.hash, container: r.container, inheritedAcl: r.acl?.absent === true };
      if (r.acl?.bytes) { item.acl = { url: r.acl.url, file: `${kind}/${i}.acl`, sha256: r.acl.hash }; files[item.acl.file] = r.acl.bytes; }
      if (r.meta?.bytes) { item.metadata = { url: r.meta.url, file: `${kind}/${i}.meta`, sha256: r.meta.hash }; files[item.metadata.file] = r.meta.bytes; }
      manifest[kind].push(item);
    });
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  saveDownload(new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' }), renameBackupName(record));
}
