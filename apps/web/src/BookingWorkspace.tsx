import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { apiRequest, gigImageUrl, type BookingDetail, type BookingsResponse, type BookingStatus, type BookingSummary } from './api';
import { naira } from './BrowseGigs';

const statusName: Record<BookingStatus,string> = { requested:'Awaiting provider', accepted:'Accepted', declined:'Declined', cancelled:'Cancelled' };
const formatDate = (value: string) => new Date(value).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'});

export function BookingWorkspace({ user, onLogin, onBrowse, notice }: {
  user: User | null; onLogin: () => void; onBrowse: () => void; notice: (message: string) => void;
}) {
  const [role,setRole] = useState<'buyer'|'provider'>('buyer');
  const [items,setItems] = useState<BookingSummary[]>([]);
  const [loading,setLoading] = useState(false);
  const [busyId,setBusyId] = useState('');
  const [selected,setSelected] = useState<BookingDetail|null>(null);
  const [detailsLoading,setDetailsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); return; }
    setLoading(true);
    try {
      const result=await apiRequest<BookingsResponse>(user,`/v1/bookings?role=${role}`);
      setItems(result.bookings);
    } catch(error) { notice(error instanceof Error ? error.message : 'Could not load bookings'); }
    finally { setLoading(false); }
  },[user,role,notice]);

  useEffect(()=>{void refresh();},[refresh]);

  async function change(booking: BookingSummary, action: 'accept'|'decline'|'cancel') {
    if (!user || busyId) return;
    if (action === 'cancel' && !window.confirm('Cancel this service request?')) return;
    setBusyId(booking.id);
    try {
      if (action === 'cancel') await apiRequest(user,`/v1/bookings/${booking.id}/cancel`,{method:'POST'});
      else await apiRequest(user,`/v1/bookings/${booking.id}/decision`,{method:'POST',body:JSON.stringify({decision:action})});
      notice(action === 'accept' ? 'Request accepted.' : action === 'decline' ? 'Request declined.' : 'Request cancelled.');
      await refresh();
      if (selected?.booking.id === booking.id) setSelected(null);
    } catch(error) { notice(error instanceof Error ? error.message : 'Could not update request'); }
    finally { setBusyId(''); }
  }

  async function details(id: string) {
    if (!user) return;
    setDetailsLoading(true);
    try { setSelected(await apiRequest<BookingDetail>(user,`/v1/bookings/${id}`)); }
    catch(error) { notice(error instanceof Error ? error.message : 'Could not view booking'); }
    finally { setDetailsLoading(false); }
  }

  return <section className="section-wrap page-section bookings-page">
    <div className="bookings-heading"><div><span className="eyebrow">YOUR SERVICE REQUESTS</span><h1 className="page-title">My <em>bookings.</em></h1><p>Every request, in one place.</p></div><div className="bookings-graphic" aria-hidden="true">◈</div></div>
    {!user ? <div className="discover-empty"><div className="discover-empty-icon">✦</div><h2>Keep track of your gigs.</h2><p>Sign in to request services, see replies and manage bookings.</p><button className="button button-dark" onClick={onLogin}>Sign in <span>↗</span></button></div>
    : <>
      <div className="booking-tabs" role="tablist" aria-label="Booking role"><button role="tab" aria-selected={role==='buyer'} className={role==='buyer'?'active':''} onClick={()=>setRole('buyer')}>◉ &nbsp; My requests</button><button role="tab" aria-selected={role==='provider'} className={role==='provider'?'active':''} onClick={()=>setRole('provider')}>✦ &nbsp; Incoming requests</button><button className="booking-refresh" onClick={()=>void refresh()} disabled={loading}>↻ Refresh</button></div>
      {loading ? <div className="booking-loading">Loading bookings…</div> : items.length === 0 ? <div className="discover-empty"><div className="discover-empty-icon">◈</div><h2>{role==='buyer'?'Nothing requested yet.':'No new service requests.'}</h2><p>{role==='buyer'?'Explore gigs and send a request to a verified provider.':'When a customer requests your service, it appears here.'}</p><button className="button button-dark" onClick={()=>{if(role==='buyer')onBrowse();else void refresh();}}>{role==='buyer'?'Explore services':'Refresh'} <span>↗</span></button></div>
      : <div className="booking-list">{items.map(item=><article className="booking-card" key={item.id}>
        <div className="booking-thumb">{item.cover_image_id?<img src={gigImageUrl(item.gig_id,item.cover_image_id)} alt="" loading="lazy"/>:<span>✦</span>}</div>
        <div className="booking-card-main"><div className="booking-card-line"><span className={`booking-status status-${item.status}`}>● {statusName[item.status]}</span><small>{formatDate(item.requested_at)}</small></div><h2>{item.service_title}</h2><p>{role==='buyer'?`Provider: ${item.provider_name}`:`Requested by: ${item.buyer_name}`}</p><span className="booking-brief">“{item.brief}”</span><div className="booking-card-bottom"><strong>{naira(item.price_kobo)}</strong><span>◷ {item.delivery_days} day(s)</span><code>CG-{item.id.slice(0,8).toUpperCase()}</code></div></div>
        <div className="booking-actions"><button className="booking-details-btn" onClick={()=>void details(item.id)} disabled={detailsLoading}>Details ↗</button>{role==='provider' && item.status==='requested' && <><button className="booking-action-accept" onClick={()=>void change(item,'accept')} disabled={!!busyId}>Accept</button><button className="booking-action-decline" onClick={()=>void change(item,'decline')} disabled={!!busyId}>Decline</button></>}{role==='buyer' && (item.status==='requested'||item.status==='accepted') && <button className="booking-action-decline" onClick={()=>void change(item,'cancel')} disabled={!!busyId}>Cancel</button>}</div>
      </article>)}</div>}
      <div className="booking-payment-note"><span>🔒</span><div><strong>No payment is collected yet.</strong><p>Accepted requests confirm interest only. Checkout and FacePay need additional verification before launch.</p></div></div>
    </>}
    {selected && <div className="modal-layer" onMouseDown={(event)=>{if(event.target===event.currentTarget)setSelected(null);}}><div className="booking-detail-modal" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title"><button className="modal-close" onClick={()=>setSelected(null)} aria-label="Close details">×</button><span className="eyebrow">REQUEST CG-{selected.booking.id.slice(0,8).toUpperCase()}</span><h2 id="booking-detail-title">{selected.booking.service_title}</h2><span className={`booking-status status-${selected.booking.status}`}>{statusName[selected.booking.status]}</span><p className="booking-full-brief">{selected.booking.brief}</p><div className="booking-detail-row"><span>Agreed listing price</span><strong>{naira(selected.booking.price_kobo)}</strong></div><div className="booking-detail-row"><span>Estimated delivery</span><strong>{selected.booking.delivery_days} days</strong></div><h3>Request timeline</h3><div className="booking-timeline">{selected.events.map((event,index)=><div key={`${event.created_at}-${index}`}><span>●</span><div><strong>{statusName[event.to_status]}</strong><small>{formatDate(event.created_at)}</small></div></div>)}</div><button className="button button-dark" onClick={()=>setSelected(null)}>Done <span>✓</span></button></div></div>}
  </section>;
}
