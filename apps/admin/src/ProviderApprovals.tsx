import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { adminEvidenceUrl, adminGet, adminRequest, type ProviderApplication } from './api';

type StatusFilter = 'pending' | 'all' | 'approved' | 'rejected' | 'changes_requested';
const statuses: { key: StatusFilter; label: string }[] = [
  { key:'pending',label:'Pending' },{ key:'all',label:'All' },{ key:'approved',label:'Approved' },
  { key:'changes_requested',label:'Needs changes' },{ key:'rejected',label:'Rejected' },
];
const when = (value: string) => new Date(value).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'});

export function ProviderApprovals({ user, notice, onChanged }: { user: User; notice: (message: string) => void; onChanged: () => void }) {
  const [applications, setApplications] = useState<ProviderApplication[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [selected, setSelected] = useState<ProviderApplication | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try { const response = await adminGet<{ applications: ProviderApplication[] }>(user,`/v1/admin/providers?status=${filter}`); setApplications(response.applications); }
    catch (error) { notice((error as Error).message); }
    finally { setLoading(false); }
  },[user,filter,notice]);

  useEffect(() => { void refresh(); },[refresh]);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setEvidenceUrl(null);
    if (selected) {
      void adminEvidenceUrl(user, selected.id).then(url => {
        if (active) { objectUrl = url; setEvidenceUrl(url); } else URL.revokeObjectURL(url);
      }).catch(error => { if (active) notice((error as Error).message); });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  },[selected, user, notice]);

  const visible = applications.filter(item => `${item.display_name} ${item.email} ${item.firebase_uid} ${item.location_name}`.toLowerCase().includes(search.toLowerCase()));

  async function decide(decision: 'approved' | 'changes_requested' | 'rejected') {
    if (!selected) return;
    if (decision !== 'approved' && reviewNote.trim().length < 6) { notice('Add a clear review reason first.'); return; }
    if (!window.confirm(decision === 'approved' ? `Verify ${selected.display_name} as a CampusGigs provider?` : `Send “${decision.replace('_',' ')}” to ${selected.display_name}?`)) return;
    setBusy(true);
    try {
      await adminRequest(user, `/v1/admin/providers/${selected.id}/review`, { method:'POST', body:JSON.stringify({ decision, note:reviewNote }) });
      setSelected(null); setReviewNote('');
      await refresh(); onChanged(); notice(decision === 'approved' ? 'Provider verified and gold badge granted.' : 'Review decision saved.');
    } catch (error) { notice((error as Error).message); }
    finally { setBusy(false); }
  }

  return <><div className="page-heading"><div><span className="eyebrow">IDENTITY & TRUST</span><h1>Provider <em>approvals.</em></h1><p>Review each applicant and their private ID before verifying.</p></div><button className="btn btn-light" onClick={() => void refresh()}>↻ Refresh</button></div>
    <div className="approval-intro"><div><span className="eyebrow">MANUAL VERIFICATION</span><h2>Every badge <em>means something.</em></h2><p>Only approved providers can publish gigs.</p></div><span className="approval-art" aria-hidden="true">✦<small>✓</small></span></div>
    <div className="filter-bar">{statuses.map(item => <button key={item.key} type="button" className={filter===item.key?'chosen':''} onClick={() => {setFilter(item.key);setSelected(null);}}>{item.label}</button>)}</div>
    <section className="panel approval-panel"><div className="approval-tools"><label><span>⌕</span><input placeholder="Search name, email, UID or campus" value={search} onChange={event => setSearch(event.target.value)}/></label><span>{visible.length} shown</span></div>{loading ? <div className="empty-list">Loading applications…</div> : !visible.length ? <div className="empty-list">No applications in this view yet.</div> : <div className="approval-list">{visible.map(item => <button type="button" key={item.id} className={`approval-card ${selected?.id===item.id?'chosen':''}`} onClick={() => {setSelected(item);setReviewNote('');}}><span className="person-avatar">{item.display_name.slice(0,1).toUpperCase()}</span><span className="approval-identity"><strong>{item.display_name}</strong><small>{item.email}</small><span>{item.location_name} · {item.categories.slice(0,2).join(', ')}</span></span><span className={`review-pill ${item.status}`}>{item.status.replace('_',' ')}</span><span className="approval-arrow">›</span></button>)}</div>}</section>
    {selected && <div className="review-layer" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="review-sheet" role="dialog" aria-modal="true" aria-labelledby="review-title"><header><div><span className="eyebrow">PROVIDER REVIEW</span><h2 id="review-title">{selected.display_name}</h2><p>{selected.email}</p></div><button type="button" aria-label="Close review" onClick={() => setSelected(null)}>×</button></header><div className="review-body"><div className="review-data"><span className="review-pill">{selected.status.replace('_',' ')}</span><p><b>Location</b>{selected.location_kind} · {selected.location_name}</p><p><b>Skill categories</b>{selected.categories.join(' · ')}</p><p><b>Application</b>{when(selected.submitted_at)} · Revision {selected.revision}</p><p><b>Provider bio</b>{selected.bio}</p></div><div className="private-evidence"><div><strong>Private ID evidence</strong><small>{selected.evidence_type==='student_id'?'Student ID':'Government ID'} · admin-only</small></div>{evidenceUrl ? <img src={evidenceUrl} alt="Uploaded provider identification document"/> : <div className="evidence-loading">Loading private evidence…</div>}<span>🔒 Do not share or download this ID.</span></div>{selected.status==='pending' ? <div className="review-controls"><label>Review note<textarea placeholder="Reason for rejection or requested changes…" maxLength={500} rows={3} value={reviewNote} onChange={event=>setReviewNote(event.target.value)}/></label><div><button className="btn btn-gold" disabled={busy||!evidenceUrl} onClick={() => void decide('approved')}>✓ Approve provider</button><button className="btn btn-light" disabled={busy} onClick={() => void decide('changes_requested')}>Request changes</button><button className="btn btn-danger" disabled={busy} onClick={() => void decide('rejected')}>Reject</button></div></div> : <p className="review-completed">Decision recorded: {selected.review_note || selected.status}</p>}</div></section></div>}
  </>;
}
