import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { apiRequest, gigImageUrl, publicRequest, type PublicGigDetail } from './api';
import { GigCard, naira } from './BrowseGigs';

const paymentNames: Record<string, string> = { full: 'Full payment', deposit: 'Deposit', preview: 'Preview before payment' };

export function GigDetail({ gigId, user, onLogin, onBooked, onBack, onOpen, onNotice }: {
  gigId: string; user: User | null; onLogin: () => void; onBooked: () => void;
  onBack: () => void; onOpen: (id: string) => void; onNotice: (message: string) => void;
}) {
  const [data, setData] = useState<PublicGigDetail | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [requestId, setRequestId] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null); setActiveImage(0);
    void publicRequest<PublicGigDetail>(`/v1/public/gigs/${gigId}`, controller.signal)
      .then(setData)
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load this gig'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [gigId, retry]);

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: data?.gig.title, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); onNotice('Gig link copied'); }
    } catch (err) { if ((err as Error).name !== 'AbortError') onNotice('Could not share the link'); }
  }

  function openRequest() {
    if (!user) { onLogin(); return; }
    setRequestId(crypto.randomUUID());
    setBrief('');
    setRequestOpen(true);
  }

  async function requestService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return onLogin();
    if (!user.emailVerified) return onNotice('Verify your email address before booking.');
    setRequestBusy(true);
    try {
      await apiRequest(user,'/v1/bookings',{method:'POST',body:JSON.stringify({gigId,requestId,brief})});
      setRequestOpen(false);
      onNotice('Request sent! The provider can now respond.');
      onBooked();
    } catch(error) { onNotice(error instanceof Error ? error.message : 'Could not send request'); }
    finally { setRequestBusy(false); }
  }

  return <section className="section-wrap detail-page page-section">
    <div className="detail-topbar"><button onClick={onBack} className="detail-back">← All services</button><span className="eyebrow">CAMPUSGIGS / SERVICE DETAIL</span></div>
    {loading && <div className="detail-loading"><div className="discovery-skeleton"><span /><span /><span /></div><div className="discovery-skeleton"><span /><span /><span /></div></div>}
    {error && <div className="discover-empty"><div className="discover-empty-icon">◎</div><h2>Service unavailable.</h2><p>This gig may have been removed or is temporarily unavailable.</p><div className="detail-error-actions"><button className="button button-dark" onClick={onBack}>Browse services ↗</button><button className="button button-ghost" onClick={() => setRetry((n) => n + 1)}>Try again</button></div></div>}
    {data && <>
      <div className="detail-layout"><div className="detail-main">
        <div className="detail-image-stage">
          {data.images.length ? <img src={gigImageUrl(gigId, data.images[activeImage] || data.images[0])} alt={`${data.gig.title} sample ${activeImage + 1}`} /> : <div className="detail-no-image"><span>✦</span><strong>Skill speaks.</strong><small>CAMPUSGIGS</small></div>}
          <span className="detail-stage-tag">{data.gig.category}</span>
        </div>
        {data.images.length > 1 && <div className="detail-thumbnails" aria-label="Gig gallery">{data.images.map((id, index) => <button key={id} onClick={() => setActiveImage(index)} className={activeImage === index ? 'active' : ''} aria-label={`Show image ${index + 1}`}><img src={gigImageUrl(gigId, id)} alt="" loading="lazy" /></button>)}</div>}
        <div className="detail-overview"><div className="eyebrow">WHAT YOU'RE GETTING</div><h1>{data.gig.title}</h1><div className="detail-quick-facts"><span>◷ {data.gig.delivery_days} {data.gig.delivery_days === 1 ? 'day' : 'days'} delivery</span><span>◎ {data.gig.location_type === 'online' ? 'Online' : data.gig.location_type === 'both' ? 'Online or in person' : 'In person'}</span><span>✳ Verified provider</span></div></div>
        <article className="detail-description"><h2>About this service</h2><p>{data.gig.description}</p></article>
        <div className="detail-provider"><div className="provider-avatar">{data.gig.provider_avatar?.startsWith('https://') ? <img src={data.gig.provider_avatar} alt="" referrerPolicy="no-referrer" /> : (data.gig.provider_name || 'G').slice(0, 1).toUpperCase()}</div><div><span className="eyebrow">MEET THE PROVIDER</span><h3>{data.gig.provider_name || 'CampusGigs provider'} <span className="verified-mini" aria-label="Verified provider">✓</span></h3><p>{[data.gig.provider_campus, data.gig.provider_city].filter(Boolean).join(' · ') || data.gig.location_name}</p>{data.gig.provider_bio && <p className="provider-bio">{data.gig.provider_bio}</p>}</div></div>
      </div><aside className="detail-aside"><div className="detail-price-card"><span className="eyebrow">STARTING AT</span><strong className="detail-price">{naira(data.gig.price_kobo)}</strong><span className="detail-price-hint">Service price · no charge to request</span><div className="detail-price-divider" /><div className="detail-price-row"><span>Delivery</span><strong>{data.gig.delivery_days} {data.gig.delivery_days === 1 ? 'day' : 'days'}</strong></div><div className="detail-price-row"><span>Location</span><strong>{data.gig.location_name || 'Nigeria'}</strong></div><div className="detail-price-row"><span>Payment preference</span><strong>{paymentNames[data.gig.payment_option] || 'To be confirmed'}</strong></div><button className="button button-dark detail-book" onClick={openRequest}>Request this service <span>↗</span></button><p className="detail-safe">✓ No payment is taken. The provider will reply to your request.</p><button className="detail-share" onClick={() => void share()}>↗ Share this service</button></div></aside></div>
      {data.related.length > 0 && <div className="related-gigs"><div className="section-heading"><div><span className="eyebrow">KEEP EXPLORING</span><h2>More like <i>this.</i></h2></div><button className="text-link" onClick={onBack}>All services ↗</button></div><div className="discovery-grid">{data.related.map((gig) => <GigCard key={gig.id} gig={gig} onOpen={onOpen} />)}</div></div>}
    </>}
    {requestOpen && <div className="modal-layer" onMouseDown={event=>{if(event.target===event.currentTarget)setRequestOpen(false);}}><div className="booking-request-modal" role="dialog" aria-modal="true" aria-labelledby="request-title"><button className="modal-close" onClick={()=>setRequestOpen(false)} aria-label="Close request">×</button><span className="eyebrow">REQUEST A SERVICE</span><h2 id="request-title">Let's get it <em>done.</em></h2><p>Tell the provider what you need. Sending a request is free.</p><div className="booking-request-summary"><strong>{data?.gig.title}</strong><span>{naira(data?.gig.price_kobo || 0)}</span></div><form onSubmit={event=>void requestService(event)}><label>What do you need?<textarea required minLength={20} maxLength={2000} rows={6} placeholder="Explain your task, requirements and preferred delivery…" value={brief} onChange={event=>setBrief(event.target.value)} /></label><span className="booking-char-count">{brief.trim().length}/2000 characters</span>{user && !user.emailVerified && <p className="booking-unverified">Verify your email before submitting.</p>}<button className="button button-dark" type="submit" disabled={requestBusy||!user?.emailVerified}>{requestBusy?'Sending…':'Send request'} <span>↗</span></button></form><small>No payment or commitment to begin work is created by this request.</small></div></div>}
  </section>;
}
