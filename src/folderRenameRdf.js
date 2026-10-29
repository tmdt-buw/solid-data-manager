import { Parser, Writer, DataFactory } from 'n3';
const { namedNode, quad, literal } = DataFactory;
export const LDP = 'http://www.w3.org/ns/ldp#';
const ACL = 'http://www.w3.org/ns/auth/acl#';
export const parseRdf = (text, baseIRI) => new Parser({ baseIRI, blankNodePrefix: '' }).parse(text);
export const writeRdf = quads => new Promise((resolve, reject) => {
  const writer = new Writer({ format: 'text/turtle' }); writer.addQuads(quads); writer.end((error, text) => error ? reject(error) : resolve(text));
});
export function relocated(value, source, target) {
  return typeof value === 'string' && value.startsWith(source) ? target + value.slice(source.length) : value;
}
export function relocateJson(value, source, target) {
  if (typeof value === 'string') return relocated(value, source, target);
  if (Array.isArray(value)) return value.map(v => relocateJson(v, source, target));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, relocateJson(v, source, target)]));
  return value;
}
export async function relocateRdf(text, documentUrl, source, target, { acl = false, container = false } = {}) {
  let changed = false;
  const node = term => {
    if (term.termType !== 'NamedNode') return term;
    const value = relocated(term.value, source, target); changed ||= value !== term.value;
    return value === term.value ? term : namedNode(value);
  };
  const input = parseRdf(text, documentUrl);
  const result = input.filter(q => !container || ![LDP + 'contains', 'http://www.w3.org/ns/posix/stat#mtime', 'http://www.w3.org/ns/posix/stat#size', 'http://purl.org/dc/terms/modified'].includes(q.predicate.value)).map(q => {
    // ACL principals (WebIDs, groups, origins) are identities, not file paths.
    let object = !acl || [ACL + 'accessTo', ACL + 'default', ACL + 'defaultForNew'].includes(q.predicate.value) ? node(q.object) : q.object;
    if (!acl && q.predicate.value === 'https://w3id.org/solid-dataspace-manager#connectionOptionsJson' && q.object.termType === 'Literal') {
      const before = JSON.parse(q.object.value), after = relocateJson(before, source, target);
      if (JSON.stringify(before) !== JSON.stringify(after)) { object = literal(JSON.stringify(after), q.object.datatype); changed = true; }
    }
    return quad(node(q.subject), q.predicate, object, q.graph);
  });
  return { changed, text: changed || container ? await writeRdf(result) : text };
}
export function links(header, relation, base) {
  return [...String(header || '').matchAll(/<([^>]+)>\s*((?:;\s*[^,]*)?)/g)].filter(m => {
    const rel = /(?:^|;)\s*rel\s*=\s*(?:"([^"]+)"|([^;\s,]+))/i.exec(m[2]);
    return (rel?.[1] || rel?.[2] || '').split(/\s+/).includes(relation);
  }).map(m => new URL(m[1], base).href);
}
export function children(text, url) {
  return [...new Set(parseRdf(text, url).filter(q => q.subject.value === url && q.predicate.value === LDP + 'contains').map(q => {
    if (q.object.termType !== 'NamedNode') throw Error('Unsafe folder contents.');
    const u = new URL(q.object.value), rel = u.href.slice(url.length);
    if (!u.href.startsWith(url) || !rel || u.search || u.hash || u.username || u.password || /%2f|%5c|%2e|\\/i.test(u.pathname) || new URL(u.pathname.endsWith('/') ? '..' : '.', u).href !== url) throw Error('Unsafe folder contents.');
    return u.href;
  }))].sort();
}
const managedPredicates = new Set([LDP+'contains', 'http://purl.org/dc/terms/modified', 'http://www.w3.org/ns/posix/stat#mtime', 'http://www.w3.org/ns/posix/stat#size', 'http://www.w3.org/ns/ma-ont#format']);
export function customMetadata(text, url) {
  return parseRdf(text, url).filter(q => !managedPredicates.has(q.predicate.value) && !(q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' && [LDP+'Resource',LDP+'Container',LDP+'BasicContainer'].includes(q.object.value)));
}
export const metadataSignature = (text, url) => JSON.stringify(customMetadata(text, url).map(q => JSON.stringify([q.subject,q.predicate,q.object,q.graph])).sort());
export function relocateConnectionIndex(json, source, target) {
  if (!['Custom API Response','Home Assistant Entities'].includes(json?.profile) || !Array.isArray(json.entries)) return null;
  const copy = JSON.parse(JSON.stringify(json));
  if (typeof copy.resource_path === 'string') copy.resource_path = relocated(copy.resource_path, new URL(source).pathname, new URL(target).pathname);
  for (const entry of copy.entries) if (Array.isArray(entry?.body?.resources)) {
    for (const resource of entry.body.resources) if (typeof resource.url === 'string') resource.url = relocated(resource.url, source, target);
  }
  return copy;
}
