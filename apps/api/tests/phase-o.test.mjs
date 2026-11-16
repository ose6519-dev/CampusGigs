import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chats} from '../src/chats.ts';

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const file of readdirSync(new URL('../migrations/',import.meta.url)).sort())
    db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  for(const uid of ['admin','buyer','provider','stranger'])
    db.prepare('INSERT INTO profiles(firebase_uid,display_name,email,onboarding_completed,cg_username) VALUES (?,?,?,?,?)')
      .run(uid,uid,`${uid}@test.example`,1,'cg'+uid);
  db.prepare(`INSERT INTO provider_applications(id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key,status)
    VALUES (?,?,?,?,?,?,?,?,?)`).run('application','provider','["Design & Creative"]','NDU','campus','Brand services','student_id','private/evidence','approved');
  db.prepare('INSERT INTO provider_profiles(firebase_uid,application_id,approved_by_uid) VALUES (?,?,?)').run('provider','application','admin');
  db.prepare('UPDATE provider_profiles SET public_id=? WHERE firebase_uid=?').run('0123456789abcdef0123456789abcdef','provider');
  const gigId=randomUUID(),bookingId=randomUUID();
  db.prepare(`INSERT INTO gigs(id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(gigId,'provider','Logo design','A memorable and complete brand design for local businesses and campus entrepreneurs.','Design & Creative',500000,4,'online','NDU','preview');
  db.prepare(`INSERT INTO service_bookings(id,buyer_uid,provider_uid,gig_id,request_id,service_title,service_category,price_kobo,delivery_days,brief,last_actor_uid)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(bookingId,'buyer','provider',gigId,randomUUID(),'Logo design','Design & Creative',500000,4,'Help me design a new logo for my business','buyer');
  const files=new Map();
  const env={
    DB:{prepare(sql){const make=(args)=>({
      all:async()=>({results:db.prepare(sql).all(...args)}),
      first:async()=>db.prepare(sql).get(...args),
      run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),
    });return{bind:(...args)=>make(args),...make([])};}},
    MEDIA:{put:async(key,bytes)=>files.set(key,bytes),get:async(key)=>files.has(key)?{body:files.get(key)}:null,
      delete:async(key)=>files.delete(key)},
  };
  async function call(path,{uid='buyer',method='GET',body,headers}={}){
    const url=new URL(path,'https://campusgigs-api.example');
    const request=new Request(url,{method,headers:{...(body!==undefined&&!(body instanceof Blob)?{'content-type':'application/json'}:{}),...headers},
      body:body===undefined?undefined:body instanceof Blob?body:JSON.stringify(body)});
    const response=await chats({request,url,env,user:{uid,emailVerified:true,email:`${uid}@test.example`},
      json:(payload,status=200)=>Response.json(payload,{status}),
      readJson:async()=>body,rateLimit:async()=>{}});
    assert.ok(response,`Route not handled: ${path}`);
    return {status:response.status,body:response.headers.get('content-type')?.includes('application/json')
      ?await response.json():await response.text()};
  }
  return{db,files,call,bookingId};
}

test('Phase O chat isolation, message idempotency, replies and pagination',async()=>{
  const {db,call,bookingId:id}=fixture();
  assert.equal((await call('/v1/me/chats',{uid:'stranger'})).body.chats.length,0);
  assert.equal((await call(`/v1/chats/${id}`,{uid:'stranger'})).status,404);
  assert.equal((await call(`/v1/chats/${id}/messages`,{uid:'stranger'})).status,404);
  assert.equal((await call('/v1/me/chats')).body.chats.length,1);
  assert.equal((await call('/v1/me/chats')).body.chats[0].other_kind,'provider');
  assert.ok((await call('/v1/me/chats')).body.chats[0].other_public_id,'provider link opens the real public profile');
  const clientId=randomUUID();
  const message=(await call(`/v1/chats/${id}/messages`,{method:'POST',
    body:{clientId,kind:'text',text:'Hello, can we discuss the design brief?'}}));
  assert.equal(message.status,201);
  assert.equal((await call(`/v1/chats/${id}/messages`,{method:'POST',
    body:{clientId,kind:'text',text:'Hello, can we discuss the design brief?'}})).body.reused,true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_messages').get().n,1);
  const reply=await call(`/v1/chats/${id}/messages`,{uid:'provider',method:'POST',
    body:{clientId:randomUUID(),kind:'text',text:'Of course, please share your ideas.',replyTo:message.body.message.id}});
  assert.equal(reply.status,201);
  const page=await call(`/v1/chats/${id}/messages`);
  assert.equal(page.body.messages.length,2);
  assert.equal(page.body.messages.at(-1).reply_body,'Hello, can we discuss the design brief?');
  assert.equal((await call(`/v1/chats/${id}/messages?before=${reply.body.message.id}`)).body.messages.length,1);
  assert.equal((await call('/v1/me/chats')).body.chats[0].unread_count,1);
  assert.equal((await call(`/v1/chats/${id}/read`,{method:'POST'})).body.ok,true);
  assert.equal((await call('/v1/me/chats')).body.chats[0].unread_count,0);
  await assert.rejects(()=>call(`/v1/chats/${id}/messages`,{method:'POST',
    body:{clientId:randomUUID(),kind:'text',text:'',replyTo:message.body.message.id}}));
  assert.equal((await call(`/v1/chats/${id}/messages`,{uid:'stranger',method:'POST',
    body:{clientId:randomUUID(),kind:'text',text:'Abusive impersonation'}})).status,404);
  db.close();
});

test('Phase O reactions, pinning, typing and per-user wallpapers',async()=>{
  const {db,call,bookingId:id}=fixture();
  const item=(await call(`/v1/chats/${id}/messages`,{method:'POST',
    body:{clientId:randomUUID(),kind:'sticker',text:'🎉'}})).body.message;
  assert.equal((await call(`/v1/chats/${id}/messages/${item.id}/reaction`,{uid:'provider',method:'PUT',body:{emoji:'❤️'}})).status,200);
  assert.equal((await call(`/v1/chats/${id}/messages`)).body.messages[0].reactions[0].emoji,'❤️');
  assert.equal((await call(`/v1/chats/${id}/messages/${item.id}/pin`,{method:'PUT'})).status,200);
  assert.ok((await call(`/v1/chats/${id}/messages`)).body.messages[0].pinned_by_uid);
  assert.equal((await call(`/v1/chats/${id}/typing`,{uid:'provider',method:'POST',body:{active:true}})).status,200);
  assert.equal((await call(`/v1/chats/${id}`)).body.otherTyping,true);
  await call(`/v1/chats/${id}/preferences`,{method:'PUT',body:{wallpaper:'night',muted:true}});
  assert.equal((await call(`/v1/chats/${id}`)).body.preferences.wallpaper,'night');
  assert.equal((await call(`/v1/chats/${id}`,{uid:'provider'})).body.preferences.wallpaper,'warm');
  assert.equal((await call(`/v1/chats/${id}/messages/${item.id}/reaction`,{uid:'provider',method:'DELETE'})).status,200);
  assert.equal((await call(`/v1/chats/${id}/messages`)).body.messages[0].reactions.length,0);
  db.close();
});

test('Phase O attachments remain private and cannot be reused',async()=>{
  const {db,call,bookingId:id}=fixture();
  const data=new Blob([new TextEncoder().encode('Test PDF content')],{type:'application/pdf'});
  const upload=await call(`/v1/chats/${id}/media`,{method:'POST',body:data,
    headers:{'content-type':'application/pdf','content-length':String(data.size),'x-file-name':'test.pdf'}});
  assert.equal(upload.status,201);
  const uploadId=upload.body.upload.id;
  assert.equal((await call(`/v1/chats/${id}/media/${uploadId}`,{uid:'provider'})).status,404,'unsent attachment is private to uploader');
  assert.equal((await call(`/v1/chats/${id}/media/${uploadId}`,{uid:'stranger'})).status,404);
  assert.equal((await call(`/v1/chats/${id}/messages`,{method:'POST',
    body:{clientId:randomUUID(),kind:'file',uploadId}})).status,201);
  assert.equal((await call(`/v1/chats/${id}/media/${uploadId}`,{uid:'provider'})).status,200);
  assert.equal((await call(`/v1/chats/${id}/messages`,{method:'POST',
    body:{clientId:randomUUID(),kind:'file',uploadId}})).status,409);
  assert.equal((await call(`/v1/chats/${id}/messages`,{uid:'stranger',method:'POST',
    body:{clientId:randomUUID(),kind:'file',uploadId}})).status,404);
  db.close();
});
