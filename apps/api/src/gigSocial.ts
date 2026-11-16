import type { VerifiedUser } from './auth';

type Context = {
  request: Request; url: URL; env: Env; user: VerifiedUser | null;
  json: (data: unknown, status?: number) => Response;
  readJson: (request: Request) => Promise<unknown>;
  rateLimit: (env: Env, uid: string, route: string, max: number) => Promise<void>;
  isAdmin: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function liveGig(env: Env, gigId: string) {
  if (!uuid.test(gigId)) return null;
  return env.DB.prepare("SELECT g.id,g.provider_uid FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid JOIN profiles p ON p.firebase_uid=g.provider_uid WHERE g.id=? AND g.status='active' AND pp.provider_status='active' AND p.account_status='active'")
    .bind(gigId).first<{id:string;provider_uid:string}>();
}
async function counts(env:Env,id:string) {
  const [likes,comments]=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM gig_likes WHERE gig_id=?').bind(id).first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM gig_comments WHERE gig_id=? AND status='visible'").bind(id).first<{count:number}>(),
  ]);
  return {likeCount:likes?.count||0,commentCount:comments?.count||0};
}

export async function gigSocial(context: Context): Promise<Response|null> {
  const {request,url,env,user,json,readJson,rateLimit,isAdmin}=context;
  const path=url.pathname;

  const publicMatch=path.match(/^\/v1\/public\/gigs\/([0-9a-f-]+)\/social$/i);
  if(publicMatch&&request.method==='GET'){
    const id=publicMatch[1];
    if(!await liveGig(env,id))return json({error:'Gig not found'},404);
    const offsetRaw=url.searchParams.get('offset')||'0';
    if(!/^\d{1,3}$/.test(offsetRaw)||Number(offsetRaw)>300)return json({error:'Invalid comments page'},400);
    const offset=Number(offsetRaw);
    const [totals,results]=await Promise.all([
      counts(env,id),
      env.DB.prepare("SELECT c.id,c.body,c.created_at,p.display_name,p.avatar_url,p.member_public_id AS author_public_id FROM gig_comments c JOIN profiles p ON p.firebase_uid=c.author_uid WHERE c.gig_id=? AND c.status='visible' AND p.account_status='active' ORDER BY c.created_at DESC,c.id DESC LIMIT 21 OFFSET ?").bind(id,offset).all(),
    ]);
    const rows=results.results||[];
    return json({...totals,comments:rows.slice(0,20),nextOffset:rows.length>20?offset+20:null});
  }

  if(path==='/v1/me/gigs/likes'&&request.method==='GET'){
    if(!user)return json({error:'Sign in required'},401);
    const rows=await env.DB.prepare('SELECT gig_id FROM gig_likes WHERE member_uid=? ORDER BY created_at DESC LIMIT 500')
      .bind(user.uid).all<{gig_id:string}>();
    return json({gigIds:(rows.results||[]).map(row=>row.gig_id)});
  }

  const likeMatch=path.match(/^\/v1\/me\/gigs\/([0-9a-f-]+)\/like$/i);
  if(likeMatch&&(request.method==='PUT'||request.method==='DELETE')){
    if(!user||!user.emailVerified)return json({error:'Sign in with a verified email to react'},403);
    const id=likeMatch[1];
    if(!await liveGig(env,id))return json({error:'Gig not found'},404);
    await rateLimit(env,user.uid,'gig-like',35);
    if(request.method==='PUT')await env.DB.prepare('INSERT OR IGNORE INTO gig_likes(gig_id,member_uid) VALUES (?,?)').bind(id,user.uid).run();
    else await env.DB.prepare('DELETE FROM gig_likes WHERE gig_id=? AND member_uid=?').bind(id,user.uid).run();
    return json({liked:request.method==='PUT',...await counts(env,id)});
  }

  const commentMatch=path.match(/^\/v1\/me\/gigs\/([0-9a-f-]+)\/comments$/i);
  if(commentMatch&&request.method==='POST'){
    if(!user||!user.emailVerified)return json({error:'Sign in with a verified email to comment'},403);
    const id=commentMatch[1];
    if(!await liveGig(env,id))return json({error:'Gig not found'},404);
    const payload=await readJson(request) as {body?:unknown};
    const body=typeof payload?.body==='string'?payload.body.trim():'';
    if(body.length<2||body.length>800)return json({error:'Comment must be between 2 and 800 characters'},400);
    await rateLimit(env,user.uid,'gig-comment',8);
    const cid=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO gig_comments(id,gig_id,author_uid,body) VALUES(?,?,?,?)')
      .bind(cid,id,user.uid,body).run();
    return json({id:cid,...await counts(env,id)},201);
  }

  if(!isAdmin)return null;
  if(path==='/v1/admin/gig-comments'&&request.method==='GET'){
    const status=url.searchParams.get('status')||'all';
    if(!['all','visible','hidden'].includes(status))return json({error:'Invalid comment filter'},400);
    const rows=await env.DB.prepare("SELECT c.id,c.gig_id,c.body,c.status,c.created_at,p.display_name AS author_name,p.email AS author_email,g.title AS gig_title FROM gig_comments c JOIN profiles p ON p.firebase_uid=c.author_uid JOIN gigs g ON g.id=c.gig_id WHERE (?='all' OR c.status=?) ORDER BY c.created_at DESC,c.id DESC LIMIT 150").bind(status,status).all();
    return json({comments:rows.results||[]});
  }
  const moderateMatch=path.match(/^\/v1\/admin\/gig-comments\/([0-9a-f-]+)\/moderate$/i);
  if(moderateMatch&&request.method==='POST'){
    if(!user||!uuid.test(moderateMatch[1]))return json({error:'Not found'},404);
    const payload=await readJson(request) as {status?:unknown;reason?:unknown};
    const status=payload?.status;
    const reason=typeof payload?.reason==='string'?payload.reason.trim():'';
    if((status!=='hidden'&&status!=='visible')||reason.length>400)return json({error:'Invalid moderation decision'},400);
    if(status==='hidden'&&reason.length<5)return json({error:'Enter a reason for hiding this comment'},400);
    await rateLimit(env,user.uid,'gig-comment-moderate',30);
    const result=await env.DB.prepare("UPDATE gig_comments SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status!=?").bind(status,moderateMatch[1],status).run();
    if(result.meta.changes!==1)return json({error:'Comment not found or already in that state'},409);
    await env.DB.prepare('INSERT INTO gig_comment_moderation(id,comment_id,admin_uid,decision,reason) VALUES (?,?,?,?,?)')
      .bind(crypto.randomUUID(),moderateMatch[1],user.uid,status,reason).run();
    return json({status});
  }
  return null;
}
