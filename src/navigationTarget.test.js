import { resourceUri, uriFromSearch, rememberLoginTarget, restoreLoginTarget, clearLoginTarget } from './navigationTarget';
const file = 'https://storage.example/alice/my%20file.csv';
const query = '?uri=' + encodeURIComponent(file);
beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, '', '/solid-data-manager/'); });

test('decodes the query exactly once, preserving a percent-encoded file name', () => {
  expect(uriFromSearch(query)).toBe(file);
  expect(uriFromSearch('?lang=de')).toBe(null);
  expect(uriFromSearch('?uri=' + encodeURIComponent(file + '#it'))).toBe(file);
});
test.each(['?uri=', '?uri=https://example.org/&uri=https://other.example/', '?uri=%2Frelative', '?uri=javascript%3Aalert(1)'])('invalid parameter %s is reported', search => {
  expect(() => uriFromSearch(search)).toThrow();
});
test.each(['https://example.org/bad%path', 'https://example.org/a%00b', 'https://example.org/a\\b'])('invalid resource encoding is rejected: %s', value => {
  expect(() => resourceUri(value)).toThrow();
});
test('login return URL retains the target and language while removing old OAuth parameters', () => {
  window.history.replaceState(null, '', '/solid-data-manager/' + query + '&lang=de&code=old&state=old');
  const redirect = new URL(rememberLoginTarget());
  expect(redirect.searchParams.get('uri')).toBe(file); expect(redirect.searchParams.get('lang')).toBe('de');
  expect(redirect.searchParams.has('code')).toBe(false); expect(redirect.searchParams.has('state')).toBe(false);
});
test('restores the destination if the authentication callback has removed custom parameters', () => {
  window.history.replaceState({ preserved: true }, '', '/solid-data-manager/' + query);
  rememberLoginTarget();
  window.history.replaceState({ preserved: true }, '', '/solid-data-manager/?lang=de');
  restoreLoginTarget(true);
  expect(uriFromSearch(location.search)).toBe(file);
  expect(new URLSearchParams(location.search).get('lang')).toBe('de');
  expect(window.history.state).toEqual({ preserved: true }); expect(sessionStorage.length).toBe(0);
});
test('does not replace an explicit target after callback', () => {
  window.history.replaceState(null, '', '/solid-data-manager/' + query); rememberLoginTarget();
  window.history.replaceState(null, '', '/solid-data-manager/?uri=' + encodeURIComponent('https://other.example/pod/'));
  restoreLoginTarget(true); expect(uriFromSearch(location.search)).toBe('https://other.example/pod/');
});
test.each(['ordinary navigation', 'other app', 'expired callback', 'cleared on logout'])('does not reopen a stale destination after %s', scenario => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000000);
  window.history.replaceState(null, '', '/solid-data-manager/' + query); rememberLoginTarget();
  window.history.replaceState(null, '', scenario === 'other app' ? '/catalog/' : '/solid-data-manager/');
  if (scenario === 'expired callback') now.mockReturnValue(1000000 + 31 * 60 * 1000);
  if (scenario === 'cleared on logout') clearLoginTarget();
  restoreLoginTarget(scenario !== 'ordinary navigation');
  expect(new URLSearchParams(location.search).has('uri')).toBe(false); now.mockRestore();
});
