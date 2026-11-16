import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {gigSocial} from '../src/gigSocial.ts';

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort())
    db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  for(const uid of ['admin','buyer','provider','stranger']){
    db.prepare('INSERT INTO profiles(firebase_uid,display_name,email,onboarding_completed,cg_username) VALUES(?,?,?,?,?)')
      .run(uid,uid,uid+'@test.example',1,'cg'+uid);
  }
  db.prepare('INSERT INTO provider_applications(id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key,status) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('application','provider','["Design & Creative"]','NDU','campus','Brand work','student_id','private/evidence','approved');
  db.prepare('INSERT INTO provider_profiles(firebase_uid,application_id,approved_by_uid) VALUES (?,?,?)').run('provider','application','admin');
  const gigId=randomUUID();
  db.prepare('INSERT INTO gigs(id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(gigId,'provider','Logo design','Original brand design for clients on campus','Design & Creative',300000,3,'online','NDU','preview');
  const env={DB:{prepare(sql){const execute=(args)=>({
    all:async()=>({results:db.prepare(sql).all(...args)}),
    first:async()=>db.prepare(sql).get(...args),
    run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),
  });return {bind:(...args)=>execute(args),...execute([])}}}};
  async function call(path,{uid='buyer',method='GET',body,admin=false,verified=true}={}){
    const url=new URL(path,'https://api.example');
    const request=new Request(url,{method,headers:{'content-type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body)});
    const response=await gigSocial({request,url,env,user:uid?{uid,emailVerified:verified}:null,
      json:(payload,status=200)=>Response.json(payload,{status}),
      readJson:async()=>body,rateLimit:async()=>{},isAdmin:admin});
    assert.ok(response,'Expected social route to be handled');
    return {status:response.status,body:await response.json()};
  }
  return {call,db,gigId};
}
test('Phase S likes are idempotent, isolated and never available on deleted gigs',async()=>{
  const {call,db,gigId:id}=fixture();
  assert.equal((await call('/v1/public/gigs/'+id+'/social',{uid:null})).body.likeCount,0);
  assert.equal((await call('/v1/me/gigs/'+id+'/like',{method:'PUT',verified:false})).status,403);
  assert.equal((await call('/v1/me/gigs/'+id+'/like',{method:'PUT'})).body.likeCount,1);
  assert.equal((await call('/v1/me/gigs/'+id+'/like',{method:'PUT'})).body.likeCount,1);
  assert.deepEqual((await call('/v1/me/gigs/likes')).body.gigIds,[id]);
  assert.equal((await call('/v1/me/gigs/'+id+'/like',{method:'DELETE'})).body.likeCount,0);
  db.prepare("UPDATE gigs SET status='removed' WHERE id=?").run(id);
  assert.equal((await call('/v1/me/gigs/'+id+'/like',{method:'PUT'})).status,404);
  assert.equal((await call('/v1/public/gigs/'+id+'/social',{uid:null})).status,404);
  db.close();
});
test('Phase S comments appear in gig feed and admin can hide or restore with audit',async()=>{
  const {call,db,gigId:id}=fixture();
  assert.equal((await call('/v1/me/gigs/'+id+'/comments',{method:'POST',body:{body:' '}})).status,400);
  assert.equal((await call('/v1/me/gigs/'+id+'/comments',{method:'POST',body:{body:'A wonderful design sample'}})).status,201);
  const publicView=await call('/v1/public/gigs/'+id+'/social',{uid:null});
  assert.equal(publicView.body.commentCount,1);
  assert.equal(publicView.body.comments[0].body,'A wonderful design sample');
  const cid=publicView.body.comments[0].id;
  assert.equal((await call('/v1/admin/gig-comments',{uid:'admin',admin:true})).body.comments.length,1);
  assert.equal((await call('/v1/admin/gig-comments/'+cid+'/moderate',{uid:'admin',method:'POST',admin:true,body:{status:'hidden',reason:'Spam content'}})).status,200);
  assert.equal((await call('/v1/public/gigs/'+id+'/social',{uid:null})).body.commentCount,0);
  assert.equal((await call('/v1/admin/gig-comments/'+cid+'/moderate',{uid:'admin',method:'POST',admin:true,body:{status:'visible'}})).status,200);
  assert.equal((await call('/v1/public/gigs/'+id+'/social',{uid:null})).body.commentCount,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gig_comment_moderation').get().n,2);
  db.close();
});
