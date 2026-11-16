import type {User} from 'firebase/auth';
import {apiRequest} from './api';
import {deriveChatKey,makeIdentity,safetyCode,type PublicKey} from './cryptoEnvelope';

type StoredIdentity={uid:string;privateKey:CryptoKey;publicKey:PublicKey};
type PeerResponse={self:{uid:string;publicKey:PublicKey}|null;other:{uid:string;publicKey:PublicKey}|null};

function keyDb():Promise<IDBDatabase>{
  if(!globalThis.indexedDB)throw new Error('This browser cannot securely store a device key');
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('CampusGigs-Device-Keys',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('identities'))request.result.createObjectStore('identities',{keyPath:'uid'});};
    request.onerror=()=>reject(new Error('Cannot open the encrypted device key store'));
    request.onsuccess=()=>resolve(request.result);
  });
}

async function localIdentity(uid:string):Promise<StoredIdentity|null>{
  const db=await keyDb();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('identities','readonly');
    const request=transaction.objectStore('identities').get(uid);
    request.onsuccess=()=>resolve((request.result as StoredIdentity|undefined)||null);
    request.onerror=()=>reject(new Error('Cannot read your device key'));
    transaction.oncomplete=()=>db.close();transaction.onerror=()=>db.close();
  });
}

async function saveIdentity(identity:StoredIdentity):Promise<void>{
  const db=await keyDb();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('identities','readwrite');
    transaction.objectStore('identities').put(identity);
    transaction.oncomplete=()=>{db.close();resolve();};
    transaction.onerror=()=>{db.close();reject(new Error('Could not save encryption key on this device'));};
  });
}

const same=(a:PublicKey,b:PublicKey)=>a.x===b.x&&a.y===b.y;

export class DeviceKeyUnavailable extends Error{}

export async function ensureDeviceIdentity(user:User):Promise<StoredIdentity>{
  if(!globalThis.crypto?.subtle)throw new DeviceKeyUnavailable('Secure messaging needs a modern browser and HTTPS');
  const remote=await apiRequest<{publicKey:PublicKey|null}>(user,'/v1/me/chat-key');
  const stored=await localIdentity(user.uid);
  if(remote.publicKey){
    if(!stored)throw new DeviceKeyUnavailable('This account has an encryption key on another device. Secure chats cannot be read here yet.');
    if(!same(stored.publicKey,remote.publicKey))throw new DeviceKeyUnavailable('This device key does not match your CampusGigs account.');
    return stored;
  }
  if(stored){
    await apiRequest(user,'/v1/me/chat-key',{method:'POST',body:JSON.stringify({publicKey:stored.publicKey})});
    return stored;
  }
  const generated=await makeIdentity();
  const identity:StoredIdentity={uid:user.uid,privateKey:generated.keyPair.privateKey,publicKey:generated.publicKey};
  await saveIdentity(identity);
  await apiRequest(user,'/v1/me/chat-key',{method:'POST',body:JSON.stringify({publicKey:identity.publicKey})});
  return identity;
}

export async function chatEncryption(user:User,bookingId:string,identity:StoredIdentity):Promise<{
  key:CryptoKey|null;code:string|null;otherReady:boolean;
}>{
  const keys=await apiRequest<PeerResponse>(user,`/v1/chats/${bookingId}/keys`);
  if(!keys.self||!same(keys.self.publicKey,identity.publicKey))
    throw new DeviceKeyUnavailable('Your account encryption key changed. Stop and verify your device.');
  if(!keys.other)return {key:null,code:null,otherReady:false};
  const code=await safetyCode(identity.publicKey,keys.other.publicKey,bookingId);
  const pinName=`CampusGigs-secure-peer:${user.uid}:${bookingId}`;
  try{
    const previous=localStorage.getItem(pinName);
    if(previous&&previous!==code)throw new DeviceKeyUnavailable('Security code changed. Stop messaging and confirm the other person’s identity.');
    if(!previous)localStorage.setItem(pinName,code);
  }catch(error){if(error instanceof DeviceKeyUnavailable)throw error;throw new DeviceKeyUnavailable('Cannot safely remember the other person’s security key');}
  return {key:await deriveChatKey(identity.privateKey,keys.other.publicKey,bookingId),code,otherReady:true};
}
