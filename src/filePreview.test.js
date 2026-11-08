import { ReadableStream } from 'node:stream/web';
import { previewFormat, readMediaPreview, previewErrorMessage } from './filePreview';

test.each([
  ['photo.PNG', '', 'image', 'image/png'],
  ['photo.png', 'text/plain', 'image', 'image/png'],
  ['download', 'IMAGE/JPEG; charset=binary', 'image', 'image/jpeg'],
  ['notes.txt', 'video/mp4', 'video', 'video/mp4'],
  ['clip.webm', 'application/octet-stream', 'video', 'video/webm'],
  ['clip.mov', 'video/quicktime', 'video', 'video/quicktime'],
  ['dataset.ttl', '', 'text', ''],
  ['document', 'application/ld+json', 'text', 'application/ld+json'],
  ['map.gpx', 'application/gpx+xml', 'text', 'application/gpx+xml'],
  ['file.pdf', 'application/pdf', 'unsupported', 'application/pdf'],
  ['image.png', 'application/pdf', 'unsupported', 'application/pdf'],
])('classifies %s with %s', (name, mime, kind, expectedMime) => {
  expect(previewFormat(name, mime)).toEqual({ kind, mime: expectedMime });
});

test('cancels oversized declared media before reading it', async () => {
  const cancel = jest.fn().mockResolvedValue();
  const response = { headers: new Headers({ 'Content-Length': '100' }), body: { cancel } };
  await expect(readMediaPreview(response, 'video/mp4', undefined, 10)).rejects.toMatchObject({ code: 'PREVIEW_TOO_LARGE' });
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('bounds streamed media even without a content length and cancels the remaining transfer', async () => {
  const cancel = jest.fn();
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(12)); }, cancel });
  await expect(readMediaPreview({ body }, 'video/webm', undefined, 10)).rejects.toMatchObject({ code: 'PREVIEW_TOO_LARGE' });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(body.locked).toBe(false);
});

test('preserves media bytes with the detected type and releases the stream lock', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const body = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
  const blob = await readMediaPreview({ body }, 'image/png');
  expect(blob.type).toBe('image/png');
  expect(blob.size).toBe(bytes.length);
  const actual = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(new Uint8Array(reader.result)); reader.readAsArrayBuffer(blob); });
  expect(actual).toEqual(bytes);
  expect(body.locked).toBe(false);
});

test('distinguishes permission, missing file and network errors', () => {
  expect(previewErrorMessage({ status: 403 })).toContain('read permission');
  expect(previewErrorMessage({ status: 404 })).toContain('not found');
  expect(previewErrorMessage(new TypeError('Network unavailable'))).toContain('Try again');
});
