// Phase P: browser-only encryption. This module never sends keys or plaintext to the API.
// A static ECDH identity key is a deliberately limited first release, not a Signal ratchet.
export type PublicKey = { kty:'EC'; crv:'P-256'; x:string; y:string };
export type SecurePayload = {text:string;filename?:string;mime?:string;size?:number};

const encoder=new TextEncoder();
const decoder=new TextDecoder();
const encode=(value:Uint8Array)=>btoa(Array.from(value,byte=>String.fromCharCode(byte)).join('')).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=(value:string)=>{
  const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);
  return Uint8Array.from(atob(padded),char=>char.charCodeAt(0));
};
const copy=(value:Uint8Array)=>new Uint8Array(value).buffer;
const aad=(bookingId:string,kind:string,uid:string,clientId:string)=>
  encoder.encode('CampusGigs-PhaseP-message-v1|'+[bookingId,kind,uid,clientId].join('|'));
const fileAad=(bookingId:string,kind:string)=>encoder.encode('CampusGigs-PhaseP-file-v1|'+bookingId+'|'+kind);

export async function makeIdentity():Promise<{keyPair:CryptoKeyPair;publicKey:PublicKey}>{
  const keyPair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']) as CryptoKeyPair;
  const jwk=await crypto.subtle.exportKey('jwk',keyPair.publicKey);
  if(!jwk.x||!jwk.y)throw new Error('Unable to create device key');
  return {keyPair,publicKey:{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y}};
}

export async function deriveChatKey(privateKey:CryptoKey,publicKey:PublicKey,bookingId:string):Promise<CryptoKey>{
  const peer=await crypto.subtle.importKey('jwk',{...publicKey,ext:true,key_ops:[]},{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=await crypto.subtle.deriveBits({name:'ECDH',public:peer},privateKey,256);
  const material=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  new Uint8Array(shared).fill(0);
  return crypto.subtle.deriveKey(
    {name:'HKDF',hash:'SHA-256',salt:encoder.encode('CampusGigs-P-256-chat:'+bookingId),
      info:encoder.encode('AES-256-GCM-message-and-file-v1')},
    material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

export async function safetyCode(a:PublicKey,b:PublicKey,bookingId:string):Promise<string>{
  const ordered=[a.x+'.'+a.y,b.x+'.'+b.y].sort().join('|');
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(bookingId+'|'+ordered)));
  return Array.from(hash.slice(0,10),byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase().match(/.{1,4}/g)!.join(' ');
}

export async function encryptPayload(key:CryptoKey,bookingId:string,kind:string,uid:string,clientId:string,
  payload:SecurePayload):Promise<string>{
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const raw=encoder.encode(JSON.stringify(payload));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:copy(iv),additionalData:copy(aad(bookingId,kind,uid,clientId)),tagLength:128},
    key,copy(raw));
  const token='cg1.'+encode(iv)+'.'+encode(new Uint8Array(cipher));
  if(token.length>2000)throw new Error('Message too long for secure chat (maximum about 1,300 characters)');
  return token;
}

export async function decryptPayload(key:CryptoKey,bookingId:string,kind:string,uid:string,clientId:string,
  token:string):Promise<SecurePayload>{
  const parts=token.split('.');
  if(parts.length!==3||parts[0]!=='cg1')throw new Error('Not an encrypted message');
  const iv=decode(parts[1]),cipher=decode(parts[2]);
  if(iv.length!==12||cipher.length<17)throw new Error('Invalid encrypted message');
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:copy(iv),additionalData:copy(aad(bookingId,kind,uid,clientId)),tagLength:128},
    key,copy(cipher));
  const value=JSON.parse(decoder.decode(raw)) as SecurePayload;
  if(typeof value.text!=='string')throw new Error('Invalid decrypted content');
  return value;
}

export async function encryptAttachment(key:CryptoKey,bookingId:string,kind:string,file:Blob):Promise<Blob>{
  if(file.size>11*1024*1024)throw new Error('Secure attachments must be smaller than 11 MB');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plaintext=new Uint8Array(await file.arrayBuffer());
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:copy(iv),additionalData:copy(fileAad(bookingId,kind)),tagLength:128},
    key,copy(plaintext));
  plaintext.fill(0);
  const output=new Uint8Array(3+12+ciphertext.byteLength);
  output.set([67,71,49],0);output.set(iv,3);output.set(new Uint8Array(ciphertext),15);
  return new Blob([output],{type:'application/octet-stream'});
}

export async function decryptAttachment(key:CryptoKey,bookingId:string,kind:string,encrypted:Blob,mime:string):Promise<Blob>{
  const raw=new Uint8Array(await encrypted.arrayBuffer());
  if(raw.length<32||raw[0]!==67||raw[1]!==71||raw[2]!==49)throw new Error('Invalid encrypted attachment');
  const iv=raw.slice(3,15),cipher=raw.slice(15);
  const plaintext=await crypto.subtle.decrypt(
    {name:'AES-GCM',iv:copy(iv),additionalData:copy(fileAad(bookingId,kind)),tagLength:128},key,copy(cipher));
  return new Blob([plaintext],{type:mime||'application/octet-stream'});
}
