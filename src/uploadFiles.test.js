import { uploadFileVerified, uploadErrorMessage } from './uploadFiles';
import { translateText } from './i18n';
const response = (status, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers) });
const options = (fetcher, name = 'trees.csv') => ({ folderUrl: 'https://pod.example/data/', file: new File(['a,b\n1,2\n'], name, { type: 'text/csv' }), contentType: 'text/csv', fetcher });

test('uploads original File without transformation, then verifies saved bytes', async () => {
 const fetcher = jest.fn().mockResolvedValueOnce(response(201)).mockResolvedValueOnce(response(200, { 'Content-Length': '8' }));
 const args = options(fetcher, 'trees #1%.csv'), onPhase = jest.fn();
 const result = await uploadFileVerified({ ...args, onPhase });
 expect(fetcher.mock.calls[0][0]).toBe('https://pod.example/data/trees%20%231%25.csv');
 expect(fetcher.mock.calls[0][1].body).toBe(args.file);
 expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'HEAD', cache: 'no-store' });
 expect(result.verified).toBe(true);
 expect(onPhase.mock.calls.map(([phase]) => phase)).toEqual(['Uploading...', 'Verifying uploaded size...']);
});
test('a successful HTTP response with a truncated file is reported as corruption', async () => {
 const fetcher = jest.fn().mockResolvedValueOnce(response(201)).mockResolvedValueOnce(response(200, { 'Content-Length': '3' }));
 await expect(uploadFileVerified(options(fetcher))).rejects.toMatchObject({ code: 'SIZE_MISMATCH' });
 expect(fetcher).toHaveBeenCalledTimes(2); // No automatic deletion or repeat PUT.
});
test.each([401,403,413,408,409,412,500,504,507])('reports failed PUT HTTP %s without pretending success', async status => {
 const fetcher = jest.fn().mockResolvedValue(response(status));
 let caught; try { await uploadFileVerified(options(fetcher)); } catch(error) { caught=error; }
 expect(caught.status).toBe(status);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(uploadErrorMessage(caught)).not.toBe('Upload failed.');
 expect(translateText(uploadErrorMessage(caught),'de')).not.toBe(uploadErrorMessage(caught));
});
test.each([403,404,500])('write accepted but HEAD %s does not erase write-only uploads', async status => {
 const fetcher = jest.fn().mockResolvedValueOnce(response(201)).mockResolvedValueOnce(response(status));
 await expect(uploadFileVerified(options(fetcher))).resolves.toMatchObject({ verified: false });
 expect(fetcher).toHaveBeenCalledTimes(2);
});
test('missing length and encoded responses are explicitly unverified', async () => {
 for(const headers of [{},{'Content-Length':'3','Content-Encoding':'gzip'}]) {
  const fetcher = jest.fn().mockResolvedValueOnce(response(201)).mockResolvedValueOnce(response(200,headers));
  await expect(uploadFileVerified(options(fetcher))).resolves.toMatchObject({ verified: false });
 }
});
test('concurrent newer version is not called a truncated upload', async () => {
 const fetcher = jest.fn().mockResolvedValueOnce(response(204,{ETag:'"v1"'})).mockResolvedValueOnce(response(200,{ETag:'"v2"','Content-Length':'2'}));
 await expect(uploadFileVerified(options(fetcher))).resolves.toMatchObject({ verified: false });
});
test('network failure checking size is distinguished from failed upload', async () => {
 const fetcher=jest.fn().mockResolvedValueOnce(response(201)).mockRejectedValueOnce(new TypeError('offline'));
 await expect(uploadFileVerified(options(fetcher))).resolves.toMatchObject({ verified:false });
});
test('zero byte files are verified correctly', async () => {
 const fetcher=jest.fn().mockResolvedValueOnce(response(201)).mockResolvedValueOnce(response(200,{'Content-Length':'0'}));
 await expect(uploadFileVerified({...options(fetcher),file:new File([],'empty.csv')})).resolves.toMatchObject({verified:true});
});
test('cancellation is propagated without logout or retry', async () => {
 const controller=new AbortController(), error=new DOMException('cancel','AbortError');
 const fetcher=jest.fn().mockResolvedValueOnce(response(201)).mockImplementationOnce(()=>{controller.abort();throw error;});
 await expect(uploadFileVerified({...options(fetcher),signal:controller.signal})).rejects.toBe(error);
 expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
});
test('rejects path traversal', async () => {
 const fetcher=jest.fn();await expect(uploadFileVerified(options(fetcher,'../file.csv'))).rejects.toMatchObject({code:'INVALID_NAME'});
 expect(fetcher).not.toHaveBeenCalled();
});
