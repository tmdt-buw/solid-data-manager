import { restoreSession, setSession } from './solidSession';
import { rememberLoginTarget } from './navigationTarget';
jest.mock('@inrupt/solid-client-authn-browser', () => ({ Session: jest.fn(() => ({})) }));
const target = 'https://storage.example/alice/my%20file.csv';
beforeEach(() => { sessionStorage.clear(); history.replaceState(null, '', '/solid-data-manager/'); });
test('restores the target after the actual session callback hook finishes', async () => {
  history.replaceState(null, '', '/solid-data-manager/?uri=' + encodeURIComponent(target)); rememberLoginTarget();
  history.replaceState(null, '', '/solid-data-manager/?code=callback&state=nonce');
  const handleIncomingRedirect = jest.fn(async () => history.replaceState(null, '', '/solid-data-manager/'));
  setSession({ info: { isLoggedIn: true }, handleIncomingRedirect });
  await restoreSession();
  expect(handleIncomingRedirect).toHaveBeenCalledWith({ restorePreviousSession: true });
  expect(new URLSearchParams(location.search).get('uri')).toBe(target);
});
test('does not restore a target after an unsuccessful callback', async () => {
  history.replaceState(null, '', '/solid-data-manager/?uri=' + encodeURIComponent(target)); rememberLoginTarget();
  history.replaceState(null, '', '/solid-data-manager/?code=callback&state=nonce');
  setSession({ info: { isLoggedIn: false }, handleIncomingRedirect: jest.fn(async () => history.replaceState(null, '', '/solid-data-manager/')) });
  await restoreSession();
  expect(new URLSearchParams(location.search).has('uri')).toBe(false);
});
