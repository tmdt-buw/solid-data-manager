// Stored gzip is distinct from HTTP compression, which fetch already decodes.
export async function readCompressedJson(response, maxBytes = 128 * 1024 * 1024) {
  async function read(stream) {
    if (!stream) throw new Error('No response body.');
    const reader = stream.getReader(), chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error('Preview exceeds size limit.');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  let bytes = await read(response.body);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await read(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
