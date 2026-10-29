import { createRenameWorker } from "./folderRenameWorker";
test("authenticated worker requests use absolute URLs for Solid DPoP",async()=>{
 const fetcher=jest.fn(async url=>{expect(()=>new URL(url)).not.toThrow();return {ok:true,json:async()=>({namespace:"test",active:null,ok:true})};});
 const webId="https://pod.example/alice/profile/card#me",worker=await createRenameWorker(fetcher,webId);
 await worker.call("begin",{id:"fixture",source:"https://pod.example/alice/connections/test/old/",target:"https://pod.example/alice/connections/test/new/"});
 expect(fetcher.mock.calls[0][0]).toBe(window.location.origin+"/sync-worker/participants/relocations?webId="+encodeURIComponent(webId));
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({webId,action:"begin"});
});
test("a missing coordinator fails before any mutation",async()=>{
 const fetcher=jest.fn(async()=>({ok:false,status:404}));await expect(createRenameWorker(fetcher,"https://pod.example/alice/profile/card#me")).rejects.toThrow("unavailable");expect(fetcher).toHaveBeenCalledTimes(1);
});
