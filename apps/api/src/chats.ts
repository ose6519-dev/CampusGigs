import type { VerifiedUser } from './auth.ts';
import { InputError } from './validation.ts';

type Context = {request:Request;url:URL;env:Env;user:VerifiedUser;json:(value:unknown,status?:number)=>Response;
  readJson:(request:Request)=>Promise<unknown>;rateLimit:(env:Env,uid:string,route:string,max:number)=>Promise<void>};
type Booking = {id:string;buyer_uid:string;provider_uid:string;service_title:string;status:string;
  other_name:string;other_avatar:string;other_city:string;other_state:string;other_username:string;other_public_id:string|null;
  other_kind:string;other_online:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reactions=new Set(['❤️','😂','👍','🔥','😮','😢','🙌','👏']);
const stickers=new Set(['💛','✨','🎉','🤝','🙏','💪','🥰','✅','🚀','💯']);
const wallpapers=new Set(['warm','doodle','gold','night','aurora']);
const cipherPattern=/^cg1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;
const fileKinds=new Set(['image','video','file','audio']);
const contentTypes:Record<string,{kind:string;size:number}>={
  'image/jpeg':{kind:'image',size:8*1024*1024},'image/png':{kind:'image',size:8*1024*1024},
  'image/webp':{kind:'image',size:8*1024*1024},'image/gif':{kind:'image',size:8*1024*1024},
  'video/mp4':{kind:'video',size:12*1024*1024},'video/webm':{kind:'video',size:12*1024*1024},
  'audio/webm':{kind:'audio',size:8*1024*1024},'audio/ogg':{kind:'audio',size:8*1024*1024},
  'audio/mp4':{kind:'audio',size:8*1024*1024},'audio/mpeg':{kind:'audio',size:8*1024*1024},
  'application/pdf':{kind:'file',size:8*1024*1024},'text/plain':{kind:'file',size:2*1024*1024},
  'application/msword':{kind:'file',size:8*1024*1024},
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':{kind:'file',size:8*1024*1024},
  'application/vnd.ms-excel':{kind:'file',size:8*1024*1024},
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':{kind:'file',size:8*1024*1024},
};
const asObject=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('Invalid message');
  return value as Record<string,unknown>;
};
const noExtra=(value:Record<string,unknown>,keys:string[])=>{
  if(Object.keys(value).some(key=>!keys.includes(key)))throw new InputError('Unknown message field');
};
const now=()=>new Date().toISOString();

async function publicKey(value:unknown):Promise<{x:string;y:string}>{
  const data=asObject(value);
  noExtra(data,['kty','crv','x','y','ext','key_ops']);
  if(data.kty!=='EC'||data.crv!=='P-256'||typeof data.x!=='string'||typeof data.y!=='string'||
    !/^[A-Za-z0-9_-]{43}$/.test(data.x)||!/^[A-Za-z0-9_-]{43}$/.test(data.y))
    throw new InputError('Invalid encryption public key');
  try{
    await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:data.x,y:data.y,ext:true,key_ops:[]},
      {name:'ECDH',namedCurve:'P-256'},false,[]);
  }catch{throw new InputError('Invalid encryption public key');}
  return {x:data.x,y:data.y};
}

async function secureEnabled(env:Env,bookingId:string):Promise<boolean>{
  const row=await env.DB.prepare('SELECT booking_id FROM chat_security WHERE booking_id=?').bind(bookingId).first();
  return !!row;
}

async function bookingFor(env:Env,uid:string,id:string):Promise<Booking|null>{
  if(!uuid.test(id))return null;
  return await env.DB.prepare(`SELECT b.id,b.buyer_uid,b.provider_uid,b.service_title,b.status,
    p.display_name AS other_name,p.avatar_url AS other_avatar,p.city AS other_city,p.state_name AS other_state,
    p.cg_username AS other_username,COALESCE(pp.public_id,p.member_public_id) AS other_public_id,
    CASE WHEN pp.public_id IS NOT NULL THEN 'provider' ELSE p.user_kind END AS other_kind,
    COALESCE(p.show_online,0) AS other_online
    FROM service_bookings b JOIN profiles p
      ON p.firebase_uid=CASE WHEN b.buyer_uid=? THEN b.provider_uid ELSE b.buyer_uid END
    LEFT JOIN provider_profiles pp ON pp.firebase_uid=p.firebase_uid AND pp.provider_status='active'
    WHERE b.id=? AND (b.buyer_uid=? OR b.provider_uid=?)`)
    .bind(uid,id,uid,uid).first<Booking>();
}

async function readLimited(request:Request,max:number):Promise<Uint8Array>{
  const header=request.headers.get('content-length');
  const size=header===null?null:Number(header);
  if(size!==null&&(!Number.isSafeInteger(size)||size<1||size>max))throw new InputError('File too large');
  const reader=request.body?.getReader();if(!reader)throw new InputError('Choose a file');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){
    const chunk=await reader.read();if(chunk.done)break;
    length+=chunk.value.byteLength;
    if(length>max){await reader.cancel();throw new InputError('File too large');}
    chunks.push(chunk.value);
  }
  if(!length||size!==null&&length!==size)throw new InputError('File size mismatch');
  const output=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}
  return output;
}

export async function chats(context:Context):Promise<Response|null>{
  const {request,url,env,user,json}=context;
  const {pathname:path}=url;
  if(!path.startsWith('/v1/chats/')&&path!=='/v1/me/chats'&&path!=='/v1/me/chat-key')return null;
  if(!user.emailVerified)return json({error:'Verify your email before messaging'},403);

  if(path==='/v1/me/chat-key'&&request.method==='GET'){
    const row=await env.DB.prepare('SELECT public_x,public_y FROM chat_identity_keys WHERE user_uid=?')
      .bind(user.uid).first<{public_x:string;public_y:string}>();
    return json({publicKey:row?{kty:'EC',crv:'P-256',x:row.public_x,y:row.public_y}:null});
  }
  if(path==='/v1/me/chat-key'&&request.method==='POST'){
    await context.rateLimit(env,user.uid,'chat-key',4);
    const data=asObject(await context.readJson(request));noExtra(data,['publicKey']);
    const key=await publicKey(data.publicKey);
    await env.DB.prepare('INSERT OR IGNORE INTO chat_identity_keys(user_uid,public_x,public_y) VALUES (?,?,?)')
      .bind(user.uid,key.x,key.y).run();
    const row=await env.DB.prepare('SELECT public_x,public_y FROM chat_identity_keys WHERE user_uid=?')
      .bind(user.uid).first<{public_x:string;public_y:string}>();
    if(row?.public_x!==key.x||row.public_y!==key.y)
      return json({error:'This account already has a different device key. Use the original device to read secure chats.'},409);
    return json({publicKey:{kty:'EC',crv:'P-256',x:key.x,y:key.y},unchanged:true});
  }

  if(path==='/v1/me/chats'&&request.method==='GET'){
    const entries=await env.DB.prepare(`SELECT b.id AS booking_id,b.service_title,b.status,
      p.display_name AS other_name,p.avatar_url AS other_avatar,p.city AS other_city,p.state_name AS other_state,
      p.cg_username AS other_username,COALESCE(pp.public_id,p.member_public_id) AS other_public_id,
      CASE WHEN pp.public_id IS NOT NULL THEN 'provider' ELSE p.user_kind END AS other_kind,
      COALESCE(p.show_online,0) AS other_online,
      m.body AS last_body,m.kind AS last_kind,m.created_at AS last_at,m.cipher_version AS last_cipher_version,
      EXISTS(SELECT 1 FROM chat_security s WHERE s.booking_id=b.id) AS secure,
      (SELECT COUNT(*) FROM chat_messages unread WHERE unread.booking_id=b.id
        AND unread.sender_uid<>? AND unread.created_at>COALESCE(
        (SELECT last_read_at FROM chat_receipts r WHERE r.booking_id=b.id AND r.user_uid=?),''))
        AS unread_count
      FROM service_bookings b
      JOIN profiles p ON p.firebase_uid=CASE WHEN b.buyer_uid=? THEN b.provider_uid ELSE b.buyer_uid END
      LEFT JOIN provider_profiles pp ON pp.firebase_uid=p.firebase_uid AND pp.provider_status='active'
      LEFT JOIN chat_messages m ON m.id=(SELECT id FROM chat_messages
        WHERE booking_id=b.id ORDER BY created_at DESC,id DESC LIMIT 1)
      WHERE b.buyer_uid=? OR b.provider_uid=?
      ORDER BY COALESCE(m.created_at,b.requested_at) DESC,b.id DESC LIMIT 100`)
      .bind(user.uid,user.uid,user.uid,user.uid,user.uid).all();
    return json({chats:entries.results||[]});
  }

  const match=path.match(/^\/v1\/chats\/([0-9a-f-]{36})(?:\/(.*))?$/i);
  if(!match)return json({error:'Not found'},404);
  const id=match[1],action=match[2]||'';
  const booking=await bookingFor(env,user.uid,id);
  if(!booking)return json({error:'Chat not found'},404);
  const otherUid=booking.buyer_uid===user.uid?booking.provider_uid:booking.buyer_uid;

  if(action==='keys'&&request.method==='GET'){
    const rows=await env.DB.prepare('SELECT user_uid,public_x,public_y FROM chat_identity_keys WHERE user_uid IN (?,?)')
      .bind(user.uid,otherUid).all<{user_uid:string;public_x:string;public_y:string}>();
    const get=(uid:string)=>rows.results?.find(item=>item.user_uid===uid);
    const own=get(user.uid),other=get(otherUid);
    return json({self:own?{uid:user.uid,publicKey:{kty:'EC',crv:'P-256',x:own.public_x,y:own.public_y}}:null,
      other:other?{uid:otherUid,publicKey:{kty:'EC',crv:'P-256',x:other.public_x,y:other.public_y}}:null});
  }

  if(action==='secure/enable'&&request.method==='POST'){
    await context.rateLimit(env,user.uid,'chat-secure',5);
    const keys=await env.DB.prepare('SELECT COUNT(*) AS total FROM chat_identity_keys WHERE user_uid IN (?,?)')
      .bind(booking.buyer_uid,booking.provider_uid).first<{total:number}>();
    if(keys?.total!==2)return json({error:'Both people need to open CampusGigs on their device before secure chat can be enabled'},409);
    await env.DB.prepare('INSERT OR IGNORE INTO chat_security(booking_id,enabled_by_uid) VALUES (?,?)').bind(id,user.uid).run();
    return json({secure:true});
  }

  if(!action&&request.method==='GET'){
    const [preferences,receipt,otherReceipt,typing,security]=await Promise.all([
      env.DB.prepare('SELECT wallpaper,muted FROM chat_preferences WHERE booking_id=? AND user_uid=?').bind(id,user.uid).first(),
      env.DB.prepare('SELECT last_read_at FROM chat_receipts WHERE booking_id=? AND user_uid=?').bind(id,user.uid).first(),
      env.DB.prepare('SELECT last_read_at FROM chat_receipts WHERE booking_id=? AND user_uid=?').bind(id,otherUid).first(),
      env.DB.prepare('SELECT expires_at FROM chat_typing WHERE booking_id=? AND user_uid=?').bind(id,otherUid).first<{expires_at:string}>(),
      env.DB.prepare('SELECT enabled_at FROM chat_security WHERE booking_id=?').bind(id).first<{enabled_at:string}>(),
    ]);
    return json({booking:{bookingId:id,serviceTitle:booking.service_title,status:booking.status,
      otherName:booking.other_name,otherAvatar:booking.other_avatar,otherCity:booking.other_city,
      otherState:booking.other_state,otherUsername:booking.other_username,
      otherPublicId:booking.other_public_id,otherKind:booking.other_kind,otherOnline:booking.other_online},
      preferences:preferences||{wallpaper:'warm',muted:0},lastReadAt:(receipt as {last_read_at?:string}|null)?.last_read_at||null,
      otherReadAt:(otherReceipt as {last_read_at?:string}|null)?.last_read_at||null,
      otherTyping:!!typing&&typing.expires_at>now(),secure:!!security,secureSince:security?.enabled_at||null});
  }

  if(action==='messages'&&request.method==='GET'){
    const before=url.searchParams.get('before')||'';
    if(before&&!uuid.test(before))throw new InputError('Invalid message cursor');
    const anchor=before?await env.DB.prepare('SELECT created_at,id FROM chat_messages WHERE id=? AND booking_id=?')
      .bind(before,id).first<{created_at:string;id:string}>():null;
    if(before&&!anchor)return json({error:'Message cursor not found'},400);
    const rows=await env.DB.prepare(`SELECT m.id,m.sender_uid,m.client_id,m.kind,m.body,m.upload_id,m.reply_to,m.cipher_version,
      m.pinned_by_uid,m.created_at,u.filename,u.mime_type,u.size_bytes,
      (SELECT body FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_body,
      (SELECT sender_uid FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_sender,
      (SELECT client_id FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_client_id,
      (SELECT kind FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_kind,
      (SELECT cipher_version FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_cipher_version
      FROM chat_messages m LEFT JOIN chat_uploads u ON u.id=m.upload_id
      WHERE m.booking_id=? AND (?='' OR m.created_at<? OR (m.created_at=? AND m.id<?))
      ORDER BY m.created_at DESC,m.id DESC LIMIT 41`)
      .bind(id,before,anchor?.created_at||'',anchor?.created_at||'',before).all();
    const items=rows.results||[];
    const visible=items.slice(0,40);
    const ids=visible.map(item=>String(item.id));
    let reacted:Record<string,unknown>[]=[];
    if(ids.length){
      const list=await env.DB.prepare(`SELECT message_id,reactor_uid,emoji FROM chat_reactions
        WHERE message_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all();
      reacted=list.results||[];
    }
    return json({messages:visible.reverse().map(item=>({...item,
      reactions:reacted.filter(reaction=>reaction.message_id===item.id)})),
      hasMore:items.length>40});
  }

  // A single lightweight request carries message deltas, read receipts and typing.
  // This avoids fetching the whole 40-message page every few seconds.
  if(action==='updates'&&request.method==='GET'){
    const after=url.searchParams.get('after')||'';
    if(after&&!uuid.test(after))throw new InputError('Invalid message cursor');
    const anchor=after?await env.DB.prepare('SELECT created_at,id FROM chat_messages WHERE id=? AND booking_id=?')
      .bind(after,id).first<{created_at:string;id:string}>():null;
    if(after&&!anchor)return json({error:'Message cursor not found'},400);
    const [rows,receipt,typing]=await Promise.all([
      env.DB.prepare(`SELECT m.id,m.sender_uid,m.client_id,m.kind,m.body,m.upload_id,m.reply_to,m.cipher_version,
        m.pinned_by_uid,m.created_at,u.filename,u.mime_type,u.size_bytes,
        (SELECT body FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_body,
        (SELECT sender_uid FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_sender,
        (SELECT client_id FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_client_id,
        (SELECT kind FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_kind,
        (SELECT cipher_version FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_cipher_version
        FROM chat_messages m LEFT JOIN chat_uploads u ON u.id=m.upload_id
        WHERE m.booking_id=? AND (?='' OR m.created_at>? OR (m.created_at=? AND m.id>?))
        ORDER BY m.created_at ASC,m.id ASC LIMIT 61`)
        .bind(id,after,anchor?.created_at||'',anchor?.created_at||'',after).all(),
      env.DB.prepare('SELECT last_read_at FROM chat_receipts WHERE booking_id=? AND user_uid=?')
        .bind(id,otherUid).first<{last_read_at:string}>(),
      env.DB.prepare('SELECT expires_at FROM chat_typing WHERE booking_id=? AND user_uid=?')
        .bind(id,otherUid).first<{expires_at:string}>(),
    ]);
    const items=rows.results||[],visible=items.slice(0,60);
    const ids=visible.map(item=>String(item.id));
    const reactions=ids.length?await env.DB.prepare(`SELECT message_id,reactor_uid,emoji FROM chat_reactions
      WHERE message_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all():null;
    return json({messages:visible.map(item=>({...item,
      reactions:(reactions?.results||[]).filter(reaction=>reaction.message_id===item.id)})),
      hasMore:items.length>60,otherReadAt:receipt?.last_read_at||null,
      otherTyping:!!typing&&typing.expires_at>now()});
  }

  if(action==='messages'&&request.method==='POST'){
    await context.rateLimit(env,user.uid,'chat-message',35);
    const data=asObject(await context.readJson(request));
    noExtra(data,['clientId','kind','text','replyTo','uploadId']);
    const clientId=data.clientId;
    if(typeof clientId!=='string'||!uuid.test(clientId))throw new InputError('Invalid message identifier');
    const kind=data.kind||'text';
    if(!['text','image','video','file','audio','sticker'].includes(String(kind)))throw new InputError('Unsupported message type');
    const body=typeof data.text==='string'?data.text.trim():'';
    if(body.length>2000||body.includes('\0'))throw new InputError('Message is too long');
    const encrypted=await secureEnabled(env,id);
    if(encrypted&&!cipherPattern.test(body))return json({error:'Secure chat requires encrypted messages. Refresh the chat.'},409);
    if(!encrypted&&cipherPattern.test(body))return json({error:'Enable secure chat before sending encrypted messages'},409);
    const uploadId=data.uploadId||null;
    if(uploadId!==null&&(typeof uploadId!=='string'||!uuid.test(uploadId)))throw new InputError('Invalid attachment');
    if(kind==='text'&&(!body||uploadId))throw new InputError('Type a message');
    if(kind==='sticker'&&(!encrypted&&!stickers.has(body)||!!uploadId))throw new InputError('Choose a sticker');
    if(['image','video','audio','file'].includes(String(kind))){
      if(!uploadId)throw new InputError('Attach a file');
      const upload=await env.DB.prepare('SELECT mime_type,cipher_version,encrypted_kind FROM chat_uploads WHERE id=? AND booking_id=? AND owner_uid=?')
        .bind(uploadId,id,user.uid).first<{mime_type:string;cipher_version:number;encrypted_kind:string|null}>();
      if(!upload||upload.cipher_version!==(encrypted?1:0)||
        (encrypted?upload.mime_type!=='application/octet-stream'||upload.encrypted_kind!==kind:contentTypes[upload.mime_type]?.kind!==kind))
        return json({error:'Attachment not available for this chat mode'},404);
    }
    const replyTo=data.replyTo||null;
    if(replyTo!==null){
      if(typeof replyTo!=='string'||!uuid.test(replyTo))throw new InputError('Invalid reply');
      const parent=await env.DB.prepare('SELECT id FROM chat_messages WHERE id=? AND booking_id=?')
        .bind(replyTo,id).first();
      if(!parent)return json({error:'Reply message not found'},404);
    }
    const msgId=crypto.randomUUID();
    const result=await env.DB.prepare(`INSERT OR IGNORE INTO chat_messages
      (id,booking_id,sender_uid,client_id,kind,body,upload_id,reply_to,cipher_version) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(msgId,id,user.uid,clientId,kind,body,uploadId,replyTo,encrypted?1:0).run();
    const saved=await env.DB.prepare('SELECT id,booking_id,kind,body,created_at,client_id,upload_id,reply_to,cipher_version FROM chat_messages WHERE booking_id=? AND sender_uid=? AND client_id=?')
      .bind(id,user.uid,clientId).first();
    if(!saved)return json({error:'Attachment was already sent or message could not be saved'},409);
    return json({message:saved,reused:result.meta.changes===0},result.meta.changes===0?200:201);
  }

  if(action==='read'&&request.method==='POST'){
    await env.DB.prepare(`INSERT INTO chat_receipts(booking_id,user_uid,last_read_at)
      VALUES (?,?,?) ON CONFLICT(booking_id,user_uid) DO UPDATE SET last_read_at=excluded.last_read_at`)
      .bind(id,user.uid,now()).run();
    return json({ok:true});
  }

  if(action==='typing'&&request.method==='POST'){
    await context.rateLimit(env,user.uid,'chat-typing',35);
    const data=asObject(await context.readJson(request));noExtra(data,['active']);
    if(typeof data.active!=='boolean')throw new InputError('Invalid typing status');
    const expiry=new Date(Date.now()+(data.active?8000:0)).toISOString();
    await env.DB.prepare(`INSERT INTO chat_typing(booking_id,user_uid,expires_at) VALUES (?,?,?)
      ON CONFLICT(booking_id,user_uid) DO UPDATE SET expires_at=excluded.expires_at`)
      .bind(id,user.uid,expiry).run();
    return json({ok:true});
  }

  if(action==='preferences'&&request.method==='PUT'){
    const data=asObject(await context.readJson(request));noExtra(data,['wallpaper','muted']);
    if(!wallpapers.has(String(data.wallpaper))||typeof data.muted!=='boolean')throw new InputError('Invalid chat appearance');
    await env.DB.prepare(`INSERT INTO chat_preferences(booking_id,user_uid,wallpaper,muted)
      VALUES (?,?,?,?) ON CONFLICT(booking_id,user_uid) DO UPDATE SET
      wallpaper=excluded.wallpaper,muted=excluded.muted`)
      .bind(id,user.uid,data.wallpaper,Number(data.muted)).run();
    return json({preferences:{wallpaper:data.wallpaper,muted:Number(data.muted)}});
  }

  const reaction=action.match(/^messages\/([0-9a-f-]{36})\/reaction$/i);
  const pin=action.match(/^messages\/([0-9a-f-]{36})\/pin$/i);
  if((reaction||pin)&&['PUT','DELETE'].includes(request.method)){
    const messageId=(reaction||pin)![1];
    if(!uuid.test(messageId))return json({error:'Message not found'},404);
    const message=await env.DB.prepare('SELECT id,sender_uid FROM chat_messages WHERE id=? AND booking_id=?')
      .bind(messageId,id).first();
    if(!message)return json({error:'Message not found'},404);
    if(reaction){
      await context.rateLimit(env,user.uid,'chat-reaction',40);
      if(request.method==='DELETE')await env.DB.prepare('DELETE FROM chat_reactions WHERE message_id=? AND reactor_uid=?').bind(messageId,user.uid).run();
      else{
        const data=asObject(await context.readJson(request));noExtra(data,['emoji']);
        if(!reactions.has(String(data.emoji)))throw new InputError('Choose an available reaction');
        await env.DB.prepare(`INSERT INTO chat_reactions(message_id,reactor_uid,emoji) VALUES (?,?,?)
          ON CONFLICT(message_id,reactor_uid) DO UPDATE SET emoji=excluded.emoji`).bind(messageId,user.uid,data.emoji).run();
      }
      return json({ok:true});
    }
    await context.rateLimit(env,user.uid,'chat-pin',15);
    await env.DB.prepare('UPDATE chat_messages SET pinned_by_uid=? WHERE id=? AND booking_id=?')
      .bind(request.method==='PUT'?user.uid:null,messageId,id).run();
    return json({ok:true});
  }

  if(action==='media'&&request.method==='POST'){
    await context.rateLimit(env,user.uid,'chat-upload',10);
    const mime=(request.headers.get('content-type')||'').split(';')[0].toLowerCase().trim();
    const encrypted=await secureEnabled(env,id);
    const encryptedKind=request.headers.get('x-encrypted-kind')||'';
    if(encrypted&&(mime!=='application/octet-stream'||!fileKinds.has(encryptedKind)))
      return json({error:'Secure chat requires encrypted attachments'},409);
    if(!encrypted&&mime==='application/octet-stream')return json({error:'Enable secure chat before uploading encrypted attachments'},409);
    const config=encrypted?{kind:encryptedKind,size:12*1024*1024}:contentTypes[mime];
    if(!config)return json({error:'File type not supported'},415);
    const filename=encrypted?'Encrypted attachment':decodeURIComponent(request.headers.get('x-file-name')||'Attachment').replace(/[\x00-\x1f\\/]/g,'').slice(0,100)||'Attachment';
    const bytes=await readLimited(request,config.size);
    if(encrypted&&(bytes.byteLength<32||bytes[0]!==67||bytes[1]!==71||bytes[2]!==49))
      return json({error:'Invalid encrypted attachment format'},422);
    const uploadId=crypto.randomUUID(),key=`chat-private/${id}/${uploadId}`;
    await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:mime},customMetadata:{ownerUid:user.uid,scope:'booking-chat',cipherVersion:encrypted?'1':'0'}});
    try{
      await env.DB.prepare(`INSERT INTO chat_uploads(id,booking_id,owner_uid,object_key,filename,mime_type,size_bytes,cipher_version,encrypted_kind)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(uploadId,id,user.uid,key,filename,mime,bytes.byteLength,encrypted?1:0,encrypted?encryptedKind:null).run();
    }catch(error){await env.MEDIA.delete(key);throw error;}
    return json({upload:{id:uploadId,kind:config.kind,filename,mimeType:mime,sizeBytes:bytes.byteLength}},201);
  }

  const media=action.match(/^media\/([0-9a-f-]{36})$/i);
  if(media&&request.method==='GET'){
    const upload=await env.DB.prepare(`SELECT u.object_key,u.filename,u.mime_type,u.owner_uid
      FROM chat_uploads u WHERE u.id=? AND u.booking_id=? AND
        (u.owner_uid=? OR EXISTS(SELECT 1 FROM chat_messages m WHERE m.upload_id=u.id AND m.booking_id=?))`)
      .bind(media[1],id,user.uid,id).first<{object_key:string;filename:string;mime_type:string;owner_uid:string}>();
    if(!upload)return json({error:'Attachment not found'},404);
    const object=await env.MEDIA.get(upload.object_key);
    if(!object)return json({error:'Attachment unavailable'},404);
    return new Response(object.body,{headers:{
      'Content-Type':upload.mime_type,'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff',
      'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(upload.filename)}`,
    }});
  }
  return json({error:'Not found'},404);
}
