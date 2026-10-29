/** @jest-environment node */
import { Blob as NodeBlob } from "buffer";
import { createHash } from 'crypto';
import { unzipSync, strFromU8, strToU8 } from 'fflate';
import { downloadRenameBackup } from './folderRenameBackup';
import { saveDownload } from './downloadResources';
jest.mock('./downloadResources',()=>({saveDownload:jest.fn()}));
test('the downloadable backup preserves resources, reference snapshots, metadata and inherited ACLs with verifiable hashes',async()=>{
 global.Blob = NodeBlob; const asBytes = async blob => new Uint8Array(await blob.arrayBuffer());
 const row=url=>{const bytes=strToU8(url);return {url,bytes,hash:createHash('sha256').update(bytes).digest('hex'),type:'text/plain',etag:'"old"'};};
 try{
  downloadRenameBackup({id:'fixture',createdAt:'2026-10-29',source:'https://pod/old/',target:'https://pod/new/',resources:[{...row('https://pod/old/file'),acl:row('https://pod/old/file.acl'),meta:row('https://pod/old/file.meta')}],references:[row('https://pod/catalog/ds.ttl')],ancestors:[{url:'https://pod/',acl:row('https://pod/.acl')}]});
  const [blob,name]=saveDownload.mock.calls[0],archive=unzipSync(await asBytes(blob));expect(name).toBe('folder-rename-backup-fixture.zip');
  const manifest=JSON.parse(strFromU8(archive['manifest.json']));
  for(const r of [...manifest.resources,...manifest.references,...manifest.ancestors])for(const part of [r,r.acl,r.metadata].filter(p=>p?.file))expect(createHash('sha256').update(archive[part.file]).digest('hex')).toBe(part.sha256);
  expect(manifest.ancestors[0].file).toBeUndefined();expect(manifest.ancestors[0].acl.url).toBe('https://pod/.acl');
 }finally{jest.clearAllMocks();}
});
