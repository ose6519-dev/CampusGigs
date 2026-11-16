import type { VerifiedUser } from './auth';
import { InputError } from './validation.ts';
import { findInstitution, likeTerm, onlineExpression, parseScope, publicProviderIdPattern, nigeriaStates } from './institutions.ts';
import { phaseB } from './phaseB.ts';

type Context = {
  request:Request;url:URL;env:Env;user:VerifiedUser|null;isAdmin:boolean;
  json:(value:unknown,status?:number)=>Response;readJson:(request:Request)=>Promise<unknown>;
  rateLimit:(env:Env,uid:string,route:string,max:number)=>Promise<void>;
};

function verified(user:VerifiedUser|null):VerifiedUser {
  if(!user) throw new InputError('Sign in to continue');
  if(!user.emailVerified) throw new InputError('Verify your email first');
  return user;
}

function pattern(query:string){
  return query ? `%${query.trim().split(/\s+/).map(word=>likeTerm(word).slice(1,-1)).join('%')}%` : '%';
}

export async function community(context:Context):Promise<Response|null>{
  const {request,url,env,json,user}=context;
  const path=url.pathname;

  if(path==='/v1/public/people' && request.method==='GET'){
    const filters=parseScope(url.searchParams,['q','state','institutionId','limit']);
    if(filters.institutionId){
      const school=await findInstitution(env,filters.institutionId);
      if(filters.state && school.state_name!==filters.state) throw new InputError('Institution is outside the selected state');
    }
    const q=pattern(filters.q);
    const [providers,members]=await Promise.all([
      env.DB.prepare(`SELECT pp.public_id,'provider' AS kind,p.display_name,p.avatar_url,p.bio,p.campus,p.city,p.state_name,p.institution_id,
        pp.verified_at,${onlineExpression} AS online,
        (SELECT COUNT(*) FROM provider_follows f WHERE f.provider_uid=p.firebase_uid) AS follower_count,
        (SELECT COUNT(*) FROM gigs g WHERE g.provider_uid=p.firebase_uid AND g.status='active') AS gig_count
        FROM provider_profiles pp JOIN profiles p ON p.firebase_uid=pp.firebase_uid
        WHERE pp.provider_status='active' AND pp.public_id IS NOT NULL AND p.account_status='active'
          AND p.directory_preference!='private'
          AND (?='' OR p.state_name=?) AND (?='' OR p.institution_id=?)
          AND (?='' OR p.display_name LIKE ? ESCAPE '\\' OR p.campus LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\'
            OR EXISTS(SELECT 1 FROM provider_applications a WHERE a.firebase_uid=p.firebase_uid AND a.skill_categories LIKE ? ESCAPE '\\'))
        ORDER BY online DESC,pp.verified_at DESC LIMIT ?`)
        .bind(filters.state,filters.state,filters.institutionId,filters.institutionId,filters.q,q,q,q,q,filters.limit).all(),
      env.DB.prepare(`SELECT p.member_public_id AS public_id,'member' AS kind,p.display_name,p.avatar_url,p.bio,p.campus,p.city,p.state_name,p.institution_id,
        '' AS verified_at,${onlineExpression} AS online,
        (SELECT COUNT(*) FROM member_follows f WHERE f.member_uid=p.firebase_uid) AS follower_count,
        0 AS gig_count
        FROM profiles p
        WHERE p.account_status='active' AND p.onboarding_completed=1 AND p.directory_preference='public' AND p.member_public_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM provider_profiles pp WHERE pp.firebase_uid=p.firebase_uid AND pp.provider_status='active')
          AND (?='' OR p.state_name=?) AND (?='' OR p.institution_id=?)
          AND (?='' OR p.display_name LIKE ? ESCAPE '\\' OR p.campus LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\')
        ORDER BY online DESC,p.created_at DESC LIMIT ?`)
        .bind(filters.state,filters.state,filters.institutionId,filters.institutionId,filters.q,q,q,q,filters.limit).all(),
    ]);
    type Row={kind:string;online:number;follower_count:number;[key:string]:unknown};
    const people=[...(providers.results||[]),...(members.results||[])] as Row[];
    people.sort((a,b)=>Number(b.online)-Number(a.online)||Number(b.kind==='provider')-Number(a.kind==='provider')||b.follower_count-a.follower_count);
    return json({people:people.slice(0,filters.limit)});
  }

  const publicPerson=path.match(/^\/v1\/public\/people\/([0-9a-f]{32})$/i);
  if(publicPerson&&request.method==='GET'){
    if(!publicProviderIdPattern.test(publicPerson[1]))return json({error:'Not found'},404);
    const provider=await env.DB.prepare(`SELECT pp.public_id FROM provider_profiles pp
      JOIN profiles p ON p.firebase_uid=pp.firebase_uid WHERE pp.public_id=?
      AND pp.provider_status='active' AND p.account_status='active'`).bind(publicPerson[1]).first();
    if(provider){
      const delegateUrl=new URL(`/v1/public/providers/${publicPerson[1]}`,url);
      const response=await phaseB({...context,url:delegateUrl});
      if(!response)return json({error:'Not found'},404);
      if(!response.ok)return response;
      const result=await response.json() as {provider:Record<string,unknown>;gigs:unknown[]};
      return json({person:{...result.provider,kind:'provider'},gigs:result.gigs});
    }
    const person=await env.DB.prepare(`SELECT p.member_public_id AS public_id,'member' AS kind,p.display_name,p.avatar_url,p.bio,
      p.campus,p.city,p.state_name,p.institution_id,'' AS verified_at,${onlineExpression} AS online,
      (SELECT COUNT(*) FROM member_follows f WHERE f.member_uid=p.firebase_uid) AS follower_count
      FROM profiles p WHERE p.member_public_id=? AND p.directory_preference='public'
        AND p.onboarding_completed=1 AND p.account_status='active'`).bind(publicPerson[1]).first();
    return person?json({person,gigs:[]}):json({error:'Profile not found'},404);
  }

  if(path==='/v1/me/directory'&&request.method==='PATCH'){
    const owner=verified(user);
    await context.rateLimit(env,owner.uid,'directory',6);
    const body=await context.readJson(request);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='visible')||typeof (body as {visible?:unknown}).visible!=='boolean')
      throw new InputError('Choose whether your profile appears in Find Folks');
    const visible=(body as {visible:boolean}).visible;
    if(visible){
      const current=await env.DB.prepare('SELECT state_name FROM profiles WHERE firebase_uid=?').bind(owner.uid).first<{state_name:string}>();
      if(!current||!nigeriaStates.includes(current.state_name as typeof nigeriaStates[number]))
        throw new InputError('Save your Nigerian state under Campus & privacy first');
    }
    const publicId=crypto.randomUUID().replaceAll('-','');
    await env.DB.prepare(`UPDATE profiles SET directory_preference=?,member_public_id=COALESCE(member_public_id,?),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE firebase_uid=? AND account_status='active'`)
      .bind(visible?'public':'private',visible?publicId:null,owner.uid).run();
    return json({visible});
  }

  if(path==='/v1/me/community-follows'&&request.method==='GET'){
    const owner=verified(user);
    const [providerRows,memberRows]=await Promise.all([
      env.DB.prepare(`SELECT pp.public_id,'provider' AS kind,p.display_name,p.avatar_url,p.campus,p.state_name,
        ${onlineExpression} AS online,f.created_at FROM provider_follows f
        JOIN provider_profiles pp ON pp.firebase_uid=f.provider_uid JOIN profiles p ON p.firebase_uid=f.provider_uid
        WHERE f.follower_uid=? AND pp.provider_status='active' AND p.account_status='active'`)
        .bind(owner.uid).all(),
      env.DB.prepare(`SELECT p.member_public_id AS public_id,'member' AS kind,p.display_name,p.avatar_url,p.campus,p.state_name,
        ${onlineExpression} AS online,f.created_at FROM member_follows f JOIN profiles p ON p.firebase_uid=f.member_uid
        WHERE f.follower_uid=? AND p.member_public_id IS NOT NULL AND p.directory_preference='public' AND p.account_status='active'`)
        .bind(owner.uid).all(),
    ]);
    type FollowRow={created_at:string;[key:string]:unknown};
    const rows=[...(providerRows.results||[]),...(memberRows.results||[])] as FollowRow[];
    rows.sort((a,b)=>b.created_at.localeCompare(a.created_at));
    return json({following:rows.slice(0,100).map(({created_at:_hidden,...row})=>row)});
  }

  const follow=path.match(/^\/v1\/me\/member-follows\/([0-9a-f]{32})$/i);
  if(follow&&(request.method==='PUT'||request.method==='DELETE')){
    const owner=verified(user);
    await context.rateLimit(env,owner.uid,'member-follows',20);
    const target=await env.DB.prepare(`SELECT firebase_uid FROM profiles WHERE member_public_id=?
      AND directory_preference='public' AND onboarding_completed=1 AND account_status='active'`)
      .bind(follow[1]).first<{firebase_uid:string}>();
    if(!target)return json({error:'Member is not discoverable'},404);
    if(target.firebase_uid===owner.uid)throw new InputError('You cannot follow yourself');
    if(request.method==='PUT'){
      await env.DB.prepare('INSERT OR IGNORE INTO member_follows(follower_uid,member_uid) VALUES (?,?)')
        .bind(owner.uid,target.firebase_uid).run();
    }else{
      await env.DB.prepare('DELETE FROM member_follows WHERE follower_uid=? AND member_uid=?')
        .bind(owner.uid,target.firebase_uid).run();
    }
    const total=await env.DB.prepare('SELECT COUNT(*) AS count FROM member_follows WHERE member_uid=?')
      .bind(target.firebase_uid).first<{count:number}>();
    return json({following:request.method==='PUT',followerCount:total?.count||0});
  }

  return null;
}
