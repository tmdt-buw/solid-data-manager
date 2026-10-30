import { getPodUrlAll } from '@inrupt/solid-client';
import { resolvePodNavigation, containsResource } from './podNavigation';

jest.mock('@inrupt/solid-client', () => ({ getPodUrlAll: jest.fn() }));
const webId = 'https://identity.example/people/alice#id';
const root = 'https://storage.example/alice/';
const storageHeader = '<http://www.w3.org/ns/pim/space#Storage>; rel="type"';
function response(url, status = 200, link = '') {
  return { url, status, ok: status >= 200 && status < 300, headers: { get: key => key === 'Link' ? link : null } };
}
let fetcher;
beforeEach(() => {
  jest.resetAllMocks();
  getPodUrlAll.mockResolvedValue([root]);
  fetcher = jest.fn(async (url, init) => { expect(init.method).toBe('HEAD'); return response(url); });
});
const resolve = (uri, options = {}) => resolvePodNavigation({ webId, uri, fetcher, ...options });

test('discovers storage independently from the WebID host, without touching identity paths as containers', async () => {
  await expect(resolve(null)).resolves.toEqual({ rootUrl: root, containerUrl: root, fileUrl: null });
  expect(getPodUrlAll).toHaveBeenCalledWith(webId, expect.objectContaining({ fetch: expect.any(Function) }));
  expect(fetcher).not.toHaveBeenCalled();
});
test('selects the matching Pod when a WebID links several storages', async () => {
  getPodUrlAll.mockResolvedValue(['https://first.example/pod/', root]);
  await expect(resolve(root + 'documents/')).resolves.toEqual({ rootUrl: root, containerUrl: root + 'documents/', fileUrl: null });
  expect(fetcher).not.toHaveBeenCalled();
});
test('resolves a file, preserving encoded characters and ignoring an RDF fragment', async () => {
  const file = root + 'documents/my%20file%23x.ttl';
  await expect(resolve(file + '#it')).resolves.toEqual({ rootUrl: root, containerUrl: root + 'documents/', fileUrl: file });
  expect(fetcher).toHaveBeenCalledWith(file, expect.objectContaining({ method: 'HEAD' }));
});
test('recognizes a slashless container from the server redirect', async () => {
  fetcher.mockImplementation(async url => response(url + '/'));
  await expect(resolve(root + 'documents')).resolves.toEqual({ rootUrl: root, containerUrl: root + 'documents/', fileUrl: null });
});
test('recognizes a slashless container from its LDP type', async () => {
  fetcher.mockImplementation(async url => response(url, 200, '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"'));
  await expect(resolve(root + 'documents')).resolves.toMatchObject({ containerUrl: root + 'documents/', fileUrl: null });
});
test('allows servers without HEAD support when the parent belongs to an advertised Pod', async () => {
  fetcher.mockImplementation(async url => response(url, 405));
  await expect(resolve(root + 'file.csv')).resolves.toMatchObject({ fileUrl: root + 'file.csv' });
});
test.each([401, 403, 404])('reports an inaccessible file (%s) without using a different folder', async status => {
  fetcher.mockImplementation(async url => response(url, status));
  await expect(resolve(root + 'private.csv')).rejects.toMatchObject({ status });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test('finds another shared Pod through ancestor storage headers', async () => {
  const shared = 'https://other.example/shared/';
  fetcher.mockImplementation(async url => response(url, 200, url === shared ? storageHeader : ''));
  await expect(resolve(shared + 'data/')).resolves.toEqual({ rootUrl: shared, containerUrl: shared + 'data/', fileUrl: null });
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([shared + 'data/', shared]);
});
test('does not mistake a sibling prefix for the advertised storage', async () => {
  expect(containsResource(root, 'https://storage.example/alice-other/')).toBe(false);
  fetcher.mockImplementation(async url => response(url, 200));
  await expect(resolve('https://storage.example/alice-other/')).rejects.toThrow('could not be identified');
});
test('does not guess an identity-server root when profile discovery fails', async () => {
  getPodUrlAll.mockRejectedValue(new Error('offline'));
  await expect(resolve(null)).rejects.toThrow('WebID profile could not be read');
  expect(fetcher).not.toHaveBeenCalled();
});
test('keeps compatibility for conventional profiles without storage statements', async () => {
  getPodUrlAll.mockResolvedValue([]);
  await expect(resolve(null, { webId: 'https://pod.example/alice/profile/card#me' })).resolves.toMatchObject({ rootUrl: 'https://pod.example/alice/' });
  await expect(resolve(null)).rejects.toThrow('No Pod storage');
});
test('a target can discover its storage even if the logged-in profile is unavailable', async () => {
  getPodUrlAll.mockRejectedValue(new Error('offline'));
  fetcher.mockImplementation(async url => response(url, 200, storageHeader));
  await expect(resolve(root)).resolves.toMatchObject({ rootUrl: root });
});
test('refuses redirects to a different resource or origin', async () => {
  fetcher.mockResolvedValue(response('https://other.example/other.csv'));
  await expect(resolve(root + 'file.csv')).rejects.toThrow('redirected');
});
test('cancellation prevents an earlier profile result from opening another user’s Pod', async () => {
  const controller = new AbortController();
  getPodUrlAll.mockImplementation(async () => { controller.abort(); return [root]; });
  await expect(resolve(root, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).not.toHaveBeenCalled();
});
test.each(['javascript:alert(1)', '/relative/', 'https://user:secret@storage.example/a', root + 'file?token=x', root + 'file%2Fsecret'])('rejects unsafe target %s before any network access', async uri => {
  await expect(resolve(uri)).rejects.toThrow();
  expect(getPodUrlAll).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
