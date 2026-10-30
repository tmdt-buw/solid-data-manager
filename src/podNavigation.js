import { getPodUrlAll } from '@inrupt/solid-client';
import { resourceUri } from './navigationTarget';

const STORAGE = 'http://www.w3.org/ns/pim/space#Storage';
const CONTAINERS = ['http://www.w3.org/ns/ldp#Container', 'http://www.w3.org/ns/ldp#BasicContainer', STORAGE];

export function containsResource(root, target) {
  const base = new URL(root), url = new URL(target);
  return base.origin === url.origin && url.pathname.startsWith(base.pathname) && base.pathname.endsWith('/');
}

function hasType(response, types) {
  const header = response?.headers?.get('Link') || '';
  return header.split(/,(?=\s*<)/).some(part => {
    const target = part.match(/^\s*<([^>]+)>/);
    const rel = part.match(/;\s*rel\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
    return target && types.includes(target[1]) && (rel?.[1] || rel?.[2] || '').split(/\s+/).includes('type');
  });
}

function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('Navigation cancelled.', 'AbortError');
}

function legacyRoot(webId) {
  const url = new URL(webId);
  const match = url.pathname.match(/^(.*\/)profile\//);
  return match ? new URL(match[1], url.origin).href : null;
}

async function head(url, fetcher, signal) {
  abortIfNeeded(signal);
  const response = await fetcher(url, { method: 'HEAD', signal });
  abortIfNeeded(signal);
  if (response.url && response.url !== url && response.url !== url + '/') {
    throw new Error('The resource redirected to a different location. Open its direct URL instead.');
  }
  return response;
}

async function findStorage(container, fetcher, signal) {
  let current = container;
  for (let depth = 0; depth < 32; depth += 1) {
    const response = await head(current, fetcher, signal);
    if (response.ok && hasType(response, [STORAGE])) return current;
    const parent = new URL('..', current).href;
    if (parent === current) break;
    current = parent;
  }
  throw new Error('The Pod storage could not be identified. Check the profile storage links or the server storage headers.');
}

export async function resolvePodNavigation({ webId, uri, fetcher, signal }) {
  // Validate the target before making any network request.
  let target = uri == null ? null : resourceUri(uri);
  let roots = [], profileError;
  try {
    const discovered = await getPodUrlAll(webId, { fetch: (url, init = {}) => fetcher(url, { ...init, signal }) });
    roots = [...new Set(discovered.map(value => {
      try { const root = resourceUri(value); return root.endsWith('/') ? root : null; } catch { return null; }
    }).filter(Boolean))];
  } catch (error) {
    abortIfNeeded(signal);
    profileError = error;
  }
  abortIfNeeded(signal);
  if (!target) {
    if (roots.length) return { rootUrl: roots[0], containerUrl: roots[0], fileUrl: null };
    if (profileError) throw new Error('The WebID profile could not be read. Please try again.');
    // Compatibility for existing profile/card Pods without an advertised storage.
    const candidate = legacyRoot(webId);
    if (candidate) return { rootUrl: candidate, containerUrl: candidate, fileUrl: null };
    throw new Error('No Pod storage is linked from this WebID profile.');
  }
  let isContainer = target.endsWith('/');
  if (!isContainer) {
    const response = await head(target, fetcher, signal);
    if (!response.ok && ![405, 501].includes(response.status)) {
      const error = new Error('The linked resource could not be opened.'); error.status = response.status; throw error;
    }
    isContainer = response.ok && (hasType(response, CONTAINERS) || response.url?.endsWith('/'));
    if (isContainer) target += '/';
  }
  const containerUrl = isContainer ? target : new URL('.', target).href;
  const matching = roots.filter(root => containsResource(root, containerUrl)).sort((a, b) => b.length - a.length);
  let rootUrl = matching[0];
  if (!rootUrl && !roots.length && !profileError) {
    const candidate = legacyRoot(webId);
    if (candidate && containsResource(candidate, containerUrl)) rootUrl = candidate;
  }
  if (!rootUrl) rootUrl = await findStorage(containerUrl, fetcher, signal);
  abortIfNeeded(signal);
  return { rootUrl, containerUrl, fileUrl: isContainer ? null : target };
}

export function navigationErrorMessage(error) {
  if (error?.status === 401) return 'Authentication required (401). Please log in again.';
  if (error?.status === 403) return 'Access denied (403). You do not have permission to open this resource.';
  if (error?.status === 404) return 'Resource not found (404). It may have been moved or deleted.';
  return error?.message || 'Opening folder failed. Please try again or check your connection.';
}
