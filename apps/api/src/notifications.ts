import type { VerifiedUser } from './auth';

type Context = { request:Request; url:URL; env:Env; user:VerifiedUser; json:(data:unknown,status?:number)=>Response;
  rateLimit:(env:Env,uid:string,route:string,max:number)=>Promise<void> };

export async function notifications({request,url,env,user,json,rateLimit}:Context):Promise<Response|null>{
  const path=url.pathname;
  if(path==='/v1/me/notifications'&&request.method==='GET'){
    const keys=[...url.searchParams.keys()];
    const filter=url.searchParams.get('filter')||'all';
    if(keys.some(key=>key!=='filter')||keys.length>1||!['all','unread','archived'].includes(filter))
      return json({error:'Unsupported notification filter'},400);
    const scope=filter==='archived'?'archived_at IS NOT NULL':
      filter==='unread'?'archived_at IS NULL AND is_read=0':'archived_at IS NULL';
    const [rows,total,archived]=await Promise.all([
      env.DB.prepare(`SELECT id,kind,title,body,target_path,is_read,created_at,archived_at FROM user_notifications
        WHERE recipient_uid=? AND ${scope} ORDER BY created_at DESC,id DESC LIMIT 50`).bind(user.uid).all(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM user_notifications WHERE recipient_uid=? AND archived_at IS NULL AND is_read=0')
        .bind(user.uid).first<{count:number}>(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM user_notifications WHERE recipient_uid=? AND archived_at IS NOT NULL')
        .bind(user.uid).first<{count:number}>(),
    ]);
    return json({notifications:rows.results||[],unreadCount:total?.count||0,archivedCount:archived?.count||0});
  }
  if(path==='/v1/me/notifications/read-all'&&request.method==='POST'){
    await rateLimit(env,user.uid,'notification-read',12);
    const updated=await env.DB.prepare('UPDATE user_notifications SET is_read=1 WHERE recipient_uid=? AND is_read=0 AND archived_at IS NULL')
      .bind(user.uid).run();
    return json({read:true,changed:updated.meta.changes});
  }
  const match=path.match(/^\/v1\/me\/notifications\/([0-9a-f]{32})\/(read|archive|restore)$/i);
  if(match&&request.method==='POST'){
    await rateLimit(env,user.uid,'notification-read',12);
    const action=match[2].toLowerCase();
    const existing=await env.DB.prepare('SELECT id,archived_at FROM user_notifications WHERE id=? AND recipient_uid=?')
      .bind(match[1],user.uid).first<{id:string;archived_at:string|null}>();
    if(!existing)return json({error:'Notification not found'},404);
    if(action==='read'){
      if(existing.archived_at)return json({error:'Restore notification before opening'},409);
      await env.DB.prepare('UPDATE user_notifications SET is_read=1 WHERE id=? AND recipient_uid=?')
        .bind(match[1],user.uid).run();
      return json({read:true});
    }
    if(action==='archive'&&!existing.archived_at)
      await env.DB.prepare("UPDATE user_notifications SET archived_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND recipient_uid=?")
        .bind(match[1],user.uid).run();
    if(action==='restore'&&existing.archived_at)
      await env.DB.prepare('UPDATE user_notifications SET archived_at=NULL WHERE id=? AND recipient_uid=?')
        .bind(match[1],user.uid).run();
    return json({archived:action==='archive'});
  }
  return null;
}
