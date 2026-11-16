import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { getRedirectResult, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { adminGet, type Member, type Members, type Overview } from './api';
import { auth, firebaseReady, googleProvider } from './firebase';

type View = 'overview' | 'members' | 'providers' | 'gigs' | 'bookings' | 'disputes' | 'finance' | 'settings';
type Gate = 'checking' | 'signedout' | 'verifying' | 'admin' | 'denied' | 'error';

const navigation: { id: View; name: string; symbol: string; group: 'main' | 'manage' | 'system'; phase?: string }[] = [
  { id: 'overview', name: 'Overview', symbol: '▦', group: 'main' },
  { id: 'members', name: 'Members', symbol: '◉', group: 'main' },
  { id: 'providers', name: 'Providers', symbol: '✺', group: 'manage', phase: 'Phase B' },
  { id: 'gigs', name: 'Gig listings', symbol: '▣', group: 'manage', phase: 'Phase B' },
  { id: 'bookings', name: 'Bookings', symbol: '◷', group: 'manage', phase: 'Phase D' },
  { id: 'disputes', name: 'Disputes', symbol: '◇', group: 'manage', phase: 'Phase F' },
  { id: 'finance', name: 'Finance & payouts', symbol: '₦', group: 'manage', phase: 'Phase E' },
  { id: 'settings', name: 'Workspace info', symbol: '⚙', group: 'system' },
];

const timeFormat = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? '—' : parsed.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
};

function MemberRows({ members, emptyText }: { members: Member[]; emptyText: string }) {
  if (!members.length) return <div className="empty-list">{emptyText}</div>;
  return <div className="member-table-wrap"><table className="member-table">
    <thead><tr><th>Member</th><th>Location</th><th>Mode</th><th>Status</th><th>Joined</th></tr></thead>
    <tbody>{members.map(member => <tr key={member.firebase_uid}>
      <td><div className="identity-cell"><span className="person-avatar">{(member.display_name || '?').slice(0, 1).toUpperCase()}</span><div><strong>{member.display_name || 'Member'}</strong><small>{member.email || 'Email not verified'}</small></div></div></td>
      <td>{[member.campus, member.city].filter(Boolean).join(' · ') || 'Not set'}</td>
      <td><span className="soft-badge">{member.active_mode === 'providing' ? 'Providing preference' : 'Buying'}</span></td>
      <td><span className={`status-badge ${member.account_status === 'suspended' ? 'suspended' : ''}`}>● {member.account_status}</span></td>
      <td>{timeFormat(member.created_at)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [gate, setGate] = useState<Gate>('checking');
  const [view, setView] = useState<View>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadOverview = useCallback(async (current: User) => {
    setGate('verifying');
    try {
      const payload = await adminGet<Overview>(current, '/v1/admin/overview');
      setOverview(payload);
      setGate('admin');
      setNotice('');
    } catch (error) {
      const apiError = error as Error & { status?: number };
      setGate(apiError.status === 403 ? 'denied' : 'error');
      setNotice(apiError.message);
    }
  }, []);

  useEffect(() => {
    if (!auth) { setGate('error'); setNotice('Firebase is not configured for this hosting environment.'); return; }
    const unsubscribe = onAuthStateChanged(auth, current => {
      setUser(current);
      if (!current) { setGate('signedout'); setOverview(null); setMembers([]); }
      else void loadOverview(current);
    });
    void getRedirectResult(auth).catch(() => setNotice('Google sign-in could not be completed. Please try again.'));
    return unsubscribe;
  }, [loadOverview]);

  const loadMembers = useCallback(async (offset = 0, append = false) => {
    if (!user) return;
    setMembersLoading(true);
    try {
      const result = await adminGet<Members>(user, `/v1/admin/members?search=${encodeURIComponent(submittedSearch)}&offset=${offset}`);
      setMembers(previous => append ? [...previous, ...result.members] : result.members);
      setNextOffset(result.nextOffset);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to load members.');
    } finally { setMembersLoading(false); }
  }, [user, submittedSearch]);

  useEffect(() => {
    if (view === 'members' && gate === 'admin') void loadMembers();
  }, [view, gate, loadMembers]);

  function selectView(next: View) { setView(next); setNavOpen(false); window.scrollTo(0, 0); }

  async function googleLogin() {
    if (!auth) return;
    setBusy(true);
    setNotice('');
    try { await signInWithPopup(auth, googleProvider); }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try { await signInWithRedirect(auth, googleProvider); }
        catch { setNotice('Google sign-in could not open. Please try email and password.'); }
      } else if (code !== 'auth/popup-closed-by-user') setNotice('Sign-in failed. Check Firebase authorized domains.');
    } finally { setBusy(false); }
  }

  async function emailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setBusy(true);
    setNotice('');
    try { await signInWithEmailAndPassword(auth, email.trim(), password); setPassword(''); }
    catch { setNotice('Invalid sign-in details or account. Please try again.'); }
    finally { setBusy(false); }
  }

  async function logout() {
    if (auth) await signOut(auth);
    setNotice('');
  }

  if (gate !== 'admin') return <div className="auth-screen">
    <div className="auth-panel">
      <a className="auth-logo" href="https://campusgigs-97y.pages.dev/" aria-label="CampusGigs marketplace"><span className="monogram">CG</span><span>Campus<span>Gigs</span><small>ADMIN WORKSPACE</small></span></a>
      {gate === 'checking' || gate === 'verifying' ? <div className="auth-stage"><div className="spinner"/><h1>Securing your workspace</h1><p>Checking Firebase identity and CampusGigs admin permissions.</p></div> :
        gate === 'signedout' ? <>
          <span className="eyebrow">PRIVATE MANAGEMENT PORTAL</span><h1>Welcome back,<br/><em>Administrator.</em></h1>
          <p className="intro">Sign in with your existing CampusGigs Firebase account. Only approved administrators can continue.</p>
          <button className="btn btn-dark wide" onClick={() => void googleLogin()} disabled={busy || !firebaseReady}><span className="google-mark">G</span> Continue with Google <span>↗</span></button>
          <div className="or"><span>or use your email</span></div>
          <form className="auth-form" onSubmit={event => void emailLogin(event)}>
            <label>Email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" /></label>
            <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••" /></label>
            <button className="btn btn-gold wide" disabled={busy || !firebaseReady} type="submit">{busy ? 'Signing in…' : 'Sign in securely'} <span>→</span></button>
          </form>
        </> : <div className="auth-stage">
          <span className="gate-icon">{gate === 'denied' ? '⊘' : '!'}</span>
          <h1>{gate === 'denied' ? 'Access restricted.' : 'Workspace unavailable.'}</h1>
          <p>{gate === 'denied' ? 'You are signed in, but this Firebase account does not have an active CampusGigs admin grant.' : (notice || 'Could not verify your admin permissions.')}</p>
          <div className="auth-buttons"><button className="btn btn-dark" onClick={() => void logout()}>Use another account</button>{gate === 'error' && user && <button className="btn btn-light" onClick={() => void loadOverview(user)}>Try again</button>}</div>
        </div>}
      {notice && gate === 'signedout' && <p className="form-error" role="alert">{notice}</p>}
      <div className="auth-footer">CampusGigs independent admin hosting <span>·</span> <a href="https://campusgigs-97y.pages.dev/">Open marketplace ↗</a></div>
    </div>
    <div className="auth-visual"><span className="auth-visual-label">CAMPUSGIGS OPERATIONS</span><div className="auth-visual-art"><span>✦</span><h2>Every great<br/>marketplace starts<br/><em>with trust.</em></h2><p>Manage people, services and protection from one place.</p></div><span className="auth-visual-bottom">SECURE BY DESIGN · MADE FOR NIGERIA</span></div>
  </div>;

  const title = navigation.find(item => item.id === view)?.name || 'Overview';
  return <div className="app-layout">
    {navOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
    <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
      <div className="sidebar-header"><div className="logo-box">CG</div><div className="logo-name">Campus<span>Gigs</span><small>ADMIN CONTROL</small></div><button className="nav-close" aria-label="Close menu" onClick={() => setNavOpen(false)}>×</button></div>
      <div className="workspace-badge"><span className="live-pulse"/> LIVE WORKSPACE <span className="pill-note">PHASE A</span></div>
      <nav aria-label="Admin sections">
        {(['main', 'manage', 'system'] as const).map(group => <div className="nav-group" key={group}>
          <span className="nav-group-label">{group === 'main' ? 'GENERAL' : group === 'manage' ? 'MARKETPLACE' : 'PREFERENCES'}</span>
          {navigation.filter(item => item.group === group).map(item => <button key={item.id} className={`nav-link ${view === item.id ? 'active' : ''}`} onClick={() => selectView(item.id)}><span className="nav-icon">{item.symbol}</span><span>{item.name}</span>{item.phase && <span className="lock-mark">◦</span>}</button>)}
        </div>)}
      </nav>
      <div className="sidebar-footer"><a href="https://campusgigs-97y.pages.dev/" target="_blank" rel="noreferrer">↗ &nbsp; Open CampusGigs</a><div className="sidebar-person"><span className="person-avatar inverse">{(user?.displayName || user?.email || 'A').slice(0, 1).toUpperCase()}</span><div><b>{user?.displayName || 'Administrator'}</b><small>Verified admin</small></div><button onClick={() => void logout()} title="Sign out" aria-label="Sign out">⇥</button></div></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="topbar-left"><button className="hamburger" onClick={() => setNavOpen(true)} aria-label="Open menu">☰</button><span className="breadcrumb">Workspace <span>/</span> <strong>{title}</strong></span></div><div className="topbar-right"><span className="secure-chip">✦ Admin secured</span><span className="header-avatar">{(user?.displayName || 'A').slice(0, 1).toUpperCase()}</span></div></header>
      <main className="content">
        {view === 'overview' && <>
          <div className="page-heading"><div><span className="eyebrow">MONDAY TO SUNDAY · ALWAYS ON</span><h1>Good day, <em>Admin.</em></h1><p>Here's what's happening across your CampusGigs workspace.</p></div><button className="btn btn-light" onClick={() => user && void loadOverview(user)}>↻ &nbsp; Refresh</button></div>
          <section className="welcome-banner"><div><span className="banner-eyebrow">YOUR PLATFORM. YOUR PEOPLE.</span><h2>Build something<br/><i>that works.</i></h2><p>CampusGigs administration is connected to a separate, protected database. Provider verification opens in Phase B.</p><button onClick={() => selectView('members')}>Explore members <span>↗</span></button></div><div className="banner-graphic"><span>CG</span><b>✳</b></div></section>
          <div className="stats-grid">
            <article className="stat-card"><span className="stat-icon">◉</span><span className="stat-label">Registered members</span><strong>{overview?.totals.members ?? '—'}</strong><span className="stat-foot">CampusGigs accounts</span></article>
            <article className="stat-card"><span className="stat-icon">✦</span><span className="stat-label">Joined this week</span><strong>{overview?.totals.new_week ?? '—'}</strong><span className="stat-foot">Last seven days</span></article>
            <article className="stat-card"><span className="stat-icon">↗</span><span className="stat-label">Providing preference</span><strong>{overview?.totals.providing ?? '—'}</strong><span className="stat-foot">Not approved providers</span></article>
            <article className="stat-card"><span className="stat-icon">⊘</span><span className="stat-label">Suspended accounts</span><strong>{overview?.totals.suspended ?? '—'}</strong><span className="stat-foot">Platform safeguards</span></article>
          </div>
          <section className="panel recent-panel"><div className="panel-title"><div><span className="eyebrow">COMMUNITY</span><h2>Recent members</h2></div><button className="text-action" onClick={() => selectView('members')}>See all members →</button></div><MemberRows members={overview?.recent || []} emptyText="No CampusGigs members have signed in yet."/></section>
          <div className="info-grid"><article className="info-card"><div className="info-card-head"><span>◈</span><span className="small-tag">READY</span></div><h3>Verified access</h3><p>Only Firebase accounts with a verified, active administrator grant in CampusGigs D1 can enter this workspace.</p></article><article className="info-card"><div className="info-card-head"><span>▦</span><span className="small-tag gold">NEXT</span></div><h3>Provider reviews</h3><p>Applications, ID checks and gig moderation will appear here in Phase B—after your approval.</p></article></div>
        </>}
        {view === 'members' && <><div className="page-heading"><div><span className="eyebrow">ACCOUNT DIRECTORY</span><h1>All <em>members.</em></h1><p>Read-only view of accounts in the separate CampusGigs database.</p></div><span className="page-count">{overview?.totals.members ?? 0} total</span></div>
          <section className="panel"><div className="search-row"><form onSubmit={event => {event.preventDefault();setSubmittedSearch(searchDraft.trim()); if (submittedSearch === searchDraft.trim()) void loadMembers();}}><span>⌕</span><input maxLength={80} placeholder="Find name, email, ID, campus or city" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} aria-label="Search members"/><button type="submit">Search</button></form><button className="btn btn-light compact" onClick={() => void loadMembers()}>↻</button></div><MemberRows members={members} emptyText={membersLoading ? 'Loading members…' : 'No matching CampusGigs members.'}/>{nextOffset !== null && <button className="load-more" disabled={membersLoading} onClick={() => void loadMembers(nextOffset, true)}>{membersLoading ? 'Loading…' : 'Load more members ↓'}</button>}</section>
        </>}
        {view === 'settings' && <><div className="page-heading"><div><span className="eyebrow">PLATFORM INFORMATION</span><h1>Workspace <em>info.</em></h1><p>Current configuration and account separation.</p></div></div><div className="info-grid settings-grid"><article className="info-card"><h3>Administrator</h3><p>{user?.email}</p><span className="small-tag">D1 role verified</span></article><article className="info-card"><h3>Data source</h3><p>CampusGigs D1 & R2 only</p><span className="small-tag">Separate from CampSell</span></article><article className="info-card"><h3>Authentication</h3><p>Shared CampSell Firebase identity project</p><span className="small-tag">Server-side JWT checked</span></article><article className="info-card"><h3>Payments</h3><p>Not yet activated</p><span className="small-tag gold">Later phase</span></article></div></>}
        {view !== 'overview' && view !== 'members' && view !== 'settings' && <><div className="page-heading"><div><span className="eyebrow">CAMPUSGIGS OPERATIONS</span><h1>{title}<em>.</em></h1><p>This section will become available when its workflow is implemented and verified.</p></div></div><section className="coming-panel"><span className="coming-symbol">✳</span><span className="eyebrow">{navigation.find(item => item.id === view)?.phase || 'UPCOMING'}</span><h2>Built with care.<br/><em>Coming next.</em></h2><p>We have not enabled these controls yet. Nothing here can approve users, move funds or change order records until the corresponding secure phase is complete.</p><button className="btn btn-dark" onClick={() => selectView('overview')}>Back to overview →</button></section></>}
        {notice && <div className="toast" role="alert">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
        <footer className="page-footer">© {new Date().getFullYear()} CampusGigs Admin <span>·</span> Independent platform operations <span>·</span> <a href="https://campusgigs-97y.pages.dev/">Marketplace ↗</a></footer>
      </main>
    </div>
  </div>;
}

export default App;
