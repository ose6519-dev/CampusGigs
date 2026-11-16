import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { adminGet, adminRequest, type Gig } from './api';

const money = (kobo: number) => `₦${(kobo/100).toLocaleString('en-NG',{maximumFractionDigits:2})}`;

export function GigModeration({ user, notice, onChanged }: { user: User; notice: (message: string) => void; onChanged: () => void }) {
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState<Record<string,string>>({});
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const result=await adminGet<{ gigs: Gig[] }>(user,'/v1/admin/gigs');setGigs(result.gigs); }
    catch (error) { notice((error as Error).message); }
    finally { setLoading(false); }
  },[user,notice]);
  useEffect(() => { void refresh(); },[refresh]);

  async function moderate(item: Gig) {
    const decision = item.status === 'removed' ? 'restored' : 'removed';
    const note = (reason[item.id] || '').trim();
    if (decision === 'removed' && note.length < 6) { notice('Enter the reason for removing this gig.'); return; }
    if (!window.confirm(`${decision==='removed'?'Remove':'Restore'} “${item.title}”?`)) return;
    setBusyId(item.id);
    try {
      await adminRequest(user,`/v1/admin/gigs/${item.id}/moderate`,{method:'POST',body:JSON.stringify({decision,note})});
      notice(decision==='removed'?'Gig removed from the marketplace.':'Gig restored.');
      await refresh();onChanged();
    } catch (error) { notice((error as Error).message); }
    finally { setBusyId(null); }
  }
  const filtered=gigs.filter(item=>`${item.title} ${item.category} ${item.provider_name} ${item.provider_email} ${item.id}`.toLowerCase().includes(search.toLowerCase()));
  return <><div className="page-heading"><div><span className="eyebrow">SERVICE QUALITY</span><h1>Gig <em>moderation.</em></h1><p>Review published services and remove anything unsafe.</p></div><button className="btn btn-light" onClick={() => void refresh()}>↻ Refresh</button></div>
    <div className="gig-summary"><div><span>✳</span><strong>{gigs.length}</strong><small>All services</small></div><div><span>✓</span><strong>{gigs.filter(item=>item.status==='active').length}</strong><small>Active listings</small></div><div><span>⊘</span><strong>{gigs.filter(item=>item.status==='removed').length}</strong><small>Removed</small></div></div>
    <section className="panel moderation-panel"><div className="approval-tools"><label><span>⌕</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find gig, provider, category or ID"/></label><span>{filtered.length} shown</span></div>{loading?<div className="empty-list">Loading gigs…</div>:!filtered.length?<div className="empty-list">No gigs match your search.</div>:<div className="moderation-list">{filtered.map(item=><article className="moderation-card" key={item.id}><span className="moderation-symbol">✳</span><div className="moderation-details"><span className="eyebrow">{item.category} · {item.location_type.replace('_',' ')}</span><h3>{item.title}</h3><p>{item.description}</p><small>By <b>{item.provider_name}</b> · {item.provider_email}</small><div className="moderation-meta"><strong>{money(item.price_kobo)}</strong><span>{item.delivery_days} day(s)</span><span>{item.payment_option} option</span><span className={`review-pill ${item.status}`}>{item.status}</span></div>{item.moderation_note && <p className="moderation-note">Admin note: {item.moderation_note}</p>}<div className="moderation-action">{item.status!=='removed'&&<input maxLength={500} value={reason[item.id]||''} onChange={event=>setReason({...reason,[item.id]:event.target.value})} placeholder="Why should this gig be removed?" aria-label={`Reason to remove ${item.title}`}/>}<button type="button" className={`btn ${item.status==='removed'?'btn-gold':'btn-danger'}`} disabled={busyId===item.id} onClick={()=>void moderate(item)}>{item.status==='removed'?'↻ Restore':'⊘ Remove'}</button></div></div></article>)}</div>}</section>
  </>;
}
