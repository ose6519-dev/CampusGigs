import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {apiRequest} from './api';

export type SearchEntry={
  id:string;kind:'gigs'|'people';query:string;state:string;institutionId:string;category:string;location:string;lastUsedAt:string;
};
export type SavedSearch=Pick<SearchEntry,'kind'|'query'|'state'|'institutionId'|'category'|'location'>;
const key='campusgigs.guest.search-history.v1';
const stored=():SearchEntry[]=>{
  try{
    const data=JSON.parse(localStorage.getItem(key)||'[]');
    return Array.isArray(data)?data.filter(item=>item&&['gigs','people'].includes(item.kind)&&typeof item.query==='string'&&typeof item.id==='string').slice(0,20):[];
  }catch{return [];}
};
const persist=(entries:SearchEntry[])=>{try{localStorage.setItem(key,JSON.stringify(entries.slice(0,20)));}catch{/* storage unavailable */}};
const same=(a:SavedSearch,b:SavedSearch)=>a.kind===b.kind&&a.query.toLowerCase()===b.query.toLowerCase()&&a.state===b.state&&a.institutionId===b.institutionId&&a.category===b.category&&a.location===b.location;

export function useSearchHistory(user:User|null,kind:SavedSearch['kind']){
  const [all,setAll]=useState<SearchEntry[]>([]);
  useEffect(()=>{
    let active=true;
    if(user?.emailVerified){
      void apiRequest<{history:SearchEntry[]}>(user,'/v1/me/search-history').then(data=>{if(active)setAll(data.history);}).catch(()=>{if(active)setAll([]);});
    }else setAll(stored());
    return()=>{active=false;};
  },[user]);
  const refresh=async()=>{
    if(!user?.emailVerified){setAll(stored());return;}
    const data=await apiRequest<{history:SearchEntry[]}>(user,'/v1/me/search-history');
    setAll(data.history);
  };
  async function save(entry:SavedSearch){
    if(!entry.query.trim()&&!entry.category&&!entry.location.trim())return;
    if(user?.emailVerified){
      await apiRequest(user,'/v1/me/search-history',{method:'POST',body:JSON.stringify(entry)});
      await refresh();
    }else{
      const item:SearchEntry={...entry,id:crypto.randomUUID(),lastUsedAt:new Date().toISOString()};
      const entries=[item,...stored().filter(existing=>!same(existing,entry))].slice(0,20);
      persist(entries);setAll(entries);
    }
  }
  async function remove(id:string){
    if(user?.emailVerified){await apiRequest(user,`/v1/me/search-history/${encodeURIComponent(id)}`,{method:'DELETE'});await refresh();}
    else{const entries=stored().filter(item=>item.id!==id);persist(entries);setAll(entries);}
  }
  async function clear(){
    if(user?.emailVerified){await apiRequest(user,`/v1/me/search-history?kind=${kind}`,{method:'DELETE'});await refresh();}
    else{const entries=stored().filter(item=>item.kind!==kind);persist(entries);setAll(entries);}
  }
  return {entries:all.filter(item=>item.kind===kind).slice(0,6),save,remove,clear};
}

export function RecentSearches({entries,onSelect,onRemove,onClear}:{entries:SearchEntry[];onSelect:(entry:SearchEntry)=>void;onRemove:(id:string)=>void;onClear:()=>void}){
  if(!entries.length)return null;
  return <aside className="recent-searches" aria-label="Saved search history">
    <div className="recent-heading"><strong>↶ Recent searches</strong><button type="button" onClick={onClear}>Clear history</button></div>
    <div className="recent-items">{entries.map(entry=><div className="recent-item" key={entry.id}>
      <button type="button" className="recent-open" onClick={()=>onSelect(entry)} title="Repeat this search"><span>⌕</span><span>{entry.query||entry.category||entry.location}<small>{[entry.state,entry.category].filter(Boolean).join(' · ')||'All campuses'}</small></span></button>
      <button type="button" className="recent-remove" aria-label={`Remove ${entry.query||entry.category||entry.location} from history`} onClick={()=>onRemove(entry.id)}>×</button>
    </div>)}</div>
  </aside>;
}
