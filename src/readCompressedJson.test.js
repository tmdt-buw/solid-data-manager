import { gzipSync } from 'node:zlib';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { ReadableStream, DecompressionStream } from 'node:stream/web';
import { readCompressedJson } from './readCompressedJson';
const response = bytes => ({ body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) });
beforeAll(() => { Object.assign(global, { Blob, TextDecoder, DecompressionStream }); });
test('previews stored gzip and already decoded JSON without changing the original', async () => {
  const rows = [{ name: 'Garten', value: 17 }], bytes = Buffer.from(JSON.stringify(rows)), zipped = gzipSync(bytes);
  expect(await readCompressedJson(response(zipped))).toEqual(rows);
  expect(await readCompressedJson(response(bytes))).toEqual(rows);
});
test('rejects truncated and oversized gzip without treating it as text', async () => {
  await expect(readCompressedJson(response(gzipSync('[]').subarray(0, 12)))).rejects.toThrow();
  await expect(readCompressedJson(response(gzipSync(JSON.stringify([{text:'x'.repeat(10000)}]))), 100)).rejects.toThrow();
});
