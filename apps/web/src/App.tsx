import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { apiRequest, type MeResponse, type ProviderStatus } from './api';
import { firebaseAuth, firebaseReady, googleProvider } from './firebase';
import { ProviderWorkspace } from './ProviderWorkspace';
import { BrowseGigs, FeaturedGigs } from './BrowseGigs';
import { GigDetail } from './GigDetail';
import { BookingWorkspace } from './BookingWorkspace';
import { WelcomeSetup } from './WelcomeSetup';
import { PeopleDirectory } from './PeopleDirectory';
import { ProviderPublicProfile, FollowingPanel } from './ProviderPublicProfile';
import { LocationSettingsPanel } from './LocationSettingsPanel';
import { serviceCatalog } from './serviceCatalog';
import { NotificationCenter } from './NotificationCenter';
import { MessagesWorkspace } from './MessagesWorkspace';

function authMessage(error:unknown):string {
  const code=(error as {code?:string})?.code;
  switch(code){
    case 'auth/email-already-in-use':return 'An account already uses this email. Sign in or reset your password.';
    case 'auth/invalid-email':return 'That email address does not look right.';
    case 'auth/weak-password':return 'Choose a stronger password with at least 8 characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':return 'The email or password is incorrect. You can reset your password below.';
    case 'auth/operation-not-allowed':return 'Email/password sign-in is disabled in Firebase. Enable Email/Password in Authentication → Sign-in method.';
    case 'auth/too-many-requests':return 'Too many attempts. Please wait and try again.';
    case 'auth/network-request-failed':return 'Connection lost. Check your network and retry.';
    case 'auth/unauthorized-domain':return 'This website domain needs to be authorised in Firebase Authentication.';
    case 'auth/missing-password':return 'Please enter your password.';
    default:return 'Authentication could not finish. Please try again.';
  }
}

type View = 'explore' | 'categories' | 'detail' | 'bookings' | 'messages' | 'provider' | 'profile' | 'people' | 'person';

function routeFromLocation(): { view: View; gigId: string; category: string } {
  const path = window.location.pathname;
  const gigId = path.match(/^\/gigs\/([0-9a-f-]{36})\/?$/i)?.[1] || '';
  if (gigId) return { view: 'detail', gigId, category: '' };
  const personId=path.match(/^\/people\/([0-9a-f]{32})\/?$/i)?.[1];
  if(personId)return {view:'person',gigId:personId,category:''};
  if(path==='/people'||path==='/people/')return {view:'people',gigId:'',category:''};
  const chatId=path.match(/^\/messages\/([0-9a-f-]{36})\/?$/i)?.[1];
  if(chatId)return {view:'messages',gigId:chatId,category:''};
  if(path==='/messages'||path==='/messages/')return {view:'messages',gigId:'',category:''};
  if (path === '/gigs' || path === '/gigs/') return { view: 'categories', gigId: '', category: new URLSearchParams(window.location.search).get('category') || '' };
  if (path === '/bookings' || path === '/bookings/') return { view: 'bookings', gigId: '', category: '' };
  if (path === '/provide') return { view: 'provider', gigId: '', category: '' };
  if (path === '/profile') return { view: 'profile', gigId: '', category: '' };
  return { view: 'explore', gigId: '', category: '' };
}

const categories = serviceCatalog;
const featuredCategories = ['Barbing & Grooming','Hairdressing & Braiding','Phone & Gadget Repairs',
  'Electrical Services','Tech & Digital','Tutoring & Skills'].map(name=>categories.find(category=>category.name===name)!).filter(Boolean);

function Icon({ children }: { children: ReactNode }) {
  return <span aria-hidden="true">{children}</span>;
}

function App() {
  const [route, setRoute] = useState(routeFromLocation);
  const [browseVersion, setBrowseVersion] = useState(0);
  const { view } = route;
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [profileReady,setProfileReady]=useState(false);
  const [providerVerified, setProviderVerified] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError,setAuthError]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [verificationTick,setVerificationTick]=useState(0);
  const [verificationBusy,setVerificationBusy]=useState(false);
  const [editingSetup,setEditingSetup]=useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ displayName: '', campus: '', city: '', bio: '' });

  const refreshProfile = useCallback(async (currentUser: User) => {
    setProfileReady(false);
    try {
      const response = await apiRequest<MeResponse>(currentUser, '/v1/me');
      setMe(response);
      setForm({
        displayName: response.profile.display_name,
        campus: response.profile.campus,
        city: response.profile.city,
        bio: response.profile.bio,
      });
      try {
        const status = await apiRequest<ProviderStatus>(currentUser, '/v1/provider');
        setProviderVerified(status.verified);
      } catch { setProviderVerified(false); }
    } catch (error) {
      setMe(null);
      setNotice(error instanceof Error ? error.message : 'Unable to load profile');
    } finally {setProfileReady(true);}
  }, []);

  useEffect(() => {
    if (!firebaseAuth) return;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      setProfileReady(!currentUser);
      if (currentUser) {
        setAuthOpen(false);
        void refreshProfile(currentUser);
      } else {
        setMe(null);
        setProviderVerified(false);
      }
    });
    void getRedirectResult(firebaseAuth).catch(() => setNotice('Google sign-in did not finish. Please try again.'));
    return unsubscribe;
  }, [refreshProfile]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(()=>{
    if(!user?.emailVerified||!me?.profile.show_online)return;
    const heartbeat=()=>{if(document.visibilityState==='visible')void apiRequest(user,'/v1/me/presence',{method:'POST',body:JSON.stringify({visible:true})}).catch(()=>{});};
    heartbeat();const timer=window.setInterval(heartbeat,60_000);
    document.addEventListener('visibilitychange',heartbeat);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',heartbeat);};
  },[user,me?.profile.show_online]);

  useEffect(() => {
    const onPopState = () => { setRoute(routeFromLocation()); setBrowseVersion((n) => n + 1); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!authOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAuthOpen(false);
    };
    window.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', dismissOnEscape);
    };
  }, [authOpen]);

  function goTo(next: View) {
    setEditingSetup(false);
    const path = ({ explore: '/', categories: '/gigs', bookings: '/bookings', messages:'/messages', provider: '/provide', profile: '/profile', detail: '/', people:'/people', person:'/people' } as Record<View, string>)[next];
    window.history.pushState(null, '', path);
    setRoute({ view: next, gigId: '', category: '' });
    if (next === 'categories') setBrowseVersion((n) => n + 1);
    if ((next === 'profile' || next === 'provider' || next === 'bookings' || next === 'messages') && !user) setAuthOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToCategory(category: string) {
    window.history.pushState(null, '', `/gigs?category=${encodeURIComponent(category)}`);
    setRoute({ view: 'categories', gigId: '', category });
    setBrowseVersion((n) => n + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openGig(gigId: string) {
    window.history.pushState(null, '', `/gigs/${gigId}`);
    setRoute({ view: 'detail', gigId, category: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openPerson(id:string){
    window.history.pushState(null,'',`/people/${id}`);
    setRoute({view:'person',gigId:id,category:''});
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function openMessages(bookingId:string){
    window.history.pushState(null,'',`/messages/${bookingId}`);
    setRoute({view:'messages',gigId:bookingId,category:''});
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function googleLogin() {
    if (!firebaseAuth) return setNotice('Firebase is not configured yet.');
    setLoading(true);
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
      setNotice('Welcome to CampusGigs!');
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(firebaseAuth, googleProvider);
      } else if (code !== 'auth/popup-closed-by-user') {
        setNotice('Google sign-in failed. Check your authorised domains and try again.');
      }
    } finally { setLoading(false); }
  }

  async function emailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseAuth) return setNotice('Firebase is not configured yet.');
    setLoading(true);
    setAuthError('');
    try {
      if (registering) {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, authEmail.trim(), authPassword);
        let sent = true;
        try { await sendEmailVerification(credential.user); }
        catch { sent = false; }
        setNotice(sent?'Account created. Check your inbox for the verification link.':'Account created. Use Resend email on the verification screen.');
      } else {
        await signInWithEmailAndPassword(firebaseAuth, authEmail.trim(), authPassword);
        setNotice('Signed in successfully.');
      }
      setAuthOpen(false);
      setAuthPassword('');
    } catch (error) {
      const message=authMessage(error);
      setAuthError(message);
      setNotice(message);
    } finally { setLoading(false); }
  }

  async function resetPassword(){
    if(!firebaseAuth)return;
    if(!authEmail.trim()){setAuthError('Enter your email address first.');return;}
    setLoading(true);setAuthError('');
    try {await sendPasswordResetEmail(firebaseAuth,authEmail.trim());setNotice('If this email has an account, a reset link will arrive shortly.');}
    catch(error){setAuthError(authMessage(error));}
    finally{setLoading(false);}
  }

  async function resendVerification(){
    if(!user)return;
    setVerificationBusy(true);
    try{await sendEmailVerification(user);setNotice('Verification email sent. Check your inbox and spam folder.');}
    catch(error){setNotice(authMessage(error));}
    finally{setVerificationBusy(false);}
  }

  async function verifyEmailNow(){
    if(!user)return;
    setVerificationBusy(true);
    try{
      await user.reload();
      await user.getIdToken(true);
      setVerificationTick(value=>value+1);
      if(user.emailVerified){await refreshProfile(user);setNotice('Email verified successfully.');}
      else setNotice('Your email is not verified yet. Open the email link and try again.');
    }catch(error){setNotice(authMessage(error));}
    finally{setVerificationBusy(false);}
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await apiRequest(user, '/v1/me', { method: 'PATCH', body: JSON.stringify({displayName:form.displayName,city:form.city,bio:form.bio}) });
      await refreshProfile(user);
      setNotice('Profile updated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save profile');
    } finally { setSaving(false); }
  }

  async function switchMode() {
    if (!user || !me) return;
    const next = me.profile.active_mode === 'buying' ? 'providing' : 'buying';
    try {
      await apiRequest(user, '/v1/me/mode', { method: 'PATCH', body: JSON.stringify({ mode: next }) });
      await refreshProfile(user);
      if (next === 'providing') goTo('provider');
      setNotice(next === 'providing' ? 'Providing mode selected. Open your provider studio.' : 'Buying mode selected.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not switch mode'); }
  }

  return (
    <div className={`app-shell ${view==='messages'?'cg-app-chat-mode':''}`}>
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" type="button" onClick={() => goTo('explore')} aria-label="CampusGigs home">
            <span className="brand-logo">C<span>G</span></span>
            <span className="brand-word">Campus<span>Gigs</span><small>SKILLS, MADE SIMPLE.</small></span>
          </button>
          <nav className="desktop-nav" aria-label="Main navigation">
            <button className={view === 'explore' ? 'selected' : ''} onClick={() => goTo('explore')}>Explore</button>
            <button className={view === 'categories' || view === 'detail' ? 'selected' : ''} onClick={() => goTo('categories')}>Find services</button>
            <button className={view === 'bookings' ? 'selected' : ''} onClick={() => goTo('bookings')}>My bookings</button>
            <button className={view === 'messages' ? 'selected' : ''} onClick={() => goTo('messages')}>Messages</button>
            <button className={view === 'provider' ? 'selected' : ''} onClick={() => goTo('provider')}>Become a provider</button>
            <a href="https://campsell.pages.dev" target="_blank" rel="noopener noreferrer">Explore CampSell <span>↗</span></a>
          </nav>
          <div className="header-actions">
            <span className="eyebrow hide-mobile">MADE FOR NIGERIA</span>
            <NotificationCenter user={user?.emailVerified&&me?.profile.onboarding_completed?user:null} onNavigate={(path)=>{if(path==='/bookings')goTo('bookings');else if(path==='/provide')goTo('provider');else if(path.startsWith('/people/'))openPerson(path.slice('/people/'.length));else goTo('profile');}} />
            <button className="header-profile" type="button" onClick={() => goTo('profile')} aria-label={user ? 'Open my CampusGigs profile' : 'Sign in to CampusGigs'}>
              {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <Icon>◉</Icon>}
              <span>{user ? 'My account' : 'Sign in'}</span>
            </button>
          </div>
        </div>
      </header>

      <main>
        {view === 'explore' && <>
          <section className="hero section-wrap">
            <div className="hero-copy">
              <div className="hero-chip"><span className="chip-dot" /> YOUR CAMPUS. YOUR CITY. YOUR OPPORTUNITY.</div>
              <h1>Good skills.<br /><em>Great possibilities.</em></h1>
              <p>Find people who get it done. Or turn what you're good at into something you earn from.</p>
              <div className="hero-cta">
                <button className="button button-dark" onClick={() => goTo('categories')}>Explore services <span>↗</span></button>
                <button className="button button-ghost" onClick={() => goTo('provider')}>Offer a skill <span>→</span></button>
              </div>
              <div className="hero-trust"><span>✓ Service-only marketplace</span><span>✓ Verified profiles</span><span>✓ Built for Nigeria</span></div>
            </div>
            <div className="hero-art" aria-label="CampusGigs creative service illustration">
              <div className="orb orb-one" /><div className="orb orb-two" />
              <div className="hero-art-card main-card"><div className="float-icon">✷</div><strong>Got a skill?</strong><span>Make it work for you.</span><div className="art-strokes" /></div>
              <div className="hero-art-card small-card"><span className="star">✦</span><strong>Talent is everywhere.</strong><span>Let's find yours.</span></div>
              <div className="art-pill">✹ &nbsp; CREATE · CONNECT · EARN</div>
            </div>
          </section>
          <div className="value-ribbon"><span>STUDENTS</span><span className="ribbon-star">✦</span><span>CREATORS</span><span className="ribbon-star">✦</span><span>EVERYDAY EXPERTS</span><span className="ribbon-star">✦</span><span>EVERYWHERE IN NIGERIA</span></div>
          <section className="section-wrap feature-section">
            <div className="section-heading"><div><span className="eyebrow">DISCOVER WHAT'S POSSIBLE</span><h2>Find your kind of <i>expert.</i></h2></div><button className="text-link" onClick={() => goTo('categories')}>All categories <span>↗</span></button></div>
            <div className="category-grid">{featuredCategories.map((category) => <CategoryCard key={category.name} category={category} onClick={() => goToCategory(category.name)} />)}</div>
            <p className="phase-note">Browse verified services, find the right person and see their work.</p>
          </section>
          <FeaturedGigs user={user} onLogin={()=>setAuthOpen(true)} onOpen={openGig} onBrowse={() => goTo('categories')} profileScope={{state:me?.profile.state_name||'',institutionId:me?.profile.institution_id||'',name:me?.profile.campus||''}} />
          <section className="section-wrap connect-panel"><div><span className="eyebrow">TWO WORLDS. ONE COMMUNITY.</span><h2>Looking for products<br />instead of services?</h2><p>CampusGigs is for skills and services. Shop physical goods on CampSell.</p></div><a className="button button-gold" href="https://campsell.pages.dev" target="_blank" rel="noopener noreferrer">Explore CampSell <span>↗</span></a></section>
        </>}

        {view === 'categories' && <BrowseGigs key={browseVersion} initialCategory={route.category} onOpen={openGig} onPeople={()=>goTo('people')} onLogin={()=>setAuthOpen(true)} user={me?.profile.onboarding_completed?user:null} notice={setNotice} profileScope={{state:me?.profile.state_name||'',institutionId:me?.profile.institution_id||'',name:me?.profile.campus||''}} />}

        {view === 'people' && <PeopleDirectory onOpen={openPerson} onBack={()=>goTo('categories')} user={user} onLogin={()=>setAuthOpen(true)} notice={setNotice} profileScope={{state:me?.profile.state_name||'',institutionId:me?.profile.institution_id||'',name:me?.profile.campus||''}} />}

        {view === 'person' && <ProviderPublicProfile id={route.gigId} user={user} onBack={()=>goTo('people')} onOpenGig={openGig} onLogin={()=>setAuthOpen(true)} notice={setNotice} />}

        {view === 'detail' && <GigDetail gigId={route.gigId} user={user} onLogin={()=>setAuthOpen(true)} onBooked={()=>goTo('bookings')} onBack={() => goTo('categories')} onOpen={openGig} onProviderOpen={openPerson} onNotice={setNotice} />}

        {view === 'bookings' && <BookingWorkspace user={user} onLogin={()=>setAuthOpen(true)} onBrowse={()=>goTo('categories')} onMessages={openMessages} notice={setNotice} />}

        {view === 'messages' && <MessagesWorkspace user={user} initialBookingId={route.gigId} onLogin={()=>setAuthOpen(true)} onBack={()=>goTo('categories')} onProfile={openPerson} notice={setNotice} />}

        {view === 'provider' && <ProviderWorkspace user={user} location={me?.profile.campus || me?.profile.city || ''} stateName={me?.profile.state_name||''} institutionId={me?.profile.institution_id||''} notice={setNotice} onLogin={() => setAuthOpen(true)} onApproved={setProviderVerified}/>}

        {view === 'profile' && <section className="section-wrap page-section profile-page"><span className="eyebrow">YOUR CAMPUSGIGS SPACE</span><h1 className="page-title">Your space, <em>your way.</em></h1>{!user ? <div className="profile-empty"><div className="empty-icon">◉</div><h2>You're one step away.</h2><p>Sign in with the same Firebase account you use on CampSell.</p><button className="button button-dark" onClick={() => setAuthOpen(true)}>Sign in to continue <span>→</span></button></div> : <div className="profile-layout"><div className="profile-summary"><div className="profile-avatar">{user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : user.displayName?.slice(0, 1).toUpperCase() || 'C'}</div><h2>{me?.profile.display_name || user.displayName || 'CampusGigs member'}</h2><p>{user.email}</p><span className="status-badge">{providerVerified ? '✦ Verified gig provider' : me?.role === 'admin' ? '✦ Administrator' : '● CampusGigs member'}</span><nav className="cg-profile-quick" aria-label="Profile shortcuts"><button type="button" onClick={() => goTo('bookings')}>◷ <span>My bookings</span> ↗</button><button type="button" onClick={() => goTo('people')}>♧ <span>Find folks</span> ↗</button><button type="button" onClick={() => goTo('provider')}>✦ <span>Provider studio</span> ↗</button></nav><details className="cg-profile-settings"><summary>⚙ Account settings</summary><div className="cg-profile-settings-content"><button type="button" onClick={()=>setEditingSetup(true)}>Edit my interests ↗</button><button type="button" onClick={()=>goTo("people")}>Location & people ↗</button><button type="button" onClick={()=>goTo("messages")}>Messages & privacy ↗</button><small>Notification alerts and unread badges appear in the bell at the top.</small></div></details><div className="mode-box"><span>Current mode</span><strong>{me?.profile.active_mode === 'providing' ? 'Providing' : 'Buying'}</strong><button onClick={() => void switchMode()} disabled={!me}>Switch to {me?.profile.active_mode === 'providing' ? 'Buying' : 'Providing'} ↗</button><small>Provider publishing requires admin verification.</small><button className="studio-shortcut" type="button" onClick={() => goTo('provider')}>↗ Open provider studio</button></div><button className="signout-button" onClick={() => firebaseAuth && void signOut(firebaseAuth)}>Sign out ↗</button></div><form className="profile-form" onSubmit={saveProfile}><div className="form-heading"><div><span className="eyebrow">PERSONAL DETAILS</span><h2>Edit your profile</h2></div><span className="tiny-lock">Private to your account</span></div><label>Display name<input required minLength={2} maxLength={60} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label><div className="field-row"><label>Campus / School<input maxLength={100} placeholder="e.g. Niger Delta University" value={form.campus} onChange={(event) => setForm({ ...form, campus: event.target.value })} /></label><label>City<input maxLength={100} placeholder="e.g. Yenagoa" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label></div><label>About you<textarea maxLength={480} rows={4} placeholder="A short introduction..." value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label><button className="button button-dark save-button" type="submit" disabled={saving || !me}>{saving ? 'Saving…' : 'Save changes'} <span>↗</span></button></form></div>}</section>}
        {view === 'profile' && user && me && !!me.profile.onboarding_completed && <section className="section-wrap profile-personalization"><div><span className="eyebrow">PERSONALISED FOR YOU</span><h2>Your interests.</h2><p>{me.profile.student_status==='student'?`Student · ${me.profile.campus||'School not added'}`:'CampusGigs community'} · {me.profile.user_kind==='both'?'Hiring & offering':me.profile.user_kind==='provider'?'Offering skills':'Finding services'}</p><div className="profile-interests-list">{(() => {try{return (JSON.parse(me.profile.interests_json) as string[]).map(item=><span key={item}>{item}</span>);}catch{return [];}})()}</div></div><button type="button" className="button button-ghost" onClick={()=>setEditingSetup(true)}>Edit interests <span>↗</span></button></section>}
        {view==='profile' && user && me && !!me.profile.onboarding_completed && <LocationSettingsPanel user={user} profile={me.profile} providerVerified={providerVerified} onSaved={()=>refreshProfile(user)} notice={setNotice}/>}
        {view==='profile' && user && me && !!me.profile.onboarding_completed && <FollowingPanel user={user} onOpen={openPerson} onBrowse={()=>goTo('people')}/>}
      </main>

      <footer className="site-footer"><div className="section-wrap footer-content"><span className="footer-brand">Campus<span>Gigs.</span></span><p>Built for talent. Made for Nigeria.</p><div><a href="https://campsell.pages.dev" target="_blank" rel="noopener noreferrer">CampSell ↗</a><span>© {new Date().getFullYear()} CampusGigs</span></div></div></footer>
      <nav className="mobile-nav" aria-label="CampusGigs bottom navigation"><button className={view === 'explore' ? 'active' : ''} aria-current={view === 'explore' ? 'page' : undefined} onClick={() => goTo('explore')}><Icon>⌂</Icon><small>Explore</small></button><button className={view === 'categories' || view === 'detail' ? 'active' : ''} aria-current={view === 'categories' || view === 'detail' ? 'page' : undefined} onClick={() => goTo('categories')}><Icon>⌕</Icon><small>Gigs</small></button><button className={view === 'bookings' ? 'active' : ''} aria-current={view === 'bookings' ? 'page' : undefined} onClick={() => goTo('bookings')}><Icon>◷</Icon><small>Bookings</small></button><button className={view === 'people' || view === 'person' ? 'active' : ''} aria-current={view === 'people' || view === 'person' ? 'page' : undefined} onClick={() => goTo('people')}><Icon>♧</Icon><small>Folks</small></button><button className={view === 'messages' ? 'active' : ''} aria-current={view === 'messages' ? 'page' : undefined} onClick={() => goTo('messages')}><Icon>✉</Icon><small>Chats</small></button><button className={view === 'provider' ? 'active' : ''} aria-current={view === 'provider' ? 'page' : undefined} onClick={() => goTo('provider')}><Icon>✦</Icon><small>Provide</small></button><button className={view === 'profile' ? 'active' : ''} aria-current={view === 'profile' ? 'page' : undefined} onClick={() => goTo('profile')}><Icon>◉</Icon><small>Profile</small></button></nav>

      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      {authOpen && <div className="modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}><div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close">×</button><div className="modal-logo">CG</div><span className="eyebrow">HELLO, CAMPUSGIGS!</span><h2 id="auth-title">{registering ? 'Join CampusGigs.' : 'Welcome back.'}</h2><p>{registering?'Start with your email, then complete your profile.':'Your skills. Your community. Your account.'}</p>
        {!firebaseReady && <div className="auth-warning">Firebase configuration is required before sign-in can work.</div>}
        <button className="google-btn" type="button" onClick={() => void googleLogin()} disabled={loading || !firebaseReady}><span>G</span> Continue with Google</button><div className="auth-divider"><span>OR USE EMAIL</span></div>
        <form onSubmit={emailLogin}><label>Email address<input type="email" required autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label>Password<div className="auth-password-field"><input type={showPassword?'text':'password'} required minLength={registering?8:6} autoComplete={registering ? 'new-password' : 'current-password'} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder={registering?'8+ characters':'Your password'} /><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?'Hide':'Show'}</button></div></label>
          {authError && <p className="auth-inline-error" role="alert">{authError}</p>}
          <button className="button button-dark auth-submit" type="submit" disabled={loading || !firebaseReady}>{loading ? 'Please wait…' : registering ? 'Create account' : 'Sign in'} <span>→</span></button>
        </form>{!registering&&<button type="button" className="auth-forgot" disabled={loading} onClick={()=>void resetPassword()}>Forgot your password?</button>}
        <p className="auth-switch">{registering ? 'Already have an account?' : 'New around here?'} <button type="button" onClick={() => {setRegistering(!registering);setAuthError('');}}>{registering ? 'Sign in' : 'Create account'}</button></p>
      </div></div>}

      {user && !user.emailVerified && <div key={verificationTick} className="email-verify-gate" role="dialog" aria-modal="true" aria-labelledby="verify-title"><div className="email-verify-card"><span className="verify-art">✉</span><span className="eyebrow">ONE QUICK CHECK</span><h2 id="verify-title">Verify your <em>email.</em></h2><p>We sent a secure verification link to <strong>{user.email}</strong>. Open it, then return here.</p><button className="button button-dark" disabled={verificationBusy} onClick={()=>void verifyEmailNow()}>{verificationBusy?'Checking…':"I've verified my email"} <span>✓</span></button><button className="verify-resend" disabled={verificationBusy} onClick={()=>void resendVerification()}>Resend verification email</button><button className="verify-signout" onClick={()=>firebaseAuth&&void signOut(firebaseAuth)}>Use another account</button><small>This is a one-time email verification link, not a numeric OTP.</small></div></div>}

      {user?.emailVerified && me && (me.profile.onboarding_completed === 0 || editingSetup) && <WelcomeSetup user={user} profile={me.profile} notice={setNotice} onDone={async()=>{await refreshProfile(user);goTo(me.profile.onboarding_completed?'profile':'explore');}} onSignOut={()=>firebaseAuth&&void signOut(firebaseAuth)}/>}
      {!profileReady && firebaseReady && <div className="session-loading" role="status"><span className="session-mark">CG</span><strong>Preparing your space…</strong></div>}
    </div>
  );
}

function CategoryCard({ category, onClick }: { category: typeof categories[number]; onClick: () => void }) {
  return <button className={`category-card ${category.tone}`} type="button" onClick={onClick}><span className="category-icon">{category.icon}</span><span className="category-label"><strong>{category.name}</strong><small>{category.tag}</small></span><span className="category-arrow">↗</span></button>;
}

export default App;
