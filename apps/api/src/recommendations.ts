import type { VerifiedUser } from './auth';
import type { ProfileRecord } from './types';
import { skillCategories } from './providerValidation.ts';
import { publicGigWhere } from './publicGigs.ts';

type RecommendationContext = { request:Request; url:URL; env:Env; user:VerifiedUser;
  profile:ProfileRecord; json:(data:unknown,status?:number)=>Response };

export function memberInterests(raw:string):string[]{
  try{
    const value:unknown=JSON.parse(raw);
    if(!Array.isArray(value))return [];
    return [...new Set(value.filter((name):name is string=>typeof name==='string'&&skillCategories.includes(name as typeof skillCategories[number])))].slice(0,5);
  }catch{return [];}
}

export async function recommendations({request,url,env,user,profile,json}:RecommendationContext):Promise<Response|null>{
  if(url.pathname!=='/v1/me/recommended-gigs'||request.method!=='GET')return null;
  if(url.search) return json({error:'Unsupported recommendation filter'},400);
  // Recommendations never accept a client-supplied campus or state, and never
  // silently expand an enrolled member's selected campus to other schools.
  if(!profile.state_name)return json({gigs:[],reason:'choose_location',paymentsEnabled:false});
  const categories=memberInterests(profile.interests_json);
  const placeholders=categories.map(()=>'?').join(',');
  const interestExpression=categories.length?`CASE WHEN g.category IN (${placeholders}) THEN 1 ELSE 0 END`:'0';
  const query=`SELECT g.id,g.title,g.description,g.category,g.price_kobo,g.delivery_days,g.location_type,
    g.location_name,g.payment_option,g.status,g.created_at,g.updated_at,g.state_name,g.institution_id,
    p.display_name AS provider_name,p.cg_username AS provider_username,p.campus AS provider_campus,
    pp.public_id AS provider_public_id,pp.verified_at,
    (CASE WHEN p.show_online=1 AND p.last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 minutes') THEN 1 ELSE 0 END) AS provider_online,
    (SELECT id FROM gig_images WHERE gig_id=g.id ORDER BY created_at LIMIT 1) AS cover_image_id,
    ${interestExpression} AS interest_match,
    CASE WHEN EXISTS(SELECT 1 FROM provider_follows f WHERE f.provider_uid=g.provider_uid AND f.follower_uid=?) THEN 1 ELSE 0 END AS following_match
    FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid
    JOIN profiles p ON p.firebase_uid=g.provider_uid
    WHERE ${publicGigWhere} AND g.state_name=? ${profile.institution_id?'AND g.institution_id=?':''}
    ORDER BY interest_match DESC,following_match DESC,g.created_at DESC,g.id DESC LIMIT 6`;
  const params=[...categories,user.uid,profile.state_name,...(profile.institution_id?[profile.institution_id]:[])];
  const result=await env.DB.prepare(query).bind(...params).all();
  return json({gigs:result.results||[],reason:categories.length?'interests':'campus',paymentsEnabled:false});
}
