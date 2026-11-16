import type { VerifiedUser } from './auth';

type Context = { request:Request; url:URL; env:Env; user:VerifiedUser; json:(data:unknown,status?:number)=>Response;
  rateLimit:(env:Env,uid:string,route:string,max:number)=>Promise<void> };

export async function notifications({request,url,env,user,json,rateLimit}:Context):Promise<Response|null>{
  const path=url.pathname;
  if(path==='/v1/me/notifications'&&request.method==='GET'){
    if(url.search) return json({error:'Unsupported notification filter'},400);
    const [rows,total]=await Promise.all([
      env.DB.prepare(`SELECT id,kind,title,body,target_path,is_read,created_at FROM user_notifications
        WHERE recipient_uid=? ORDER BY created_at DESC,id DESC LIMIT 50`).bind(user.uid).all(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM user_notifications WHERE recipient_uid=? AND is_read=0')
        .bind(user.uid).first<{count:number}>(),
    ]);
    return json({notifications:rows.results||[],unreadCount:total?.count||0});
  }
  if(path==='/v1/me/notifications/read-all'&&request.method==='POST'){
    await rateLimit(env,user.uid,'notification-read',12);
    const updated=await env.DB.prepare('UPDATE user_notifications SET is_read=1 WHERE recipient_uid=? AND is_read=0')
      .bind(user.uid).run();
    return json({read:true,changed:updated.meta.changes});
  }
  const match=path.match(/^\/v1\/me\/notifications\/([0-9a-f]{32})\/read$/i);
  if(match&&request.method==='POST'){
    await rateLimit(env,user.uid,'notification-read',12);
    const result=await env.DB.prepare('UPDATE user_notifications SET is_read=1 WHERE id=? AND recipient_uid=?')
      .bind(match[1],user.uid).run();
    return result.meta.changes?json({read:true}):json({error:'Notification not found'},404);
  }
  return null;
}
