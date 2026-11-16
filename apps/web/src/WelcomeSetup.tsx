import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { apiRequest, type Profile } from './api';

const interests=[
  ['✎','Design & Creative'],['⌘','Tech & Digital'],['◈','Media & Editing'],
  ['☼','Personal Services'],['✦','Tutoring & Skills'],['▧','Typing & Proofreading'],
  ['✳','Events & Lifestyle'],['↗','Business Support'],
] as const;
type UserKind='buyer'|'provider'|'both';
type StudentStatus='student'|'non_student';

function initialInterests(value:string|undefined):string[]{
  try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed.filter(item=>typeof item==='string'&&interests.some(option=>option[1]===item)).slice(0,5):[];}
  catch{return [];}
}

export function WelcomeSetup({user,profile,onDone,onSignOut,notice}:{
  user:User;profile?:Profile;onDone:()=>Promise<void>;onSignOut:()=>void;notice:(message:string)=>void;
}){
  const [step,setStep]=useState(0);
  const [kind,setKind]=useState<UserKind>(profile?.user_kind||'buyer');
  const [chosen,setChosen]=useState<string[]>(()=>initialInterests(profile?.interests_json));
  const [age,setAge]=useState(profile?.age_range||'');
  const [student,setStudent]=useState<StudentStatus>(profile?.student_status==='non_student'?'non_student':'student');
  const [school,setSchool]=useState(profile?.campus||'');
  const [city,setCity]=useState(profile?.city||'');
  const [name,setName]=useState(profile?.display_name||user.displayName||'');
  const [busy,setBusy]=useState(false);
  const choices:[UserKind,string,string,string][]=[
    ['buyer','Find a service','Hire trusted people','⌕'],
    ['provider','Offer my skills','Turn talent into work','✦'],
    ['both','A bit of both','Discover and offer gigs','↗'],
  ];
  function toggle(option:string){setChosen(current=>current.includes(option)?current.filter(item=>item!==option):current.length<5?[...current,option]:current);}
  async function finish(event:FormEvent){
    event.preventDefault();
    if(!age||!name.trim()||!city.trim()||(student==='student'&&!school.trim()))return;
    setBusy(true);
    try{
      await apiRequest(user,'/v1/me/onboarding',{method:'PATCH',body:JSON.stringify({userKind:kind,ageRange:age,studentStatus:student,school:student==='student'?school:'',city,displayName:name,interests:chosen})});
      await onDone();
      notice('Your CampusGigs space is ready. Welcome!');
    }catch(error){notice(error instanceof Error?error.message:'Could not finish setup. Try again.');}
    finally{setBusy(false);}
  }
  return <div className="first-run" role="dialog" aria-modal="true" aria-labelledby="setup-heading">
    <div className="first-run-card">
      <header className="first-run-header"><span className="first-run-brand">CG <b>CampusGigs</b></span><span className="setup-progress-label">STEP {step+1} OF 3</span></header>
      <div className="setup-progress" aria-label={`Step ${step+1} of 3`}>{[0,1,2].map(index=><span key={index} className={index<=step?'ready':''}/>)}</div>
      {step===0&&<><span className="eyebrow">LET'S GET TO KNOW YOU</span><h1 id="setup-heading">What brings <em>you</em> here?</h1><p className="first-run-lead">Make CampusGigs feel like yours.</p><div className="kind-grid">{choices.map(([value,title,caption,icon])=><button key={value} type="button" className={`kind-choice ${kind===value?'selected':''}`} onClick={()=>setKind(value)}><span className="kind-icon">{icon}</span><span><strong>{title}</strong><small>{caption}</small></span><span className="choice-check">{kind===value?'✓':'○'}</span></button>)}</div><button className="button button-dark setup-next" onClick={()=>setStep(1)}>Continue <span>→</span></button></>}
      {step===1&&<><span className="eyebrow">PERSONALISE YOUR FEED</span><h1 id="setup-heading">What are you <em>into?</em></h1><p className="first-run-lead">Pick 1–5 interests. You can explore anything later.</p><div className="interests-grid">{interests.map(([icon,label])=><button key={label} type="button" aria-pressed={chosen.includes(label)} className={`interest-choice ${chosen.includes(label)?'selected':''}`} onClick={()=>toggle(label)}><span>{icon}</span><strong>{label}</strong><small>{chosen.includes(label)?'✓':'+'}</small></button>)}</div><div className="setup-actions"><button type="button" className="setup-back" onClick={()=>setStep(0)}>← Back</button><button className="button button-dark" disabled={!chosen.length} onClick={()=>setStep(2)}>Continue <span>→</span></button></div></>}
      {step===2&&<><span className="eyebrow">ONE LAST THING</span><h1 id="setup-heading">Make it <em>official.</em></h1><p className="first-run-lead">Just a few details to complete your space.</p><form className="setup-form" onSubmit={event=>void finish(event)}><label>Your name<input type="text" autoComplete="name" maxLength={60} minLength={2} required placeholder="What should we call you?" value={name} onChange={e=>setName(e.target.value)} /></label><label>Age group<select required value={age} onChange={e=>setAge(e.target.value)}><option value="">Select age group</option><option value="under_18">Under 18</option><option value="18_24">18–24</option><option value="25_34">25–34</option><option value="35_44">35–44</option><option value="45_plus">45+</option></select></label><div className="setup-student"><span>Are you currently a student?</span><div><button type="button" className={student==='student'?'selected':''} onClick={()=>setStudent('student')}>Yes, student</button><button type="button" className={student==='non_student'?'selected':''} onClick={()=>setStudent('non_student')}>Not a student</button></div></div>{student==='student'&&<label>School / University<input type="text" maxLength={100} minLength={2} required placeholder="e.g. Niger Delta University" value={school} onChange={e=>setSchool(e.target.value)} /></label>}<label>Your city<input type="text" maxLength={100} minLength={2} required placeholder="e.g. Yenagoa" value={city} onChange={e=>setCity(e.target.value)} /></label><div className="setup-actions"><button type="button" className="setup-back" onClick={()=>setStep(1)} disabled={busy}>← Back</button><button type="submit" className="button button-dark" disabled={busy}>{busy?'Saving…':'Enter CampusGigs'} <span>✓</span></button></div></form></>}
      <footer className="first-run-foot"><span>✦ Skills meet opportunity.</span><button type="button" onClick={onSignOut}>Not your account? Sign out</button></footer>
    </div><div className="first-run-visual" aria-hidden="true"><span>✹</span><h2>Find your people.<br/><em>Grow your possibilities.</em></h2><p>Campus life and beyond. Your next opportunity starts here.</p><div className="setup-orb"/></div>
  </div>;
}
