const LOGIN_TARGET_KEY = 'solid-data-manager:login-target';
const MAX_LOGIN_AGE = 30 * 60 * 1000;
const hasControl = (value, includeSpace = false) => Array.from(value).some(char =>
  char.charCodeAt(0) <= (includeSpace ? 32 : 31) || char.charCodeAt(0) === 127);

export function resourceUri(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192 || (hasControl(value, true) || value.includes(String.fromCharCode(92)))) {
    throw new Error('Use an absolute HTTP or HTTPS URL for uri.');
  }
  let url;
  try { url = new URL(value); } catch { throw new Error('Use an absolute HTTP or HTTPS URL for uri.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || /%(?:2f|5c|00)/i.test(url.pathname)) {
    throw new Error('Use a resource URL without credentials or query parameters.');
  }
  try {
    if (hasControl(decodeURIComponent(url.pathname))) throw new Error();
  } catch { throw new Error('Use an absolute HTTP or HTTPS URL for uri.'); }
  // RDF fragments identify things within a document; the browser opens that document.
  url.hash = '';
  return url.href;
}

export function uriFromSearch(search) {
  const values = new URLSearchParams(search).getAll('uri');
  if (values.length > 1) throw new Error('Provide exactly one uri parameter.');
  return values.length ? resourceUri(values[0]) : null;
}

function appScope(href) {
  const url = new URL(href);
  return url.origin + url.pathname.replace(/\/$/, '');
}

export function clearLoginTarget() {
  try { window.sessionStorage.removeItem(LOGIN_TARGET_KEY); } catch { /* Storage may be disabled. */ }
}

export function rememberLoginTarget(href = window.location.href) {
  clearLoginTarget();
  const redirect = new URL(href);
  for (const key of ['code', 'state', 'iss', 'error', 'error_description', 'session_state']) redirect.searchParams.delete(key);
  try {
    const uri = uriFromSearch(redirect.search);
    if (uri) window.sessionStorage.setItem(LOGIN_TARGET_KEY, JSON.stringify({ uri, scope: appScope(href), savedAt: Date.now() }));
  } catch { /* Invalid targets are reported by the file browser after login. */ }
  return redirect.href;
}

export function restoreLoginTarget(isCallback) {
  if (!isCallback) return;
  try {
    const pending = JSON.parse(window.sessionStorage.getItem(LOGIN_TARGET_KEY) || 'null');
    clearLoginTarget();
    const url = new URL(window.location.href);
    if (!pending || url.searchParams.has('uri') || pending.scope !== appScope(url.href) ||
      !Number.isFinite(pending.savedAt) || Date.now() - pending.savedAt < 0 || Date.now() - pending.savedAt > MAX_LOGIN_AGE) return;
    url.searchParams.set('uri', resourceUri(pending.uri));
    window.history.replaceState(window.history.state, '', url.href);
  } catch { clearLoginTarget(); }
}
