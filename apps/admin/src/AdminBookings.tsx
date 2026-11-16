import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { adminGet, type AdminBooking, type AdminBookingsResult } from './api';

const date = (value:string) => new Date(value).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'});
const naira = (value:number) => `₦${(value/100).toLocaleString('en-NG',{maximumFractionDigits:0})}`;

export function AdminBookings({ user, notice }: { user:User; notice:(message:string)=>void }) {
  const [data,setData]=useState<AdminBookingsResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('all');
  const [selected,setSelected]=useState<AdminBooking|null>(null);
  const refresh=useCallback(async()=>{
    setBusy(true);
    try {setData(await adminGet<AdminBookingsResult>(user,'/v1/admin/bookings'));}
    catch(error){notice(error instanceof Error?error.message:'Could not load service requests');}
    finally{setBusy(false);}
  },[user,notice]);
  useEffect(()=>{void refresh();},[refresh]);
  const items=useMemo(()=> (data?.bookings||[]).filter(item=>{
    const match=status==='all'||item.status===status;
    const term=search.trim().toLowerCase();
    return match&&(!term||[item.id,item.service_title,item.buyer_name,item.buyer_email,item.provider_name].some(field=>field?.toLowerCase().includes(term)));
  }),[data,search,status]);

  return <section className="admin-bookings">
    <div className="page-heading"><div><span className="eyebrow">PHASE D · SERVICE OPERATIONS</span><h1>Service <em>bookings.</em></h1><p>Review requests between customers and verified providers.</p></div><button className="btn btn-light" onClick={()=>void refresh()} disabled={busy}>{busy?'Loading…':'↻ Refresh'}</button></div>
    <div className="booking-admin-stats">{[
      ['Total requests',data?.counts.total||0],['Awaiting provider',data?.counts.pending||0],['Accepted',data?.counts.accepted||0],['Closed',(data?.counts.declined||0)+(data?.counts.cancelled||0)]
    ].map(([name,count])=><div className="booking-admin-stat" key={name}><span>{name}</span><strong>{count}</strong></div>)}</div>
    <div className="panel booking-admin-panel"><div className="booking-admin-filter"><label><span>⌕</span><input maxLength={80} placeholder="Name, gig, email or booking ID" aria-label="Search bookings" value={search} onChange={e=>setSearch(e.target.value)}/></label><select value={status} aria-label="Filter status" onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="requested">Requested</option><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option></select></div>
      {items.length?<div className="booking-admin-rows">{items.map(item=><button className="booking-admin-row" key={item.id} onClick={()=>setSelected(item)}><span className="booking-admin-person"><strong>{item.buyer_name}</strong><small>Buyer → {item.provider_name}</small></span><span className="booking-admin-gig">{item.service_title}<small>{date(item.requested_at)} · CG-{item.id.slice(0,8).toUpperCase()}</small></span><strong>{naira(item.price_kobo)}</strong><span className={`admin-booking-status ${item.status}`}>{item.status}</span><span>↗</span></button>)}</div>:<div className="empty-list">{busy?'Loading requests…':'No matching service bookings yet.'}</div>}
    </div>
    <div className="booking-admin-finance-note"><strong>Payments are off</strong><span>Request acceptance is not proof of payment. Do not manually mark requests as paid.</span></div>
    {selected&&<div className="modal-layer" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><div className="booking-admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-booking-title"><button className="modal-close" onClick={()=>setSelected(null)} aria-label="Close booking">×</button><span className="eyebrow">CG-{selected.id.slice(0,8).toUpperCase()}</span><h2 id="admin-booking-title">{selected.service_title}</h2><span className={`admin-booking-status ${selected.status}`}>{selected.status}</span><dl><dt>Buyer</dt><dd>{selected.buyer_name} · {selected.buyer_email}</dd><dt>Provider</dt><dd>{selected.provider_name}</dd><dt>Quoted price</dt><dd>{naira(selected.price_kobo)}</dd><dt>Requested</dt><dd>{date(selected.requested_at)}</dd></dl><h3>Request brief</h3><p>{selected.brief}</p><button className="btn btn-dark" onClick={()=>setSelected(null)}>Close</button></div></div>}
  </section>;
}
