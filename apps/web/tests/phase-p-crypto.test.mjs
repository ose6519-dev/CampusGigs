import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makeIdentity,deriveChatKey,safetyCode,encryptPayload,decryptPayload,encryptAttachment,decryptAttachment}
  from '../src/cryptoEnvelope.ts';

test('Phase P device keys agree, message bodies decrypt only with matching metadata',async()=>{
  const a=await makeIdentity(),b=await makeIdentity(),booking=randomUUID(),client=randomUUID();
  assert.equal(a.keyPair.privateKey.extractable,false);
  const first=await deriveChatKey(a.keyPair.privateKey,b.publicKey,booking);
  const second=await deriveChatKey(b.keyPair.privateKey,a.publicKey,booking);
  const content={text:'Hello from Yenagoa 💛'};
  const token=await encryptPayload(first,booking,'text','alice',client,content);
  assert.match(token,/^cg1\.[A-Za-z0-9_-]{16}\./);
  assert.deepEqual(await decryptPayload(second,booking,'text','alice',client,token),content);
  await assert.rejects(decryptPayload(second,booking,'text','bob',client,token));
  await assert.rejects(decryptPayload(second,booking,'sticker','alice',client,token));
  await assert.rejects(decryptPayload(second,booking,'text','alice',randomUUID(),token));
  const wrong=await deriveChatKey(b.keyPair.privateKey,a.publicKey,randomUUID());
  await assert.rejects(decryptPayload(wrong,booking,'text','alice',client,token));
  const code=await safetyCode(a.publicKey,b.publicKey,booking);
  assert.equal(code,await safetyCode(b.publicKey,a.publicKey,booking));
  assert.equal(code.replaceAll(' ','').length,20);
});

test('Phase P voice, photos, and documents remain opaque until decrypted on recipient device',async()=>{
  const a=await makeIdentity(),b=await makeIdentity(),booking=randomUUID();
  const first=await deriveChatKey(a.keyPair.privateKey,b.publicKey,booking);
  const second=await deriveChatKey(b.keyPair.privateKey,a.publicKey,booking);
  const bytes=new Uint8Array([37,80,68,70,45,49,46,55,10,66,65,89,69,76,83,65]);
  const original=new Blob([bytes],{type:'application/pdf'});
  const encrypted=await encryptAttachment(first,booking,'file',original);
  assert.equal(encrypted.type,'application/octet-stream');
  assert.notDeepEqual(new Uint8Array(await encrypted.arrayBuffer()),bytes);
  const recovered=await decryptAttachment(second,booking,'file',encrypted,'application/pdf');
  assert.equal(recovered.type,'application/pdf');
  assert.deepEqual(new Uint8Array(await recovered.arrayBuffer()),bytes);
  await assert.rejects(decryptAttachment(second,booking,'audio',encrypted,'audio/webm'));
  const tampered=new Uint8Array(await encrypted.arrayBuffer());tampered[18]^=1;
  await assert.rejects(decryptAttachment(second,booking,'file',new Blob([tampered]),'application/pdf'));
});
