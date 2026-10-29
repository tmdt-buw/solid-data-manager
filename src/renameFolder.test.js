import { createHash, webcrypto } from 'crypto';
import { serialize, deserialize } from 'v8';
import { renameFolder, folderRenameTarget } from './renameFolder';
import { relocated, relocateRdf, parseRdf, children, relocateConnectionIndex, metadataSignature } from './folderRenameRdf';
const root='https://pod.example/alice/', webId=root+'profile/card#me', source=root+'connections/test/old/', target=root+'connections/test/new/';
const bytes=text=>new TextEncoder().encode(text), text=value=>new TextDecoder().decode(value), copy=value=>deserialize(serialize(value));
const hash=async value=>createHash('sha256').update(value).digest('hex');
const acl=url=>`<${url}.acl#owner> <http://www.w3.org/ns/auth/acl#accessTo> <${url}>; <http://www.w3.org/ns/auth/acl#agent> <${webId}>.`;
function fixture() {
 let version=0;const files=new Map(),writes=[],records=new Map(),calls=[];
 const add=(url,body='',type='text/plain')=>{files.set(url,{bytes:typeof body==='string'?bytes(body):body,type,etag:'"'+(++version)+'"'});const parent=new URL(url.endsWith('/')?'..':'.',url).href;if(files.has(parent)) files.get(parent).etag='"'+(++version)+'"';};
 for(const u of [root,root+'connections/',root+'connections/test/',source,source+'nested/',source+'empty/',root+'catalog/',root+'catalog/ds/'])add(u,'','text/turtle');
 add(root+'.acl',acl(root),'text/turtle');add(source+'.acl',acl(source),'text/turtle');add(source+'nested/values.txt','unchanged bytes');add(source+'history.json.gz',new Uint8Array([31,139,8,0,255,42]),'application/gzip');
 const ref=root+'catalog/ds/weather.ttl';add(ref,`<> <http://www.w3.org/ns/dcat#downloadURL> <${source}history.json.gz>.`,'text/turtle');
 const connection=root+'connections/test/custom-weather.ttl';add(connection,`<> <https://w3id.org/solid-dataspace-manager#connectionStorageDocument> <${source}nested/values.txt>.`,'text/turtle');
 const f={files,writes,records,calls,add,ref,connection,denied:null,intercept:null};
 f.fetcher=jest.fn(async(url,init={})=>{
  const method=init.method||'GET'; if(f.intercept){const result=await f.intercept(url,init);if(result)return result;}
  const row=files.get(url);const h=new Headers(init.headers);
  const response=(status,body=new Uint8Array(),headers={})=>({status,ok:status>=200&&status<300,url,headers:new Headers(headers),arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)});
  if(url===f.denied)return response(403);
  if(['GET','HEAD'].includes(method)){
   if(!row)return response(404);
   let body=row.bytes;
   if(url.endsWith('/'))body=bytes(`<> a <http://www.w3.org/ns/ldp#BasicContainer>.\n`+[...files.keys()].filter(u=>u!==url&&!u.endsWith('.acl')&&new URL(u.endsWith('/')?'..':'.',u).href===url).map(u=>`<> <http://www.w3.org/ns/ldp#contains> <${u}>.`).join('\n'));
   return response(200,body,{'etag':row.etag,'content-type':row.type,'wac-allow':'user="read write control"','link':url.endsWith('.acl')?'':`<${url}.acl>; rel="acl"`});
  }
  writes.push([method,url]);
  if(h.get('If-None-Match')==='*'&&row)return response(412);
  if(h.has('If-Match')&&h.get('If-Match')!==row?.etag)return response(412);
  if(method==='PUT'){add(url,init.body,h.get('Content-Type'));return response(201,new Uint8Array(),{'etag':files.get(url).etag});}
  if(method==='DELETE'){files.delete(url);files.delete(url+'.acl');const parent=new URL(url.endsWith('/')?'..':'.',url).href;if(files.has(parent))files.get(parent).etag='"'+(++version)+'"';return response(205);}
  throw Error('Unexpected fixture request');
 });
 f.journal={save:async r=>records.set(r.id,copy(r)),remove:async id=>records.delete(id)};
 f.worker={call:jest.fn(async(action,r)=>{calls.push(action);return {id:r.id};})};
 f.run=record=>renameFolder({source,target,podRoot:root,webId,fetcher:f.fetcher,journal:f.journal,worker:f.worker,hash,record});
 return f;
}
beforeAll(()=>{ Object.defineProperty(globalThis, 'crypto', {value:webcrypto,configurable:true}); if(!AbortSignal.timeout)AbortSignal.timeout=()=>new AbortController().signal; if(!crypto.randomUUID)crypto.randomUUID=()=>String(Math.random()).replace('.','')+'-fixture-rename'; });
test('nested/empty folders, binary histories, ACLs and references survive a completed rename',async()=>{
 const f=fixture(),original=f.files.get(source+'history.json.gz').bytes;const result=await f.run();
 expect(result.phase).toBe('done');expect(f.files.has(source)).toBe(false);expect(f.files.has(target+'empty/')).toBe(true);
 expect(f.files.get(target+'history.json.gz').bytes).toEqual(original);
 expect(text(f.files.get(target+'nested/values.txt').bytes)).toBe('unchanged bytes');
 expect(text(f.files.get(f.ref).bytes)).toContain(target+'history.json.gz');expect(text(f.files.get(f.connection).bytes)).toContain(target+'nested/values.txt');
 expect(text(f.files.get(target+'.acl').bytes)).toContain(target);expect(text(f.files.get(target+'.acl').bytes)).toContain(webId);
 expect(result.resources.find(r=>r.url===source+'history.json.gz').bytes).toEqual(original);
 expect(f.calls).toEqual(['begin','commit','finish']);
});
test.each(['collision','denied','backup'])('%s failure leaves every source and reference untouched',async mode=>{
 const f=fixture(); if(mode==='collision')f.add(target,'','text/turtle');if(mode==='denied')f.denied=source+'history.json.gz';if(mode==='backup')f.journal.save=async()=>{throw Error('quota exceeded');};
 const state=()=>JSON.stringify([...f.files.entries()].map(([url,r])=>[url,{...r,bytes:Array.from(r.bytes)}])); const before=state();await expect(f.run()).rejects.toThrow();expect(state()).toEqual(before);expect(f.writes).toEqual([]);
});
test('a changed source prevents any deletion or reference rewrite',async()=>{
 const f=fixture();let changed=false;f.intercept=async(url,init)=>{if(!changed&&url===target+'history.json.gz'&&init.method==='PUT'&&init.body.length){changed=true;f.add(source+'nested/values.txt','newer content');}};
 await expect(f.run()).rejects.toThrow(/changed/);expect(f.writes.filter(([m])=>m==='DELETE')).toEqual([]);expect(text(f.files.get(source+'nested/values.txt').bytes)).toBe('newer content');expect(text(f.files.get(f.ref).bytes)).toContain(source);
});
test('a lost commit response can be resumed with the original durable backup',async()=>{
 const f=fixture();let fail=true;f.worker.call=async(action)=>{f.calls.push(action);if(action==='commit'&&fail){fail=false;throw Error('network disconnected');}};
 await expect(f.run()).rejects.toThrow('network disconnected');expect(f.files.has(source+'history.json.gz')).toBe(true);
 const record=[...f.records.values()][0];expect(record.phase).toBe('references');const result=await f.run(record);
 expect(result.phase).toBe('done');expect(f.files.has(source)).toBe(false);expect(text(f.files.get(f.ref).bytes)).toContain(target);
});
test('a partial delete resumes without losing copied files or changing source backups',async()=>{
 const f=fixture();let fail=true;f.intercept=async(url,init)=>{if(fail&&url===source+'history.json.gz'&&init.method==='DELETE'){fail=false;throw Error('lost network');}};
 await expect(f.run()).rejects.toThrow('lost network');const record=[...f.records.values()][0];expect(record.phase).toBe('deleting');expect(record.removed[source+'nested/values.txt']).toBe(true);
 const result=await f.run(record);expect(result.phase).toBe('done');expect(text(f.files.get(target+'nested/values.txt').bytes)).toBe('unchanged bytes');
});
test('a destination permission change is never silently accepted',async()=>{
 const f=fixture();let changed=false;f.worker.call=async action=>{if(action==='commit'&&!changed){changed=true;f.add(target+'.acl','<> <https://example.org/p> "different".','text/turtle');}};
 await expect(f.run()).rejects.toThrow(/verified/);expect(f.files.has(source)).toBe(true);
});
test('invalid traversal, reserved paths and external containment are rejected',()=>{
 for(const name of ['..','a/b','a\\b','file.acl','a\nb'])expect(()=>folderRenameTarget(source,new URL('..',source).href,name,root)).toThrow();
 expect(folderRenameTarget(source,new URL('..',source).href,'Grüne Daten',root)).toContain('Gr%C3%BCne%20Daten/');
 expect(()=>folderRenameTarget(root+'catalog/',root,'old-catalog',root)).toThrow();
 expect(()=>children('<> <http://www.w3.org/ns/ldp#contains> <https://evil.example/data>.',source)).toThrow();
});
test('RDF references and connection options change, descriptions and ACL identities do not',async()=>{
 const ttl=`<> <http://www.w3.org/ns/dcat#downloadURL> <${source}values.json>; <http://purl.org/dc/terms/description> "${source}".`;
 const result=await relocateRdf(ttl,root+'catalog/ds/a.ttl',source,target);expect(result.changed).toBe(true);expect(result.text).toContain(target+'values.json');expect(result.text).toContain('"'+source+'"');
 const permissions=await relocateRdf(acl(source),source+'.acl',source,target,{acl:true});expect(permissions.text).toContain(webId);expect(permissions.text).toContain(target);
 expect(relocated(source.slice(0,-1)+'-different/file',source,target)).toBe(source.slice(0,-1)+'-different/file');
 expect(parseRdf(permissions.text,target+'.acl')).toHaveLength(2);
});
test('connection history locations change while source observations remain unchanged',()=>{
 const json={profile:'Custom API Response',resource_path:new URL(source).pathname+'index.json',entries:[{captured_at:'2020',body:{resources:[{url:source+'raw.bin',sha256:'retain'}]},observation:{url:source+'literal'}}]};
 const result=relocateConnectionIndex(json,source,target);expect(result.entries[0].body.resources[0].url).toBe(target+'raw.bin');expect(result.entries[0].observation).toEqual(json.entries[0].observation);expect(result.entries[0].captured_at).toBe('2020');expect(relocateConnectionIndex({any:source},source,target)).toBeNull();
 expect(metadataSignature('<> <http://purl.org/dc/terms/modified> "old"; <https://example.org/name> "retain".',source)).toBe(metadataSignature('<> <https://example.org/name> "retain"; <http://purl.org/dc/terms/modified> "new".',source));
});
