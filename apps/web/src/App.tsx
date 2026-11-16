import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { apiRequest, type MeResponse } from './api';
import { firebaseAuth, firebaseReady, googleProvider } from './firebase';

type View = 'explore' | 'categories' | 'profile';

const categories = [
  { icon: '✎', name: 'Design & Creative', tag: 'Graphics, brand identity', tone: 'pink' },
  { icon: '⌘', name: 'Tech & Digital', tag: 'Websites, tech support', tone: 'lavender' },
  { icon: '◈', name: 'Media & Editing', tag: 'Photos, videos, audio', tone: 'orange' },
  { icon: '☼', name: 'Personal Services', tag: 'Beauty, styling, wellness', tone: 'mint' },
  { icon: '✦', name: 'Tutoring & Skills', tag: 'Lessons, coaching', tone: 'blue' },
  { icon: '▧', name: 'Typing & Proofreading', tag: 'Formatting, proofreading', tone: 'peach' },
  { icon: '◎', name: 'Events & Lifestyle', tag: 'Planning, photography', tone: 'yellow' },
  { icon: '↗', name: 'Business Support', tag: 'Admin, marketing', tone: 'grey' },
];

function Icon({ children }: { children: ReactNode }) {
  return <span aria-hidden="true">{children}</span>;
}

function App() {
  const [view, setView] = useState<View>('explore');
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ displayName: '', campus: '', city: '', bio: '' });

  const refreshProfile = useCallback(async (currentUser: User) => {
    try {
      const response = await apiRequest<MeResponse>(currentUser, '/v1/me');
      setMe(response);
      setForm({
        displayName: response.profile.display_name,
        campus: response.profile.campus,
        city: response.profile.city,
        bio: response.profile.bio,
      });
    } catch (error) {
      setMe(null);
      setNotice(error instanceof Error ? error.message : 'Unable to load profile');
    }
  }, []);

  useEffect(() => {
    if (!firebaseAuth) return;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        setAuthOpen(false);
        void refreshProfile(currentUser);
      } else {
        setMe(null);
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
    setView(next);
    if (next === 'profile' && !user) setAuthOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    try {
      if (registering) {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, authEmail.trim(), authPassword);
        await sendEmailVerification(credential.user);
        setNotice('Account created! Check your email to verify it.');
      } else {
        await signInWithEmailAndPassword(firebaseAuth, authEmail.trim(), authPassword);
        setNotice('Signed in successfully.');
      }
      setAuthOpen(false);
      setAuthPassword('');
    } catch {
      setNotice('Could not sign in. Check the email and password, then try again.');
    } finally { setLoading(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await apiRequest(user, '/v1/me', { method: 'PATCH', body: JSON.stringify(form) });
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
      setNotice(next === 'providing' ? 'Providing mode selected. Applications open in Phase B.' : 'Buying mode selected.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not switch mode'); }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" type="button" onClick={() => goTo('explore')} aria-label="CampusGigs home">
            <span className="brand-logo">C<span>G</span></span>
            <span className="brand-word">Campus<span>Gigs</span><small>SKILLS, MADE SIMPLE.</small></span>
          </button>
          <nav className="desktop-nav" aria-label="Main navigation">
            <button className={view === 'explore' ? 'selected' : ''} onClick={() => goTo('explore')}>Explore</button>
            <button className={view === 'categories' ? 'selected' : ''} onClick={() => goTo('categories')}>Categories</button>
            <a href="https://campsell.pages.dev" target="_blank" rel="noopener noreferrer">Explore CampSell <span>↗</span></a>
          </nav>
          <div className="header-actions">
            <span className="eyebrow hide-mobile">MADE FOR NIGERIA</span>
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
                <button className="button button-ghost" onClick={() => user ? goTo('profile') : setAuthOpen(true)}>Offer a skill <span>→</span></button>
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
            <div className="category-grid">{categories.slice(0, 6).map((category) => <CategoryCard key={category.name} category={category} onClick={() => goTo('categories')} />)}</div>
            <p className="phase-note">Services and verified providers will appear here when listings open in Phase B and browsing launches in Phase C.</p>
          </section>
          <section className="section-wrap connect-panel"><div><span className="eyebrow">TWO WORLDS. ONE COMMUNITY.</span><h2>Looking for products<br />instead of services?</h2><p>CampusGigs is for skills and services. Shop physical goods on CampSell.</p></div><a className="button button-gold" href="https://campsell.pages.dev" target="_blank" rel="noopener noreferrer">Explore CampSell <span>↗</span></a></section>
        </>}

        {view === 'categories' && <section className="section-wrap page-section"><span className="eyebrow">EXPLORE SKILLS</span><h1 className="page-title">What do you <em>need done?</em></h1><p className="page-lead">Find the right category, then discover your people.</p><div className="category-grid all-categories">{categories.map((category) => <CategoryCard key={category.name} category={category} onClick={() => setNotice('Provider listings open in Phase B and C.')} />)}</div><div className="friendly-notice">Service listings are being prepared. Payments and bookings are not active yet.</div></section>}

        {view === 'profile' && <section className="section-wrap page-section profile-page"><span className="eyebrow">YOUR CAMPUSGIGS SPACE</span><h1 className="page-title">Your space, <em>your way.</em></h1>{!user ? <div className="profile-empty"><div className="empty-icon">◉</div><h2>You're one step away.</h2><p>Sign in with the same Firebase account you use on CampSell.</p><button className="button button-dark" onClick={() => setAuthOpen(true)}>Sign in to continue <span>→</span></button></div> : <div className="profile-layout"><div className="profile-summary"><div className="profile-avatar">{user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : user.displayName?.slice(0, 1).toUpperCase() || 'C'}</div><h2>{me?.profile.display_name || user.displayName || 'CampusGigs member'}</h2><p>{user.email}</p><span className="status-badge">● {me?.role === 'admin' ? 'Administrator' : 'CampusGigs member'}</span><div className="mode-box"><span>Current mode</span><strong>{me?.profile.active_mode === 'providing' ? 'Providing' : 'Buying'}</strong><button onClick={() => void switchMode()} disabled={!me}>Switch to {me?.profile.active_mode === 'providing' ? 'Buying' : 'Providing'} ↗</button><small>Provider verification and applications open in Phase B.</small></div><button className="signout-button" onClick={() => firebaseAuth && void signOut(firebaseAuth)}>Sign out ↗</button></div><form className="profile-form" onSubmit={saveProfile}><div className="form-heading"><div><span className="eyebrow">PERSONAL DETAILS</span><h2>Edit your profile</h2></div><span className="tiny-lock">Private to your account</span></div><label>Display name<input required minLength={2} maxLength={60} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label><div className="field-row"><label>Campus / School<input maxLength={100} placeholder="e.g. Niger Delta University" value={form.campus} onChange={(event) => setForm({ ...form, campus: event.target.value })} /></label><label>City<input maxLength={100} placeholder="e.g. Yenagoa" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label></div><label>About you<textarea maxLength={480} rows={4} placeholder="A short introduction..." value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label><button className="button button-dark save-button" type="submit" disabled={saving || !me}>{saving ? 'Saving…' : 'Save changes'} <span>↗</span></button></form></div>}</section>}
      </main>

      <footer className="site-footer"><div className="section-wrap footer-content"><span className="footer-brand">Campus<span>Gigs.</span></span><p>Built for talent. Made for Nigeria.</p><div><a href="https://campsell.pages.dev" target="_blank" rel="noopener noreferrer">CampSell ↗</a><span>© {new Date().getFullYear()} CampusGigs</span></div></div></footer>
      <nav className="mobile-nav" aria-label="Mobile navigation"><button className={view === 'explore' ? 'active' : ''} aria-current={view === 'explore' ? 'page' : undefined} onClick={() => goTo('explore')}><Icon>⌂</Icon><small>Explore</small></button><button className={view === 'categories' ? 'active' : ''} aria-current={view === 'categories' ? 'page' : undefined} onClick={() => goTo('categories')}><Icon>▦</Icon><small>Categories</small></button><button className={view === 'profile' ? 'active' : ''} aria-current={view === 'profile' ? 'page' : undefined} onClick={() => goTo('profile')}><Icon>◉</Icon><small>Profile</small></button><a href="https://campsell.pages.dev" target="_blank" rel="noopener noreferrer" aria-label="Shop products on CampSell"><Icon>↗</Icon><small>CampSell</small></a></nav>

      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      {authOpen && <div className="modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}><div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close">×</button><div className="modal-logo">CG</div><span className="eyebrow">HELLO, CAMPUSGIGS!</span><h2 id="auth-title">{registering ? 'Create your account' : 'Welcome back.'}</h2><p>One account for CampSell and CampusGigs.</p>{!firebaseReady && <div className="auth-warning">Firebase configuration is still required before sign-in can work.</div>}<button className="google-btn" onClick={() => void googleLogin()} disabled={loading || !firebaseReady}><span>G</span> Continue with Google</button><div className="auth-divider"><span>OR USE EMAIL</span></div><form onSubmit={emailLogin}><label>Email address<input type="email" required autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" required minLength={6} autoComplete={registering ? 'new-password' : 'current-password'} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 6 characters" /></label><button className="button button-dark auth-submit" type="submit" disabled={loading || !firebaseReady}>{loading ? 'Please wait…' : registering ? 'Create account' : 'Sign in'} <span>→</span></button></form><p className="auth-switch">{registering ? 'Already have an account?' : 'New around here?'} <button onClick={() => setRegistering(!registering)}>{registering ? 'Sign in' : 'Create account'}</button></p></div></div>}
    </div>
  );
}

function CategoryCard({ category, onClick }: { category: typeof categories[number]; onClick: () => void }) {
  return <button className={`category-card ${category.tone}`} type="button" onClick={onClick}><span className="category-icon">{category.icon}</span><span className="category-label"><strong>{category.name}</strong><small>{category.tag}</small></span><span className="category-arrow">↗</span></button>;
}

export default App;
