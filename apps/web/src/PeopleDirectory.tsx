import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { apiRequest, publicRequest, type FollowingResponse, type PublicProvider, type PublicProviderPage } from './api';
import { InstitutionPicker } from './InstitutionPicker';
import { savedScope, type CampusScope } from './BrowseGigs';

function PersonCard({person,onOpen,onFollow,following,busy}:{person:PublicProvider;onOpen:(id:string)=>void;onFollow:(id:string)=>void;following:boolean;busy:boolean}){
  const location = [person.campus || person.city,person.state_name].filter(Boolean).filter((item,index,array)=>array.indexOf(item)===index).join(' · ') || 'Nigeria';
  return <article className="folk-row">
    <button className="folk-profile" type="button" onClick={()=>onOpen(person.public_id)} aria-label={`View ${person.display_name}'s profile`}>
      <span className="folk-avatar">{person.avatar_url?.startsWith('https://')?<img alt="" src={person.avatar_url} referrerPolicy="no-referrer"/>:person.display_name.slice(0,1).toUpperCase()}<i className={person.online?'folk-online is-online':'folk-online'} title={person.online?'Online now':'Offline'}/></span>
      <span className="folk-info"><strong>{person.display_name} <span title="Verified provider" className="folk-verified">✦</span></strong><small>◎ {location}</small></span>
    </button>
    <button type="button" className={`folk-follow ${following?'is-following':''}`} aria-pressed={following} disabled={busy} onClick={()=>onFollow(person.public_id)}>{busy?'…':following?'✓ Following':'+ Follow'}</button>
  </article>;
}

export function PeopleDirectory({onOpen,onBack,profileScope,user,onLogin,notice}:{onOpen:(id:string)=>void;onBack:()=>void;profileScope?:CampusScope;user:User|null;onLogin:()=>void;notice:(value:string)=>void}){
  const [q,setQ]=useState('');
  const [confirmed,setConfirmed]=useState<CampusScope>(()=>profileScope?.state?profileScope:savedScope());
  const [state,setState]=useState(()=>confirmed.state);
  const [id,setId]=useState(()=>confirmed.institutionId);
  const [school,setSchool]=useState(()=>confirmed.name);
  const [pending,setPending]=useState<CampusScope|null>(null);
  const [people,setPeople]=useState<PublicProvider[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [followingIds,setFollowingIds]=useState<Set<string>>(new Set());
  const [busyId,setBusyId]=useState('');
  useEffect(()=>{
    if(!user||!user.emailVerified){setFollowingIds(new Set());return;}
    let alive=true;
    void apiRequest<FollowingResponse>(user,'/v1/me/follows').then(data=>{if(alive)setFollowingIds(new Set(data.following.map(row=>row.public_id)));}).catch(()=>{});
    return()=>{alive=false;};
  },[user]);
  async function toggleFollow(publicId:string){
    if(!user){onLogin();return;}
    if(!user.emailVerified){notice('Verify your email before following providers.');return;}
    if(busyId)return;
    const currentlyFollowing=followingIds.has(publicId);
    setBusyId(publicId);
    try{
      const next=await apiRequest<{following:boolean;followerCount:number}>(user,`/v1/me/follows/${publicId}`,{method:currentlyFollowing?'DELETE':'PUT'});
      setFollowingIds(previous=>{const copy=new Set(previous);next.following?copy.add(publicId):copy.delete(publicId);return copy;});
      setPeople(previous=>previous.map(row=>row.public_id===publicId?{...row,follower_count:next.followerCount}:row));
      notice(next.following?'Following provider.':'Unfollowed provider.');
    }catch(err){notice((err as Error).message);}finally{setBusyId('');}
  }
  useEffect(()=>{if(!profileScope?.state)return;setConfirmed(profileScope);setState(profileScope.state);setId(profileScope.institutionId);setSchool(profileScope.name);},[profileScope?.state,profileScope?.institutionId]);
  const apply=(next:CampusScope)=>{setState(next.state);setId(next.institutionId);setSchool(next.name);setConfirmed(next);};
  const change=(nextState:string,schoolId:string,name:string,reason?:'typing'|'selection'|'clear')=>{
    if(reason==='typing')return;
    const next={state:nextState,institutionId:schoolId,name};
    if(confirmed.state&&(confirmed.state!==nextState||Boolean(confirmed.institutionId&&confirmed.institutionId!==schoolId))){setPending(next);return;}
    apply(next);
  };
  useEffect(()=>{
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      const search=new URLSearchParams({limit:'24'});
      if(q.trim())search.set('q',q.trim());
      if(state)search.set('state',state);
      if(id)search.set('institutionId',id);
      setLoading(true);setError('');
      void publicRequest<PublicProviderPage>(`/v1/public/providers?${search}`,controller.signal)
        .then(data=>setPeople(data.providers))
        .catch(err=>{if(!controller.signal.aborted)setError((err as Error).message);})
        .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },250);
    return()=>{controller.abort();window.clearTimeout(timer);};
  },[q,state,id]);
  return <section className="section-wrap page-section people-page">
    <button className="detail-back" onClick={onBack}>← Explore gigs</button>
    <div className="discover-heading"><div><span className="eyebrow">CAMPUSGIGS COMMUNITY</span><h1 className="page-title">Find <em>folks.</em></h1><p>Meet skilled people around your campus.</p></div><div className="discover-mark">✦</div></div>
    <div className="people-search-panel"><label>Search a provider<input type="search" maxLength={80} placeholder="Name or skill" value={q} onChange={e=>setQ(e.target.value)}/></label><InstitutionPicker idPrefix="people" state={state} institutionId={id} institutionName={school} stateRequired={false} onChange={change}/><button className="discover-reset" onClick={()=>setPending({state:'',institutionId:'',name:''})}>Explore all states ↗</button></div>
    {error&&<div className="discover-error" role="alert">{error}</div>}
    <div className="people-count">{loading?'Finding providers…':`${people.length} verified providers shown`}</div>
    {loading?<div className="people-grid"><div className="discovery-skeleton"><span/><span/><span/></div><div className="discovery-skeleton"><span/><span/><span/></div></div>:people.length?<div className="people-grid">{people.map(person=><PersonCard key={person.public_id} person={person} onOpen={onOpen} onFollow={id=>void toggleFollow(id)} following={followingIds.has(person.public_id)} busy={busyId===person.public_id}/>)}</div>:<div className="discover-empty"><h2>No folks found.</h2><p>Try another school or clear your filters.</p></div>}
    {pending&&<div className="modal-layer" role="presentation"><div className="scope-warning" role="dialog" aria-modal="true" aria-labelledby="people-warning-title"><span className="scope-warning-icon">◎</span><span className="eyebrow">CAMPUS REMINDER</span><h2 id="people-warning-title">Explore outside your campus?</h2><p>{pending.state?`You're switching to ${pending.name||pending.state}.`:'You are about to explore providers across Nigeria.'} Their services may not be available near you. Confirm location before booking.</p><div><button className="button button-ghost" onClick={()=>setPending(null)}>Stay here</button><button className="button button-dark" onClick={()=>{apply(pending);setPending(null);}}>Continue ↗</button></div></div></div>}
  </section>;
}
