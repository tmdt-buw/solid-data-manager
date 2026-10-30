import { children, links, relocated, relocateRdf, relocateConnectionIndex, customMetadata, metadataSignature, writeRdf, parseRdf, LDP } from './folderRenameRdf';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const MAX_BYTES = 128 * 1024 * 1024, MAX_RESOURCES = 10000;
const strongTag = response => {
  const value = response.headers.get('etag');
  if (!value || value.startsWith('W/')) throw Error('A resource has no safe version identifier. Rename stopped.');
  return value;
};
const defaultHash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
const can = (response, mode) => [...String(response.headers.get('wac-allow') || '').matchAll(/(?:^|,)\s*(?:user|public)\s*=\s*"([^"]*)"/g)].some(m => m[1].split(/\s+/).includes(mode));
export function folderRenameTarget(source, parentUrl, name, podRoot) {
  const trimmed = String(name || '').trim(), a = new URL(source), parent = new URL(parentUrl), root = new URL(podRoot);
  if (!trimmed || trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed) || [...trimmed].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || /\.(acl|meta)$/i.test(trimmed)) throw Error('Invalid folder name.');
  const target = new URL(encodeURIComponent(trimmed) + '/', parent).href;
  if (!a.pathname.endsWith('/') || a.search || a.hash || !a.href.startsWith(root.href) || a.href === root.href || new URL('..', a).href !== parent.href) throw Error('Invalid rename source.');
  if ([a.href, target].some(u => /^(?:profile|catalog|settings|inbox|credentials|\.well-known)(?:\/|$)/.test(u.slice(root.href.length)) || ['connections/', 'connections/test/'].includes(u.slice(root.href.length)))) throw Error('Application system folders cannot be renamed.');
  return target;
}

export async function renameFolder({ source, target, podRoot, webId, fetcher, journal, worker, onProgress = () => {}, hash = defaultHash, record: resume }) {
  let total = 0, count = 0;
  const request = async (url, init = {}) => {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(60000), redirect: 'error', cache: 'no-store' });
    if (response.url && response.url !== url) throw Error('A resource redirected. Rename stopped.');
    return response;
  };
  const read = async (url, { optional = false, acl = false, metadata = false } = {}) => {
    const response = await request(url, { headers: { Accept: acl || url.endsWith('/') ? 'text/turtle' : '*/*' } });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw Error('A file, folder or permission could not be read. Rename stopped.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_BYTES - total) throw Error('Folder rename exceeds the 128 MiB backup limit.');
    let bytes;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (total + size > MAX_BYTES) throw Error('Folder rename exceeds the 128 MiB backup limit.'); chunks.push(value); } }
      catch (error) { await reader.cancel().catch(() => {}); throw error; }
      bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    } else bytes = new Uint8Array(await response.arrayBuffer());
    total += bytes.length; if (total > MAX_BYTES || ++count > MAX_RESOURCES) throw Error('Folder rename exceeds the backup limit.');
    return { url, bytes, etag: metadata ? response.headers.get("etag") : strongTag(response), type: response.headers.get('content-type') || 'application/octet-stream', hash: await hash(bytes), link: response.headers.get('link') || '', writable: can(response, 'write'), control: can(response, 'control') };
  };
  const aclFor = async resource => {
    const urls = links(resource.link, 'acl', resource.url);
    if (urls.length !== 1 || !urls[0].startsWith(podRoot)) throw Error('Permissions cannot be preserved for this folder.');
    const value = await read(urls[0], { optional: true, acl: true });
    return value || { url: urls[0], absent: true };
  };
  const snapshot = async url => {
    const r = await read(url); r.container = url.endsWith('/');
    if (!r.writable || !r.control) throw Error('Read, write and permission management are required to rename a folder.');
    r.acl = await aclFor(r);
    if (!r.acl.absent && parseRdf(decoder.decode(r.acl.bytes), r.acl.url).some(q => ['http://www.w3.org/ns/auth/acl#agent','http://www.w3.org/ns/auth/acl#agentGroup'].includes(q.predicate.value) && q.object.value.startsWith(source))) throw Error('Folders containing permission identities require a separate migration.');
    const metadata = links(r.link, 'describedby', url);
    if (metadata.length) {
      if (metadata.length !== 1 || !metadata[0].startsWith(podRoot)) throw Error('Resource metadata cannot be preserved.');
      r.meta = await read(metadata[0], { optional: true, acl: true, metadata: true });
    }
    if (r.container) r.children = children(decoder.decode(r.bytes), url);
    return r;
  };
  const verifyOriginal = async r => {
    const response = await request(r.url, { method: 'HEAD', headers: { Accept: r.type } });
    if (!response.ok || strongTag(response) !== r.etag) throw Error('A source or reference changed. Rename stopped to preserve the newer version.');
  };
  const verifyAcl = async r => {
    const response = await request(r.acl.url, { method: 'HEAD' });
    if (r.acl.absent ? response.status !== 404 : !response.ok || strongTag(response) !== r.acl.etag) throw Error('Permissions changed. Rename stopped.');
    if (r.meta) {
      const originalTotal = total;
      const current = await read(r.meta.url, { acl: true, metadata: true }); total = originalTotal; count--;
      if (metadataSignature(decoder.decode(current.bytes), r.meta.url) !== metadataSignature(decoder.decode(r.meta.bytes), r.meta.url)) throw Error('Resource metadata changed. Rename stopped.');
    }
  };
  const update = async (url, bytes, type, etag, container = false) => {
    const response = await request(url, { method: 'PUT', headers: { 'Content-Type': type, ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }), ...(container ? { Link: `<${LDP}BasicContainer>; rel="type"` } : {}) }, body: bytes });
    if (!response.ok) throw Error('A conditional write failed. Existing files were preserved.');
    return response;
  };
  const verified = async (url, bytes) => {
    // Verification is separately bounded and does not count toward backup size.
    const savedTotal = total, savedCount = count; total = 0; count = 0;
    try { const r = await read(url); if (r.hash !== await hash(bytes)) throw Error('The copied file could not be verified.'); return r; }
    finally { total = savedTotal; count = savedCount; }
  };
  const save = () => journal.save(record);
  let record = resume || { id: crypto.randomUUID(), source, target, podRoot, webId, createdAt: new Date().toISOString(), phase: 'planning', resources: [], references: [], ancestors: [], copied: {}, removed: {}, rewritten: {} };
  if ([record.source, record.target, record.podRoot, record.webId].some((v, i) => v !== [source, target, podRoot, webId][i])) throw Error('The pending rename belongs to another folder.');
  const step = text => onProgress(text);
  // A saved intent lets the same browser recover a gate after a lost response.
  await save();
  step('Waiting for Data Connection...');
  try {
    await worker.call('begin', record);
    if (record.phase === 'planning') {
      const exists = await request(target, { method: 'HEAD' });
      if (exists.status !== 404) throw Error('The target already exists or cannot be checked.');
      step('Backing up files and permissions...');
      const resources = [];
      async function walk(url, depth = 0) {
        if (depth > 64) throw Error('Folder nesting exceeds the rename limit.');
        const r = await snapshot(url); resources.push(r);
        for (const child of r.children || []) await walk(child, depth + 1);
      }
      await walk(source);
      const ancestors = [];
      for (let url = new URL('..', source).href; url.startsWith(podRoot); url = new URL('..', url).href) {
        const r = await read(url); r.acl = await aclFor(r); ancestors.push({ url, acl: r.acl });
        if (url === podRoot) break;
      }
      step('Checking catalog and connection references...');
      const references = [], seen = new Set();
      async function scan(url, recursive, optional = true) {
        const container = await read(url, { optional }); if (!container) return;
        for (const child of children(decoder.decode(container.bytes), url)) {
          if (child.startsWith(source) || child.startsWith(target) || seen.has(child)) continue;
          seen.add(child);
          if (child.endsWith('/')) { if (recursive) await scan(child, true, false); continue; }
          if (!/\.(ttl|n3)$/i.test(new URL(child).pathname)) continue;
          const r = await read(child);
          const rewritten = await relocateRdf(decoder.decode(r.bytes), child, source, target);
          if (rewritten.changed) {
            if (!r.writable) throw Error('A catalog or connection reference cannot be updated.');
            r.after = encoder.encode(rewritten.text); references.push(r);
          }
        }
      }
      await scan(podRoot + 'catalog/', true);
      await scan(podRoot + 'connections/', false);
      await scan(podRoot + 'connections/test/', false);
      record = { ...record, resources, ancestors, references, phase: 'backed-up' };
      await save();
    }
    if (record.phase === 'backed-up') {
      for (const r of record.resources) { await verifyOriginal(r); await verifyAcl(r); }
      for (const r of record.ancestors) await verifyAcl(r);
      for (const r of record.references) await verifyOriginal(r);
      record.phase = 'copying'; await save();
    }
    if (record.phase === 'copying') {
      total = 0; count = 0;
      step('Copying and verifying files...');
      for (const r of record.resources) {
        const dest = relocated(r.url, source, target);
        if (record.copied[r.url]?.complete) continue;
        let state = record.copied[r.url];
        if (!state) {
          await update(dest, encoder.encode(r.container ? `<> a <${LDP}BasicContainer>.` : ''), r.container ? 'text/turtle' : r.type, null, r.container);
          const created = await read(dest); total -= created.bytes.length; count--;
          if (r.container && children(decoder.decode(created.bytes), dest).length) throw Error('The destination changed. Rename stopped.');
          state = record.copied[r.url] = { etag: created.etag }; await save();
        }
        let targetInfo = await read(dest); total -= targetInfo.bytes.length; count--;
        if (targetInfo.etag !== state.etag) {
          // A lost response can leave the final bytes already written; accept
          // only the exact expected representation, never arbitrary new data.
          if (!state.expected || targetInfo.hash !== await hash(state.expected)) throw Error('The destination changed. Rename stopped.');
          state.etag = targetInfo.etag;
        }
        const aclUrl = links(targetInfo.link, 'acl', dest)[0];
        if (!aclUrl || !aclUrl.startsWith(podRoot)) throw Error('Destination permissions are unavailable.');
        if (!state.aclReady) {
          let aclText;
          if (!r.acl.absent) aclText = (await relocateRdf(decoder.decode(r.acl.bytes), r.acl.url, source, target, { acl: true })).text;
          else if (r.url === source) aclText = `@prefix acl: <http://www.w3.org/ns/auth/acl#>. <#owner> a acl:Authorization; acl:agent <${webId}>; acl:accessTo <${dest}>; acl:default <${dest}>; acl:mode acl:Read, acl:Write, acl:Append, acl:Control.`;
          if (aclText) {
            // The root remains owner-only until all files have been copied.
            if (r.url === source) aclText = `@prefix acl: <http://www.w3.org/ns/auth/acl#>. <#owner> a acl:Authorization; acl:agent <${webId}>; acl:accessTo <${dest}>; acl:default <${dest}>; acl:mode acl:Read, acl:Write, acl:Append, acl:Control.`;
            const bytes = encoder.encode(aclText);
            const existing = await request(aclUrl, { method: 'HEAD' });
            if (existing.status === 404) await update(aclUrl, bytes, 'text/turtle');
            else await verified(aclUrl, bytes); // Retry only our exact ACL.
            const acl = await verified(aclUrl, bytes); state.aclEtag = acl.etag;
          }
          if (!aclText && (await request(aclUrl, { method: 'HEAD' })).status !== 404) throw Error('Destination permissions changed. Rename stopped.');
          state.aclUrl = aclUrl; state.aclReady = true; await save();
        }
        let bytes = r.bytes;
        if (r.container) bytes = encoder.encode('');
        // Only Data Connection indexes contain locations which must follow the
        // rename. Ordinary JSON files and measurement payloads stay byte-exact.
        else if (/json/i.test(r.type)) {
          try {
            const json = JSON.parse(decoder.decode(bytes)), index = relocateConnectionIndex(json, source, target);
            if (index) bytes = encoder.encode(JSON.stringify(index, null, 2));
          } catch { /* Non-index JSON is copied verbatim, including malformed legacy files. */ }
        }
        state.expected = bytes; await save();
        if (!r.container) {
          await update(dest, bytes, r.type, state.etag);
          state.etag = (await verified(dest, bytes)).etag;
        }
        if (r.meta && customMetadata(decoder.decode(r.meta.bytes), r.meta.url).length) {
          const metaUrl = links(targetInfo.link, 'describedby', dest)[0];
          if (!metaUrl || !metaUrl.startsWith(podRoot)) throw Error('Destination metadata is unavailable.');
          const custom = await writeRdf(customMetadata(decoder.decode(r.meta.bytes), r.meta.url));
          const after = (await relocateRdf(custom, r.meta.url, source, target)).text;
          const before = await read(metaUrl, { metadata: true, acl: true }); total -= before.bytes.length; count--;
          const signature = metadataSignature(decoder.decode(before.bytes), metaUrl);
          const wanted = metadataSignature(after, metaUrl);
          if (signature !== wanted) {
            if (customMetadata(decoder.decode(before.bytes), metaUrl).length) throw Error('Destination metadata changed. Rename stopped.');
            const response = await request(metaUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/sparql-update' }, body: `INSERT DATA { ${after} }` });
            if (!response.ok) throw Error('Resource metadata could not be copied.');
          }
          const check = await read(metaUrl, { metadata: true, acl: true }); total -= check.bytes.length; count--;
          if (metadataSignature(decoder.decode(check.bytes), metaUrl) !== wanted) throw Error('Resource metadata could not be verified.');
        }
        state.complete = true; await save();
      }
      record.phase = 'references'; await save();
    }
    if (record.phase === 'references') {
      total = 0; count = 0;
      step('Updating catalog and Data Connection references...');
      for (const r of record.resources) { await verifyOriginal(r); await verifyAcl(r); }
      for (const r of record.ancestors) await verifyAcl(r);
      for (const r of record.resources) {
        const dest = relocated(r.url, source, target);
        if (!r.container) await verified(dest, record.copied[r.url].expected);
        else {
          const current = await read(dest); total -= current.bytes.length; count--;
          const expected = r.children.map(url => relocated(url, source, target)).sort();
          if (JSON.stringify(children(decoder.decode(current.bytes), dest)) !== JSON.stringify(expected)) throw Error('Destination contents changed. Rename stopped.');
        }
      }
      // Restore the original root policy before publishing references.
      const root = record.resources[0], state = record.copied[root.url];
      if (!record.permissionsRestored) {
        if (root.acl.absent) {
          const response = await request(state.aclUrl, { method: 'DELETE', headers: { 'If-Match': state.aclEtag } });
          if (!response.ok && response.status !== 404) throw Error('Folder permissions could not be restored.');
        } else {
          const bytes = encoder.encode((await relocateRdf(decoder.decode(root.acl.bytes), root.acl.url, source, target, { acl: true })).text);
          const current = await request(state.aclUrl, { method: 'HEAD' });
          if (strongTag(current) === state.aclEtag) await update(state.aclUrl, bytes, 'text/turtle', state.aclEtag);
          else await verified(state.aclUrl, bytes);
        }
        record.permissionsRestored = true; await save();
      }
      for (const r of record.references) {
        if (record.rewritten[r.url]) continue;
        const current = await read(r.url); total -= current.bytes.length; count--;
        if (current.etag === r.etag) await update(r.url, r.after, r.type, r.etag);
        else if (current.hash !== await hash(r.after)) throw Error('A catalog or connection reference changed. Rename remains paused.');
        await verified(r.url, r.after); record.rewritten[r.url] = true; await save();
      }
      await worker.call('commit', record);
      record.phase = 'deleting'; await save();
    }
    if (record.phase === 'deleting') {
      total = 0; count = 0;
      step('Finishing folder rename...');
      for (const r of [...record.resources].reverse()) {
        if (record.removed[r.url]) continue;
        const dest = relocated(r.url, source, target);
        // Re-read the destination and its policy immediately before discarding
        // an original, including on recovery after a browser restart.
        const targetAcl = record.copied[r.url].aclUrl;
        if (r.acl.absent) {
          if ((await request(targetAcl, { method: 'HEAD' })).status !== 404) throw Error('Destination permissions changed. Rename stopped.');
        } else {
          const expectedAcl = encoder.encode((await relocateRdf(decoder.decode(r.acl.bytes), r.acl.url, source, target, { acl: true })).text);
          await verified(targetAcl, expectedAcl);
        }
        if (!r.container) await verified(dest, record.copied[r.url].expected);
        const current = await read(r.url, { optional: true });
        if (!current) { record.removed[r.url] = true; await save(); continue; }
        total -= current.bytes.length; count--;
        await verifyAcl(r);
        if (r.container) {
          if (children(decoder.decode(current.bytes), r.url).length) throw Error('The source folder contains new files. Rename remains paused.');
        } else if (current.etag !== r.etag) throw Error('A source file changed. Its newer version was preserved.');
        const response = await request(r.url, { method: 'DELETE', headers: { 'If-Match': current.etag } });
        if (!response.ok) throw Error('The old folder could not be removed completely. Resume the rename.');
        record.removed[r.url] = true; await save();
      }
      await worker.call('finish', record);
      record.phase = 'done'; await save();
    }
    return record;
  } catch (error) {
    if (['planning','backed-up'].includes(record.phase)) {
      try { await worker.call('cancel', record); await journal.remove(record.id); } catch { /* Keep the recovery journal if the gate cannot be released. */ }
    }
    error.renameId = record.id;
    error.partial = !['planning','backed-up'].includes(record.phase);
    throw error;
  }
}
