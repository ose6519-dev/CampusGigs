import type {VerifiedUser} from './auth.ts';
import {InputError} from './validation.ts';
import {findInstitution,nigeriaStates} from './institutions.ts';
import {skillCategories} from './providerValidation.ts';

type Context={
  request:Request;url:URL;env:Env;user:VerifiedUser;
  json:(value:unknown,status?:number)=>Response;
  readJson:(request:Request)=>Promise<unknown>;
  rateLimit:(env:Env,uid:string,route:string,max:number)=>Promise<void>;
};
const usernameFormat=/^[a-z][a-z0-9_]{2,23}$/;
const reserved=new Set(['admin','administrator','support','help','official','campusgigs','campus_gigs','cgigs','moderator','system','security','billing','verified','staff']);

export function parseUsername(input:unknown):string {
  if(typeof input!=='string')throw new InputError('Enter a C-Gigs username');
  const name=input.trim().replace(/^@/,'').toLowerCase();
  if(!usernameFormat.test(name)||reserved.has(name)||name.includes('__'))
    throw new InputError('Use 3–24 letters, numbers or underscores, starting with a letter');
  return name;
}

type HistoryInput={kind:'gigs'|'people';query:string;state:string;institutionId:string;category:string;location:string};
export function parseSearchEntry(input:unknown):HistoryInput {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError('Invalid search');
  const value=input as Record<string,unknown>;
  if(Object.keys(value).some(key=>!['kind','query','state','institutionId','category','location'].includes(key)))throw new InputError('Unknown search field');
  if(value.kind!=='gigs'&&value.kind!=='people')throw new InputError('Invalid search type');
  const read=(key:string,max:number)=>{
    const text=value[key]??'';
    if(typeof text!=='string'||text.length>max)throw new InputError(`Invalid ${key}`);
    return text.trim().replace(/\s+/gu,' ');
  };
  const query=read('query',80);
  const state=read('state',40);
  const institutionId=read('institutionId',32);
  const category=read('category',60);
  const location=read('location',100);
  if(!query&&!category&&!location)throw new InputError('Search for a name or service before saving');
  if(query.length>80||!nigeriaStates.includes(state as typeof nigeriaStates[number])&&state)throw new InputError('Choose a valid search and state');
  if(value.kind==='people'&&(category||location))throw new InputError('Invalid people search filter');
  if(category&&!skillCategories.includes(category as typeof skillCategories[number]))throw new InputError('Choose a recognised skill');
  return {kind:value.kind,query,state,institutionId,category,location};
}

export async function searchAccount(context:Context):Promise<Response|null>{
  const {request,url,env,user,json}=context;
  const path=url.pathname;
  if(path!=='/v1/me/username'&&path!=='/v1/me/search-history'&&!/^\/v1\/me\/search-history\/[0-9a-f-]{36}$/i.test(path))return null;
  if(!user.emailVerified)return json({error:'Verify your email first'},403);

  if(path==='/v1/me/username'&&request.method==='PATCH'){
    await context.rateLimit(env,user.uid,'username',6);
    const input=await context.readJson(request);
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='username'))
      throw new InputError('Enter your C-Gigs username');
    const username=parseUsername((input as Record<string,unknown>).username);
    const current=await env.DB.prepare('SELECT cg_username FROM profiles WHERE firebase_uid=?').bind(user.uid).first<{cg_username:string}>();
    if(current?.cg_username===username)return json({username});
    const taken=await env.DB.prepare('SELECT firebase_uid FROM profiles WHERE cg_username=? COLLATE NOCASE').bind(username).first<{firebase_uid:string}>();
    if(taken)return json({error:'That username is taken. Try another one.'},409);
    try {
      await env.DB.prepare(`UPDATE profiles SET cg_username=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE firebase_uid=?`).bind(username,user.uid).run();
    }catch(error){
      if(String(error).includes('UNIQUE'))return json({error:'That username is taken. Try another one.'},409);
      throw error;
    }
    return json({username});
  }

  if(path==='/v1/me/search-history'&&request.method==='GET'){
    const result=await env.DB.prepare(`SELECT id,kind,query,state_name AS state,institution_id AS institutionId,
      category,location_name AS location,last_used_at AS lastUsedAt FROM member_search_history
      WHERE firebase_uid=? ORDER BY last_used_at DESC,id DESC LIMIT 20`).bind(user.uid).all();
    return json({history:result.results||[]});
  }

  if(path==='/v1/me/search-history'&&request.method==='POST'){
    await context.rateLimit(env,user.uid,'search-history',30);
    const entry=parseSearchEntry(await context.readJson(request));
    if(entry.institutionId){
      const school=await findInstitution(env,entry.institutionId);
      if(entry.state&&school.state_name!==entry.state)throw new InputError('Institution is outside the selected state');
    }
    const normalized=entry.query.toLocaleLowerCase('en');
    const id=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO member_search_history
      (id,firebase_uid,kind,query,query_key,state_name,institution_id,category,location_name)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(firebase_uid,kind,query_key,state_name,institution_id,category,location_name)
      DO UPDATE SET query=excluded.query,last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(id,user.uid,entry.kind,entry.query,normalized,entry.state,entry.institutionId,entry.category,entry.location).run();
    await env.DB.prepare(`DELETE FROM member_search_history WHERE firebase_uid=? AND id NOT IN
      (SELECT id FROM member_search_history WHERE firebase_uid=? ORDER BY last_used_at DESC,id DESC LIMIT 20)`)
      .bind(user.uid,user.uid).run();
    return json({saved:true},201);
  }

  if(request.method==='DELETE'){
    await context.rateLimit(env,user.uid,'search-delete',20);
    if(path==='/v1/me/search-history'){
      const kinds=url.searchParams.getAll('kind');
      if(kinds.length>1||(kinds[0]&&kinds[0]!=='gigs'&&kinds[0]!=='people')||[...url.searchParams.keys()].some(key=>key!=='kind'))throw new InputError('Invalid history filter');
      if(kinds[0])await env.DB.prepare('DELETE FROM member_search_history WHERE firebase_uid=? AND kind=?').bind(user.uid,kinds[0]).run();
      else await env.DB.prepare('DELETE FROM member_search_history WHERE firebase_uid=?').bind(user.uid).run();
      return json({cleared:true});
    }
    const id=path.slice('/v1/me/search-history/'.length);
    await env.DB.prepare('DELETE FROM member_search_history WHERE firebase_uid=? AND id=?').bind(user.uid,id).run();
    return json({removed:true});
  }
  return json({error:'Method not allowed'},405);
}
