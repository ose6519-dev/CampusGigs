import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { apiRequest, publicRequest, type CommunityFollowingResponse, type PublicPersonDetail } from './api';
import { GigCard } from './BrowseGigs';

export function ProviderPublicProfile({id,user,onBack,onOpenGig,onLogin,notice}:{
  id:string;user:User|null;onBack:()=>void;onOpenGig:(id:string)=>void;onLogin:()=>void;notice:(text:string)=>void;
}){
  const [detail,setDetail]=useState<PublicPersonDetail|null>(null);
  const [following,setFollowing]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    void publicRequest<PublicPersonDetail>(`/v1/public/people/${id}`,controller.signal).then(setDetail)
      .catch(err=>{if(!controller.signal.aborted)setError((err as Error).message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[id]);
  useEffect(()=>{if(!user||!detail)return;let alive=true;
    void apiRequest<CommunityFollowingResponse>(user,'/v1/me/community-follows').then(data=>{if(alive)setFollowing(data.following.some(item=>item.public_id===id));}).catch(()=>{});
    return()=>{alive=false;};
  },[user,detail,id]);
  async function toggleFollow(){
    if(!user){onLogin();return;}
    if(!user.emailVerified){notice('Verify your email before following people.');return;}
    if(busy)return;setBusy(true);
    try{
      const data=await apiRequest<{following:boolean;followerCount:number}>(user,`/v1/me/${detail?.person.kind==='member'?'member-follows':'follows'}/${id}`,{method:following?'DELETE':'PUT'});
      setFollowing(data.following);
      setDetail(prev=>prev?{...prev,person:{...prev.person,follower_count:data.followerCount}}:prev);
      notice(data.following?'Following.':'Unfollowed.');
    }catch(err){notice((err as Error).message);}finally{setBusy(false);}
  }
  return <section className="section-wrap page-section people-page">
    <button className="detail-back" onClick={onBack}>← Find folks</button>
    {loading&&<div className="discovery-skeleton"><span/><span/><span/></div>}
    {error&&<div className="discover-empty" role="alert"><h2>Profile unavailable.</h2><p>{error}</p></div>}
    {detail&&<><div className="person-hero"><div className="person-hero-avatar">{detail.person.avatar_url?.startsWith('https://')?<img alt="" src={detail.person.avatar_url} referrerPolicy="no-referrer"/>:detail.person.display_name.slice(0,1).toUpperCase()}</div><div className="person-hero-copy"><span className="eyebrow">{detail.person.kind==='provider'?'VERIFIED CAMPUSGIGS PROVIDER':'CAMPUSGIGS COMMUNITY MEMBER'}</span><h1>{detail.person.display_name}</h1><strong className="folk-username">@{detail.person.cg_username}</strong><div className="person-hero-meta"><span className={detail.person.online?'status-online':'status-offline'}><i/>{detail.person.online?'Online now':'Offline'}</span>{detail.person.kind==='provider'&&<span>✦ Verified provider</span>}<span>◎ {detail.person.campus||detail.person.city||detail.person.state_name||'Nigeria'}</span></div><p>{detail.person.bio||'Part of the CampusGigs community.'}</p><span className="person-hero-followers">{detail.person.follower_count} followers{detail.person.kind==='provider'?` · ${detail.gigs.length} services`:''}</span></div><button className={`follow-button ${following?'following':''}`} type="button" disabled={busy} onClick={()=>void toggleFollow()}>{busy?'Please wait…':following?'✓ Following':'+ Follow'}</button></div>
      {detail.person.kind==='provider'&&<><div className="section-heading"><div><span className="eyebrow">AVAILABLE SERVICES</span><h2>Explore their <i>work.</i></h2></div></div>{detail.gigs.length?<div className="discovery-grid">{detail.gigs.map(gig=><GigCard key={gig.id} gig={gig} onOpen={onOpenGig}/>)}</div>:<div className="discover-empty"><p>No published services at the moment.</p></div>}</>}
    </>}
  </section>;
}

export function FollowingPanel({user,onOpen,onBrowse}:{user:User;onOpen:(id:string)=>void;onBrowse:()=>void}){
  const [rows,setRows]=useState<CommunityFollowingResponse['following']>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{let alive=true;void apiRequest<CommunityFollowingResponse>(user,'/v1/me/community-follows').then(result=>{if(alive)setRows(result.following);}).catch(()=>{}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[user]);
  return <section className="section-wrap following-panel"><div className="section-heading"><div><span className="eyebrow">YOUR COMMUNITY</span><h2>Following.</h2></div><button className="text-link" onClick={onBrowse}>Find folks ↗</button></div>
    {loading?<p>Loading your providers…</p>:rows.length?<div className="following-grid">{rows.map(item=><button key={item.public_id} onClick={()=>onOpen(item.public_id)}><strong>{item.display_name}</strong><small>{item.campus||item.state_name}</small><span className={item.online?'status-online':'status-offline'}><i/>{item.online?'Online':'Offline'}</span></button>)}</div>:<p>Follow verified providers to keep their profiles close.</p>}
  </section>;
}
