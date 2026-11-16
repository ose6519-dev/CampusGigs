import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { apiRequest, gigImageUrl, type Gig, type ProviderAvailability, type ProviderGigs, type ProviderStatus } from './api';
import { serviceCategories } from './serviceCatalog';

const categories = serviceCategories;
const initialGig = { title:'', description:'', category:categories[0], priceNaira:'', deliveryDays:3, locationType:'online', locationName:'', paymentOption:'preview' };
const money = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

export function ProviderWorkspace({ user, location, stateName, institutionId, notice, onLogin, onApproved }: {
  user: User | null; location: string; stateName: string; institutionId: string; notice: (message: string) => void; onLogin: () => void; onApproved: (verified: boolean) => void;
}) {
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [availability,setAvailability]=useState<ProviderAvailability|null>(null);
  const [availabilityBusy,setAvailabilityBusy]=useState(false);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [categoriesChosen, setCategoriesChosen] = useState<string[]>([]);
  const [application, setApplication] = useState({ locationKind:'campus', locationName:location, bio:'', evidenceType:'student_id' });
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [gig, setGig] = useState(initialGig);
  const [images, setImages] = useState<File[]>([]);

  const refresh = useCallback(async () => {
    if (!user) { setProvider(null);setAvailability(null); setGigs([]); onApproved(false); return; }
    setLoading(true);
    try {
      const [profile, listings] = await Promise.all([
        apiRequest<ProviderStatus>(user,'/v1/provider'),
        apiRequest<ProviderGigs>(user,'/v1/provider/gigs'),
      ]);
      setProvider(profile); setGigs(listings.gigs); onApproved(profile.verified);
      if(profile.verified){
        try{setAvailability(await apiRequest<ProviderAvailability>(user,'/v1/provider/availability'));}
        catch{setAvailability(null);}
      }else setAvailability(null);
      if (profile.application) {
        const current = profile.application;
        setCategoriesChosen(current.categories);
        setApplication({ locationKind:current.location_kind, locationName:current.location_name, bio:current.bio, evidenceType:current.evidence_type });
      }
    } catch (error) { notice((error as Error).message); }
    finally { setLoading(false); }
  }, [user, onApproved, notice]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function toggleAvailability(){
    if(!user||!availability||availabilityBusy)return;
    setAvailabilityBusy(true);
    try{
      const result=await apiRequest<ProviderAvailability>(user,'/v1/provider/availability',
        {method:'PUT',body:JSON.stringify({acceptingBookings:!availability.acceptingBookings})});
      setAvailability(result);notice(result.acceptingBookings?'New requests enabled.':'New requests paused. Existing work stays active.');
    }catch(error){notice(error instanceof Error?error.message:'Could not update availability');}
    finally{setAvailabilityBusy(false);}
  }

  function toggleCategory(category: string) {
    setCategoriesChosen(current => current.includes(category) ? current.filter(item => item !== category) : current.length < 4 ? [...current, category] : current);
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !identityFile) { notice('Upload your student or government ID first.'); return; }
    if (!categoriesChosen.length) { notice('Choose at least one service category.'); return; }
    if (identityFile.size > 4 * 1024 * 1024) { notice('ID image must be 4 MB or smaller.'); return; }
    setBusy(true);
    try {
      const upload = await apiRequest<{ evidenceKey: string }>(user, '/v1/provider/evidence', {
        method:'POST', body:identityFile, headers:{ 'Content-Type':identityFile.type },
      });
      await apiRequest(user, '/v1/provider/application', {
        method:'POST', body:JSON.stringify({
          categories:categoriesChosen, locationKind:application.locationKind, locationName:application.locationName,
          bio:application.bio, evidenceType:application.evidenceType, evidenceKey:upload.evidenceKey,
        }),
      });
      setIdentityFile(null);
      notice('Application sent! The admin team will review your ID.');
      await refresh();
    } catch (error) { notice((error as Error).message); }
    finally { setBusy(false); }
  }

  async function publishGig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (!stateName) {notice('Set your recognised state in My Profile before publishing a gig.');return;}
    setBusy(true);
    try {
      const created = await apiRequest<{ id: string }>(user, '/v1/provider/gigs', {
        method:'POST', body:JSON.stringify({
          title:gig.title, description:gig.description, category:gig.category, priceKobo:Math.round(Number(gig.priceNaira) * 100),
          deliveryDays:Number(gig.deliveryDays), locationType:gig.locationType,
          locationName:gig.locationName, state:stateName,institutionId,paymentOption:gig.paymentOption,
        }),
      });
      let failedImages = 0;
      for (const image of images) {
        try {
          await apiRequest(user, `/v1/provider/gigs/${created.id}/images`, { method:'POST', body:image, headers:{ 'Content-Type':image.type } });
        } catch { failedImages += 1; }
      }
      setGig(initialGig); setImages([]);
      notice(failedImages ? `Gig published. ${failedImages} image(s) could not upload.` : 'Your gig is live! Booking requests are available; payments remain disabled.');
      await refresh();
    } catch (error) { notice((error as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="section-wrap page-section studio-page">
    {user && provider?.verified && <div className="studio-location-banner"><strong>◎ Your listing area</strong><span>{stateName ? `${location || 'State-wide services'} · ${stateName}` : 'Location not set — open My Profile and select your state/institution.'}</span></div>}
    <div className="studio-heading"><div><span className="eyebrow">YOUR TALENT. YOUR NEXT OPPORTUNITY.</span><h1 className="page-title">Provider <em>studio.</em></h1><p>Apply, get verified and create your services.</p></div><div className="studio-illustration" aria-hidden="true"><span>✳</span><strong>MAKE IT<br/>HAPPEN.</strong><i>↗</i></div></div>
    {!user ? <div className="studio-empty"><div className="studio-symbol">✦</div><h2>Earn from your skills.</h2><p>Use your CampSell account to get started on CampusGigs.</p><button className="button button-dark" onClick={onLogin}>Sign in to apply <span>→</span></button></div>
      : loading && !provider ? <div className="studio-empty"><p>Loading your provider workspace…</p></div>
      : provider?.verified ? <div className="studio-grid">
        <div className="studio-side"><div className="verified-panel"><span className="verified-seal">✦</span><span className="eyebrow">GIG PROVIDER</span><h2>You're <em>verified.</em></h2><p>Your profile carries the CampusGigs verified badge.</p><span className="verified-chip">✓ Identity approved</span></div><div className="studio-panel provider-availability"><span className="eyebrow">BOOKING AVAILABILITY</span><h3>{availability?.acceptingBookings?'Open for requests':'Taking a break'}</h3><p>{availability?`${availability.activeBookings} active job(s). Pause new requests without interrupting existing jobs.`:'Checking availability…'}</p><button type="button" role="switch" aria-checked={!!availability?.acceptingBookings} disabled={!availability||availabilityBusy} onClick={()=>void toggleAvailability()}>{availability?.acceptingBookings?'● Accepting bookings':'○ Paused'} <span>{availabilityBusy?'Updating…':'Change ↗'}</span></button></div><div className="studio-panel"><span className="eyebrow">YOUR LISTINGS</span><h3>{gigs.length} {gigs.length === 1 ? 'service' : 'services'}</h3><p>Track requests under My bookings. Payments remain disabled.</p><button className="button button-ghost" type="button" onClick={() => void refresh()}>↻ Refresh</button></div></div>
        <div className="studio-main"><form className="studio-panel studio-form" onSubmit={publishGig}><span className="eyebrow">NEW SERVICE</span><h2>Create a <em>gig.</em></h2><div className="studio-two"><label>Gig title<input required minLength={8} maxLength={100} placeholder="e.g. I will design your brand logo" value={gig.title} onChange={event => setGig({ ...gig,title:event.target.value })}/></label><label>Category<select value={gig.category} onChange={event => setGig({ ...gig,category:event.target.value })}>{categories.map(item => <option key={item}>{item}</option>)}</select></label></div><label>Description<textarea required rows={5} minLength={40} maxLength={3000} placeholder="Explain what you offer, what clients receive and what you need to begin." value={gig.description} onChange={event => setGig({ ...gig,description:event.target.value })}/></label><div className="studio-two"><label>Starting price (₦)<input required min={100} max={10000000} step="0.01" type="number" placeholder="5000" value={gig.priceNaira} onChange={event => setGig({ ...gig,priceNaira:event.target.value })}/></label><label>Delivery days<input required min={1} max={90} type="number" value={gig.deliveryDays} onChange={event => setGig({ ...gig,deliveryDays:Number(event.target.value) })}/></label></div><div className="studio-two"><label>Service location<select value={gig.locationType} onChange={event => setGig({ ...gig,locationType:event.target.value })}><option value="online">Online</option><option value="in_person">In-person</option><option value="both">Online & in-person</option></select></label><label>Campus / city<input required minLength={3} maxLength={100} placeholder="e.g. NDU, Amassoma" value={gig.locationName} onChange={event => setGig({ ...gig,locationName:event.target.value })}/></label></div><label>Payment option <span className="field-hint">Activates with the later payment phase</span><select value={gig.paymentOption} onChange={event => setGig({ ...gig,paymentOption:event.target.value })}><option value="preview">A · Preview before balance</option><option value="full">Full upfront payment</option><option value="deposit">Deposit then balance</option></select></label><label className="upload-label">Gig photos <span className="field-hint">Up to 4 · JPEG, PNG, WebP · 4 MB each</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event => setImages(Array.from(event.target.files || []).slice(0,4))}/><small>{images.length ? `${images.length} photo(s) selected` : 'Add clear examples of your work'}</small></label><p className="integrity-note">Tutoring, typing and proofreading are welcome. Completing assignments or exams for another person is not allowed.</p><button type="submit" className="button button-dark" disabled={busy}>{busy ? 'Publishing…' : 'Publish service'} <span>↗</span></button></form></div>
        <div className="studio-list"><div className="section-heading"><div><span className="eyebrow">YOUR WORK</span><h2>My <i>gigs.</i></h2></div></div>{gigs.length === 0 ? <div className="studio-empty mini"><p>No gigs yet. Publish your first service above.</p></div> : <div className="gig-grid">{gigs.map(item => <article className="gig-card" key={item.id}><div className="gig-cover">{item.cover_image_id ? <img src={gigImageUrl(item.id,item.cover_image_id)} alt="Gig example"/> : <span>✳</span>}<span className="gig-status">{item.status}</span></div><div className="gig-info"><small>{item.category}</small><h3>{item.title}</h3><div className="gig-meta"><strong>{money(item.price_kobo)}</strong><span>{item.delivery_days} day(s)</span></div></div></article>)}</div>}</div>
      </div> : <div className="application-layout"><div className="application-art"><span className="illustration-star">✦</span><span className="eyebrow">STEP 01 · GET VERIFIED</span><h2>Your skills<br/>deserve to<br/><em>be seen.</em></h2><p>One simple verification. One marketplace full of opportunities.</p><div className="art-verification"><span>✓</span><div><strong>Identity checked</strong><small>Approved providers earn a gold badge.</small></div></div></div><div className="studio-panel studio-form">
        {provider?.application?.status === 'pending' ? <div className="application-result"><span className="studio-symbol">◷</span><span className="eyebrow">UNDER REVIEW</span><h2>You're in the <em>queue.</em></h2><p>We received your application. Admin will check the ID before approving the badge.</p><button className="button button-ghost" onClick={() => void refresh()}>↻ Check status</button></div> : <><span className="eyebrow">JOIN THE PROVIDER COMMUNITY</span><h2>{provider?.application ? 'Update your <em>application.</em>' : 'Become a <em>provider.</em>'}</h2>{provider?.application?.review_note && <div className="review-message"><strong>Admin feedback</strong><p>{provider.application.review_note}</p></div>}<form onSubmit={submitApplication}><label>What skills do you offer? <span className="field-hint">Choose up to 4</span><div className="skill-chips">{categories.map(item => <button type="button" key={item} className={categoriesChosen.includes(item) ? 'chosen' : ''} onClick={() => toggleCategory(item)} aria-pressed={categoriesChosen.includes(item)}>{categoriesChosen.includes(item) ? '✓ ' : '+ '}{item}</button>)}</div></label><div className="studio-two"><label>Based in<select value={application.locationKind} onChange={event => setApplication({ ...application,locationKind:event.target.value })}><option value="campus">Campus</option><option value="city">City</option></select></label><label>Campus / city<input required minLength={3} maxLength={100} placeholder="Your campus or city" value={application.locationName} onChange={event => setApplication({ ...application,locationName:event.target.value })}/></label></div><label>About your work<textarea minLength={40} maxLength={800} required rows={4} placeholder="Tell clients what you're great at and your experience…" value={application.bio} onChange={event => setApplication({ ...application,bio:event.target.value })}/></label><div className="studio-two"><label>ID type<select value={application.evidenceType} onChange={event => setApplication({ ...application,evidenceType:event.target.value })}><option value="student_id">Student ID</option><option value="government_id">Government-issued ID</option></select></label><label>Upload ID <span className="field-hint">Private · Admin only</span><input type="file" required accept="image/jpeg,image/png,image/webp" onChange={event => setIdentityFile(event.target.files?.[0] || null)}/></label></div><div className="privacy-note">🔒 Your ID is private. Only authorised CampusGigs admins can view it.</div><button className="button button-dark" type="submit" disabled={busy || !user.emailVerified}>{busy ? 'Submitting…' : 'Submit for approval'} <span>→</span></button>{!user.emailVerified && <p className="integrity-note">Verify your email first. Sign out and back in after verification.</p>}</form></>}
      </div></div>}
  </section>;
}
