import { useEffect, useState, type FormEvent } from 'react';
import { apiRequest, gigImageUrl, publicRequest, type PublicGig, type PublicGigPage, type GigSocial } from './api';
import { InstitutionPicker } from './InstitutionPicker';
import { serviceCatalog, serviceCategories } from './serviceCatalog';
import type { User } from 'firebase/auth';
import {RecentSearches,useSearchHistory,type SearchEntry} from './SearchHistory';

export const gigCategories = serviceCategories;

export const naira = (kobo: number) => `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(kobo / 100)}`;

function serviceIcon(category: string) {
  return serviceCatalog.find(item=>item.name===category)?.icon || '✦';
}

export function GigCard({ gig, onOpen, user, onLogin }: { gig: PublicGig; onOpen: (id: string) => void; user?:User|null; onLogin?:()=>void }) {
  const [liked,setLiked]=useState(false);
  const [likeCount,setLikeCount]=useState(gig.like_count||0);
  const [commentCount,setCommentCount]=useState(gig.comment_count||0);
  const [commentsOpen,setCommentsOpen]=useState(false);
  const [comments,setComments]=useState<GigSocial['comments']>([]);
  const [commentsLoading,setCommentsLoading]=useState(false);
  const [commentText,setCommentText]=useState('');
  const [commentBusy,setCommentBusy]=useState(false);
  const [likeBusy,setLikeBusy]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const link=new URL('/gigs/'+gig.id,window.location.origin).toString();
  const mediaUrl=gig.cover_image_id?gigImageUrl(gig.id,gig.cover_image_id):'';
  const hasVideo=Boolean(gig.cover_media_type?.startsWith('video/'));

  async function share(){
    try{
      if(navigator.share)await navigator.share({title:gig.title,text:'Discover this CampusGigs service',url:link});
      else if(navigator.clipboard){await navigator.clipboard.writeText(link);setFeedback('Link copied');}
      else setFeedback('Share this link: '+link);
    }catch(error){if((error as Error).name!=='AbortError')setFeedback('Could not share. Try copying the link.');}
  }
  async function toggleLike(){
    if(!user){onLogin?.();setFeedback('Sign in to react.');return;}
    if(likeBusy)return;
    const next=!liked;setLiked(next);setLikeCount(n=>Math.max(0,n+(next?1:-1)));setLikeBusy(true);setFeedback('');
    try{
      const data=await apiRequest<{liked:boolean;likeCount:number}>(user,'/v1/me/gigs/'+gig.id+'/like',{method:next?'PUT':'DELETE'});
      setLiked(data.liked);setLikeCount(data.likeCount);
    }catch(error){setLiked(!next);setLikeCount(n=>Math.max(0,n+(next?-1:1)));setFeedback((error as Error).message);}
    finally{setLikeBusy(false);}
  }
  async function loadComments(offset=0){
    setCommentsLoading(true);setFeedback('');
    try{
      const data=await publicRequest<GigSocial>('/v1/public/gigs/'+gig.id+'/social?offset='+offset);
      setComments(old=>offset?[...old,...data.comments]:data.comments);
      setCommentCount(data.commentCount);setLikeCount(data.likeCount);setNextOffset(data.nextOffset);
    }catch(error){setFeedback((error as Error).message);}
    finally{setCommentsLoading(false);}
  }
  function toggleComments(){const next=!commentsOpen;setCommentsOpen(next);if(next&&!comments.length)void loadComments();}
  async function sendComment(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!user){onLogin?.();setFeedback('Sign in to comment.');return;}
    if(commentBusy)return;
    setCommentBusy(true);setFeedback('');
    try{
      await apiRequest(user,'/v1/me/gigs/'+gig.id+'/comments',{method:'POST',body:JSON.stringify({body:commentText})});
      setCommentText('');await loadComments();
    }catch(error){setFeedback((error as Error).message);}
    finally{setCommentBusy(false);}
  }
  const name=gig.provider_name||'CampusGigs provider';
  return <article className="cg-feed-card">
    <div className="cg-feed-author"><span className="cg-feed-avatar">{gig.provider_avatar?.startsWith('https://')?<img src={gig.provider_avatar} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"/>:name.slice(0,1).toUpperCase()}</span>
      <div><strong>{name} <span className="verified-mini" aria-label="Verified provider">✓</span></strong><small>{gig.provider_username?'@'+gig.provider_username+' · ':''}{gig.provider_campus||gig.location_name||'CampusGigs'} · {new Date(gig.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}</small></div>
      <span className="cg-feed-tag">{gig.category}</span>
    </div>
    <button className="cg-feed-media" type="button" onClick={()=>onOpen(gig.id)} aria-label={'Open '+gig.title}>
      {mediaUrl?(hasVideo?<video src={mediaUrl} muted playsInline preload="metadata" onLoadedMetadata={event=>{const video=event.currentTarget;if(video.duration>0.25)video.currentTime=0.15;}}/>:<img src={mediaUrl} alt={gig.title} loading="lazy" decoding="async"/>)
        :<div className="cg-feed-empty-image"><span>{serviceIcon(gig.category)}</span><strong>CampusGigs</strong><small>Skills, made simple.</small></div>}
      {hasVideo&&<span className="cg-feed-video-badge">▶ Video</span>}
    </button>
    <div className="cg-feed-content"><button type="button" className="cg-feed-title" onClick={()=>onOpen(gig.id)}>{gig.title}</button>
      <p>{gig.description}</p>
      <div className="cg-feed-facts"><span>◎ {gig.location_type==='online'?'Online':gig.location_name||'Local'}</span><span>◷ {gig.delivery_days} days</span><strong>From {naira(gig.price_kobo)}</strong></div>
    </div>
    <div className="cg-feed-stats"><span>{likeCount} likes</span><span>{commentCount} comments</span></div>
    <div className="cg-feed-actions">
      <button type="button" className={liked?'cg-feed-liked':''} onClick={()=>void toggleLike()} disabled={likeBusy} aria-pressed={liked}><span aria-hidden="true">{liked?'♥':'♡'}</span> Like</button>
      <button type="button" onClick={toggleComments} aria-expanded={commentsOpen}><span aria-hidden="true">▤</span> Comment</button>
      <button type="button" onClick={()=>void share()}><span aria-hidden="true">↗</span> Share</button>
      <button type="button" onClick={()=>onOpen(gig.id)}><span aria-hidden="true">⌕</span> View gig</button>
    </div>
    {feedback&&<p className="cg-feed-feedback" role="status">{feedback}</p>}
    {commentsOpen&&<div className="cg-feed-comments">
      <div className="cg-feed-comment-heading"><strong>Conversation</strong><span>{commentCount} comments</span></div>
      <form onSubmit={event=>void sendComment(event)}><input value={commentText} onChange={event=>setCommentText(event.target.value)} placeholder="Write a thoughtful comment…" minLength={2} maxLength={800} aria-label="Write a comment" required/><button disabled={commentBusy||commentText.trim().length<2} type="submit">{commentBusy?'…':'Post ↗'}</button></form>
      {commentsLoading&&!comments.length?<p>Loading comments…</p>:comments.length?comments.map(comment=><div className="cg-feed-comment" key={comment.id}><span className="cg-feed-comment-avatar">{comment.avatar_url?.startsWith('https://')?<img src={comment.avatar_url} alt="" loading="lazy" referrerPolicy="no-referrer"/>:comment.display_name.slice(0,1).toUpperCase()}</span><div><strong>{comment.display_name}</strong><p>{comment.body}</p><small>{new Date(comment.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}</small></div></div>):!commentsLoading?<p>No comments yet. Start the conversation.</p>:null}
      {nextOffset!==null&&<button className="cg-feed-more-comments" type="button" disabled={commentsLoading} onClick={()=>void loadComments(nextOffset)}>{commentsLoading?'Loading…':'More comments ↓'}</button>}
    </div>}
  </article>;
}

export function FeaturedGigs({ onOpen, onBrowse, profileScope, user, onLogin }: { onOpen: (id: string) => void; onBrowse: () => void; profileScope?:CampusScope;user:User|null;onLogin?:()=>void }) {
  const [gigs, setGigs] = useState<PublicGig[]>([]);
  const [loading, setLoading] = useState(true);
  const [personalised,setPersonalised] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    if(user&&!profileScope?.state){setGigs([]);setLoading(false);return()=>controller.abort();}
    const scope=initialCampusScope(profileScope);
    const params=new URLSearchParams({limit:'4'});
    if(scope.state)params.set('state',scope.state);
    if(scope.institutionId)params.set('institutionId',scope.institutionId);
    setLoading(true);
    const local=()=>publicRequest<PublicGigPage>(`/v1/public/gigs?${params}`,controller.signal).then(data=>{setGigs(data.gigs);setPersonalised(false);});
    const load=user?apiRequest<PublicGigPage>(user,'/v1/me/recommended-gigs',{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted){setGigs(data.gigs.slice(0,4));setPersonalised(true);}})
      .catch(()=>controller.signal.aborted?undefined:local()):local();
    void load
      .catch(() => {if(!controller.signal.aborted)setGigs([]);})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [profileScope?.state,profileScope?.institutionId,user]);
  return <section className="section-wrap home-featured"><div className="section-heading"><div><span className="eyebrow">{personalised?'PICKED FOR YOUR CAMPUS':'FRESH FROM THE COMMUNITY'}</span><h2>{personalised?<>Skills for <i>you.</i></>:<>Discover real <i>talent.</i></>}</h2></div><button className="text-link" onClick={onBrowse}>Browse all gigs ↗</button></div>
    {gigs.length ? <div className="discovery-grid">{gigs.map((gig) => <GigCard gig={gig} key={gig.id} onOpen={onOpen} user={user} onLogin={onLogin} />)}</div> : <div className="home-featured-empty"><span>✦</span><div><strong>{loading ? 'Finding great skills…' : 'New gigs are on their way.'}</strong><p>Explore skill categories while our verified providers prepare their services.</p></div><button className="button button-dark" onClick={onBrowse}>Explore gigs ↗</button></div>}
  </section>;
}

type Filters = { q: string; category: string; location: string; state: string; institutionId: string; locationType: string; sort: string; minPrice: string; maxPrice: string };
export type CampusScope = {state:string;institutionId:string;name:string};
export function savedScope(): CampusScope {try{const data=JSON.parse(localStorage.getItem('campusgigs.scope.v1')||'{}');return {state:data.state||'',institutionId:data.institutionId||'',name:data.institutionId==='6879021fc76ef50a3d30'?'Niger Delta University, Amassoma':data.name||''};}catch{return {state:'',institutionId:'',name:''};}}
const initialCampusScope = (profile?:CampusScope):CampusScope => profile?.state ? profile : savedScope();
const startingFilters = (category: string, profile?:CampusScope): Filters => ({ q: '', category, location: '', ...((({state,institutionId})=>({state,institutionId}))(initialCampusScope(profile))), locationType: '', sort: 'newest', minPrice: '', maxPrice: '' });
function filtersFromUrl(category: string, profile?:CampusScope): Filters {
  const params = new URLSearchParams(window.location.search);
  const current = startingFilters(category,profile);
  for (const key of Object.keys(current) as (keyof Filters)[]) {
    // A shared URL must not silently override a member's confirmed campus/state.
    if (key==='state'||key==='institutionId') continue;
    const value = params.get(key);
    if (value !== null && value.length <= 100) current[key] = value;
  }
  if (!gigCategories.includes(current.category)) current.category = '';
  if (!['online', 'in_person', 'both', ''].includes(current.locationType)) current.locationType = '';
  if (!['newest', 'price_low', 'price_high', 'fastest'].includes(current.sort)) current.sort = 'newest';
  return current;
}

export function BrowseGigs({ initialCategory, onOpen, onPeople, profileScope, user, notice, onLogin }: { initialCategory: string; onOpen: (id: string) => void; onPeople: () => void; profileScope?:CampusScope;user:User|null;notice:(message:string)=>void;onLogin?:()=>void }) {
  const [filters, setFilters] = useState<Filters>(() => filtersFromUrl(initialCategory,profileScope));
  const [campusName,setCampusName]=useState(()=>initialCampusScope(profileScope).name);
  const [approvedScope,setApprovedScope]=useState(()=>initialCampusScope(profileScope));
  const [pendingScope,setPendingScope]=useState<{state:string;institutionId:string;name:string}|null>(null);
  const [pendingHistory,setPendingHistory]=useState<SearchEntry|null>(null);
  const [query, setQuery] = useState(filters.q);
  const [locationText, setLocationText] = useState(filters.location);
  const [gigs, setGigs] = useState<PublicGig[]>([]);
  const [offset, setOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const searches=useSearchHistory(user,'gigs');

  useEffect(()=>{
    if(!profileScope?.state)return;
    setFilters(old=>({...old,state:profileScope.state,institutionId:profileScope.institutionId}));
    setApprovedScope(profileScope);setCampusName(profileScope.name);
  },[profileScope?.state,profileScope?.institutionId]);

  // Search-as-you-type with a short debounce to avoid flooding the public API.
  useEffect(() => { const timer = window.setTimeout(() => setFilters((old) => old.q === query ? old : { ...old, q: query }), 350); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { const timer = window.setTimeout(() => setFilters((old) => old.location === locationText ? old : { ...old, location: locationText }), 350); return () => clearTimeout(timer); }, [locationText]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value && !(key === 'sort' && value === 'newest')) params.set(key, value); });
    window.history.replaceState(null, '', `/gigs${params.size ? `?${params}` : ''}`);
    params.set('limit', '12');
    setLoading(true); setError(''); setOffset(null);
    void publicRequest<PublicGigPage>(`/v1/public/gigs?${params}`, controller.signal)
      .then((page) => { setGigs(page.gigs); setOffset(page.nextOffset); })
      .catch((err: unknown) => { if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : 'Unable to load gigs'); setGigs([]); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, version]);

  const setFilter = (name: keyof Filters, value: string) => setFilters((old) => ({ ...old, [name]: value }));

  function applyScope(state:string,institutionId:string,name:string){
    setFilters(old=>({...old,state,institutionId}));setCampusName(name);
    setApprovedScope({state,institutionId,name});
    localStorage.setItem('campusgigs.scope.v1',JSON.stringify({state,institutionId,name}));
  }
  function changeScope(state:string,institutionId:string,name:string,reason?:'typing'|'selection'|'clear'){
    if(reason==='typing')return;
    if((approvedScope.state&&approvedScope.state!==state)||(approvedScope.institutionId&&approvedScope.institutionId!==institutionId)){
      setPendingScope({state,institutionId,name});return;
    }
    applyScope(state,institutionId,name);
  }

  async function loadMore() {
    if (offset === null || moreLoading) return;
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value && !(key === 'sort' && value === 'newest')) params.set(key, value); });
    params.set('limit', '12'); params.set('offset', String(offset));
    setMoreLoading(true);
    try {
      const result = await publicRequest<PublicGigPage>(`/v1/public/gigs?${params}`);
      setGigs((old) => [...old, ...result.gigs.filter((gig) => !old.some((item) => item.id === gig.id))]);
      setOffset(result.nextOffset);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load more gigs'); }
    finally { setMoreLoading(false); }
  }

  function clear() { setQuery(''); setLocationText(''); setFilters(old=>({...startingFilters('',profileScope),state:old.state,institutionId:old.institutionId})); }
  function submit(event: FormEvent) {
    event.preventDefault();setFilters((old) => ({ ...old, q: query, location: locationText }));
    void searches.save({kind:'gigs',query:query.trim(),state:filters.state,institutionId:filters.institutionId,category:filters.category,location:locationText.trim()})
      .catch(err=>notice((err as Error).message));
  }
  function applyHistory(entry:SearchEntry){
    if(entry.state!==filters.state||entry.institutionId!==filters.institutionId){
      setPendingHistory(entry);setPendingScope({state:entry.state,institutionId:entry.institutionId,name:''});return;
    }
    setQuery(entry.query);setLocationText(entry.location);
    setFilters(old=>({...old,q:entry.query,category:entry.category,location:entry.location}));
  }

  return <section className="section-wrap discover-page page-section">
    <div className="discover-heading"><div><span className="eyebrow">SKILLS, IDEAS & OPPORTUNITIES</span><h1 className="page-title">Explore <em>gigs.</em></h1><p>Discover services shared by real people.</p></div><div className="discover-mark" aria-hidden="true">✦</div></div>

    <div className="cg-gig-search-toolbar">
      <form className="discover-search" onSubmit={submit} role="search">
      <label className="discovery-search-main"><span aria-hidden="true">⌕</span><input type="search" value={query} maxLength={80} onChange={(event) => setQuery(event.target.value)} placeholder="What service do you need?" aria-label="Search gigs" /></label>
      <label className="discovery-location"><span aria-hidden="true">◎</span><input value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="City / neighbourhood (optional)" maxLength={100} aria-label="Search city or neighbourhood" /></label>
      <button type="submit" className="button button-dark">Search <span>↗</span></button>
    </form>
      <button type="button" className={'cg-gig-filters-button'+(filtersOpen?' selected':'')} aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(!filtersOpen)}>☷ Filters {filtersOpen?'−':'+'}</button>
    </div>
    <details className="cg-recent-searches"><summary>Recent searches</summary><RecentSearches entries={searches.entries} onSelect={applyHistory} onRemove={id=>void searches.remove(id).catch(err=>notice((err as Error).message))} onClear={()=>void searches.clear().catch(err=>notice((err as Error).message))}/></details>
    <div className="discover-community-link"><span>Meet trusted service providers.</span><button type="button" onClick={onPeople}>Find folks ↗</button></div>
    {filtersOpen&&<div className="cg-gig-advanced">
      <div className="campus-scope-panel"><div className="scope-head"><span className="eyebrow">CAMPUS-FIRST DISCOVERY</span><strong>{filters.institutionId?`◎ ${campusName||'Your selected school'}`:filters.state?`◎ ${filters.state} institutions`:'◎ Choose where you study or live'}</strong><p>{filters.state?'Only services tagged to your selected state and school appear.':'Choose a state to narrow services to its institutions.'}</p></div>
      <InstitutionPicker idPrefix="browse" state={filters.state} institutionId={filters.institutionId} institutionName={campusName} stateRequired={false} onChange={changeScope}/>
      <button className="scope-all-button" type="button" onClick={()=>setPendingScope({state:'',institutionId:'',name:''})}>Explore other states ↗</button>
    </div>
      <div className="discover-chips" aria-label="Filter gigs by skill category"><button className={!filters.category ? 'chosen' : ''} onClick={() => setFilter('category', '')}>All skills</button>{gigCategories.map((name) => <button className={filters.category === name ? 'chosen' : ''} key={name} onClick={() => setFilter('category', name)}>{name}</button>)}</div>
      <div className="discover-tools"><div className="discover-tools-heading"><strong>Explore gigs</strong><span>{loading ? 'Searching…' : `${gigs.length} ${gigs.length === 1 ? 'service' : 'services'} shown`}</span></div><div className="discover-selects">
      <label>Work type<select value={filters.locationType} onChange={(event) => setFilter('locationType', event.target.value)}><option value="">Any location</option><option value="online">Online</option><option value="in_person">In person</option><option value="both">Both options</option></select></label>
      <label>Sort<select value={filters.sort} onChange={(event) => setFilter('sort', event.target.value)}><option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option><option value="fastest">Fastest delivery</option></select></label>
      <label>Min ₦<input aria-label="Minimum price in naira" type="number" min="0" max="10000000" placeholder="0" value={filters.minPrice} onChange={(event) => setFilter('minPrice', event.target.value)} /></label>
      <label>Max ₦<input aria-label="Maximum price in naira" type="number" min="0" max="10000000" placeholder="Any" value={filters.maxPrice} onChange={(event) => setFilter('maxPrice', event.target.value)} /></label>
      <button className="discover-reset" onClick={clear}>Clear filters</button></div></div>
    </div>}
    {error && <div className="discover-error" role="alert">{error}<button onClick={() => setVersion((n) => n + 1)}>Retry</button></div>}
    {loading ? <div className="discovery-grid" aria-label="Loading services">{Array.from({ length: 6 }, (_, i) => <div className="discovery-skeleton" key={i}><span /><span /><span /></div>)}</div> : gigs.length ? <><div className="discovery-grid">{gigs.map((gig) => <GigCard key={gig.id} gig={gig} onOpen={onOpen} user={user} onLogin={onLogin} />)}</div>{offset !== null && <div className="more-row"><button className="button button-ghost" onClick={() => void loadMore()} disabled={moreLoading}>{moreLoading ? 'Loading…' : 'Load more services'} <span>↓</span></button></div>}</> : !error && <div className="discover-empty"><div className="discover-empty-icon">✦</div><h2>No gigs found yet.</h2><p>{filters.category || filters.q || filters.location || filters.locationType || filters.minPrice || filters.maxPrice ? 'Try clearing your filters or exploring another skill.' : 'Verified providers are getting ready. Check back as services are published.'}</p><button className="button button-dark" onClick={clear}>View all skills <span>↗</span></button></div>}
    <div className="discovery-footnote">Locations are based on provider-listed areas, not real-time device tracking. Always confirm where the service will happen before booking.</div>
    {pendingScope&&<div className="modal-layer" role="presentation"><div className="scope-warning" role="dialog" aria-modal="true" aria-labelledby="scope-warning-title"><span className="scope-warning-icon">◎</span><span className="eyebrow">LOCATION REMINDER</span><h2 id="scope-warning-title">Browsing outside your campus?</h2><p>{pendingScope.state?`You're switching to ${pendingScope.name||pendingScope.state}.`:'You are about to view services from across Nigeria.'} Travel and availability may be different. Confirm the provider's location before sending a booking request.</p><div><button type="button" className="button button-ghost" onClick={()=>{setPendingScope(null);setPendingHistory(null);}}>Stay here</button><button type="button" className="button button-dark" onClick={()=>{applyScope(pendingScope.state,pendingScope.institutionId,pendingScope.name);if(pendingHistory){setQuery(pendingHistory.query);setLocationText(pendingHistory.location);setFilters(old=>({...old,q:pendingHistory.query,category:pendingHistory.category,location:pendingHistory.location}));}setPendingScope(null);setPendingHistory(null);}}>Continue ↗</button></div></div></div>}
  </section>;
}
