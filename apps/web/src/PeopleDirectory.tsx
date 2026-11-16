import { useEffect, useState } from 'react';
import { publicRequest, type PublicProvider, type PublicProviderPage } from './api';
import { InstitutionPicker } from './InstitutionPicker';
import { savedScope, type CampusScope } from './BrowseGigs';

function PersonCard({person,onOpen}:{person:PublicProvider;onOpen:(id:string)=>void}){
  return <button type="button" className="person-card" onClick={()=>onOpen(person.public_id)}>
    <div className="person-card-top"><div className="person-avatar">{person.avatar_url?.startsWith('https://')?<img alt="" src={person.avatar_url} referrerPolicy="no-referrer"/>:person.display_name.slice(0,1).toUpperCase()}</div><div><strong>{person.display_name}</strong><span className="person-verified">✦ Verified provider</span></div></div>
    <p>{person.bio||'Discover this provider’s skills and services.'}</p>
    <div className="person-meta"><span>◎ {person.campus||person.state_name||'Nigeria'}</span><span>{person.gig_count||0} gigs</span></div>
    <div className="person-card-foot"><span className={person.online?'status-online':'status-offline'}><i/>{person.online?'Online':'Offline'}</span><strong>{person.follower_count} followers <b>↗</b></strong></div>
  </button>;
}

export function PeopleDirectory({onOpen,onBack,profileScope}:{onOpen:(id:string)=>void;onBack:()=>void;profileScope?:CampusScope}){
  const [q,setQ]=useState('');
  const [confirmed,setConfirmed]=useState<CampusScope>(()=>profileScope?.state?profileScope:savedScope());
  const [state,setState]=useState(()=>confirmed.state);
  const [id,setId]=useState(()=>confirmed.institutionId);
  const [school,setSchool]=useState(()=>confirmed.name);
  const [pending,setPending]=useState<CampusScope|null>(null);
  const [people,setPeople]=useState<PublicProvider[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
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
    <div className="discover-heading"><div><span className="eyebrow">CAMPUSGIGS COMMUNITY</span><h1 className="page-title">Find your <em>people.</em></h1><p>Explore verified providers. Follow the ones you trust.</p></div><div className="discover-mark">✦</div></div>
    <div className="people-search-panel"><label>Search a provider<input type="search" maxLength={80} placeholder="Name or skill" value={q} onChange={e=>setQ(e.target.value)}/></label><InstitutionPicker idPrefix="people" state={state} institutionId={id} institutionName={school} stateRequired={false} onChange={change}/><button className="discover-reset" onClick={()=>setPending({state:'',institutionId:'',name:''})}>Explore all states ↗</button></div>
    {error&&<div className="discover-error" role="alert">{error}</div>}
    <div className="people-count">{loading?'Finding providers…':`${people.length} verified providers shown`}</div>
    {loading?<div className="discovery-grid"><div className="discovery-skeleton"><span/><span/><span/></div><div className="discovery-skeleton"><span/><span/><span/></div></div>:people.length?<div className="people-grid">{people.map(person=><PersonCard key={person.public_id} person={person} onOpen={onOpen}/>)}</div>:<div className="discover-empty"><h2>No providers found.</h2><p>Try another school or clear your filters.</p></div>}
    {pending&&<div className="modal-layer" role="presentation"><div className="scope-warning" role="dialog" aria-modal="true" aria-labelledby="people-warning-title"><span className="scope-warning-icon">◎</span><span className="eyebrow">CAMPUS REMINDER</span><h2 id="people-warning-title">Explore outside your campus?</h2><p>{pending.state?`You're switching to ${pending.name||pending.state}.`:'You are about to explore providers across Nigeria.'} Their services may not be available near you. Confirm location before booking.</p><div><button className="button button-ghost" onClick={()=>setPending(null)}>Stay here</button><button className="button button-dark" onClick={()=>{apply(pending);setPending(null);}}>Continue ↗</button></div></div></div>}
  </section>;
}
