import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { apiRequest, type Profile } from './api';
import { InstitutionPicker } from './InstitutionPicker';
import { AcademicPicker } from './AcademicPicker';

export function LocationSettingsPanel({user,profile,providerVerified,onSaved,notice}:{user:User;profile:Profile;providerVerified:boolean;onSaved:()=>Promise<void>;notice:(text:string)=>void}){
  const [state,setState]=useState(profile.state_name||'');
  const [id,setId]=useState(profile.institution_id||'');
  const [school,setSchool]=useState(profile.campus||'');
  const [faculty,setFaculty]=useState(profile.faculty||'');
  const [department,setDepartment]=useState(profile.department||'');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{setState(profile.state_name||'');setId(profile.institution_id||'');setSchool(profile.campus||'');setFaculty(profile.faculty||'');setDepartment(profile.department||'');},[profile.state_name,profile.institution_id,profile.campus,profile.faculty,profile.department]);
  async function saveLocation(event:FormEvent){
    event.preventDefault();if(!state)return;
    setBusy(true);
    try{
      await apiRequest(user,'/v1/me/location',{method:'PATCH',body:JSON.stringify({state,institutionId:id,faculty:id?faculty:'',department:id?department:''})});
      await onSaved();notice('Campus location saved. Local discovery is now available.');
    }catch(err){notice((err as Error).message);}finally{setBusy(false);}
  }
  async function togglePresence(){
    setBusy(true);
    try{
      await apiRequest(user,'/v1/me/presence',{method:'POST',body:JSON.stringify({visible:!profile.show_online})});
      await onSaved();notice(profile.show_online?'Online indicator hidden.':'Online indicator enabled while this app is open.');
    }catch(err){notice((err as Error).message);}finally{setBusy(false);}
  }
  const inDirectory=profile.directory_preference==='public'||(profile.directory_preference==='default'&&providerVerified);
  async function toggleDirectory(){
    setBusy(true);
    try{
      await apiRequest(user,'/v1/me/directory',{method:'PATCH',body:JSON.stringify({visible:!inDirectory})});
      await onSaved();notice(inDirectory?'Your profile is hidden from Find Folks.':'Your profile can now be found in Find Folks.');
    }catch(err){notice((err as Error).message);}finally{setBusy(false);}
  }
  return <section className="section-wrap location-settings"><div className="section-heading"><div><span className="eyebrow">YOUR CAMPUS. YOUR CHOICE.</span><h2>Campus & <i>privacy.</i></h2></div></div>
    <div className="location-settings-grid"><form className="location-settings-card" onSubmit={event=>void saveLocation(event)}><strong>◎ Your home area</strong><p>Search any recognised Nigerian school. We'll set its state automatically.</p><InstitutionPicker idPrefix="profile" schoolFirst state={state} institutionId={id} institutionName={school} onChange={(value,schoolId,name,reason)=>{setState(value);setId(schoolId);setSchool(name);if(reason!=='typing'){setFaculty('');setDepartment('');}}}/>{id&&<AcademicPicker prefix="profile" faculty={faculty} department={department} onChange={(nextFaculty,nextDepartment)=>{setFaculty(nextFaculty);setDepartment(nextDepartment);}}/>}<button className="button button-dark" type="submit" disabled={busy||!state||(Boolean(faculty)!==Boolean(department))}>{busy?'Saving…':'Save campus location'} ↗</button></form>
      <div className="location-settings-card"><strong>✦ Find Folks privacy</strong><p>Choose whether people can find your profile. Only your public name, image, bio and campus area are shown.</p><span className={inDirectory?'directory-visible':'directory-private'}>{inDirectory?'● Discoverable':'◌ Private'}</span><button className="button button-ghost" disabled={busy} type="button" onClick={()=>void toggleDirectory()}>{inDirectory?'Hide from Find Folks':'Show my profile'}</button><small>Ordinary members are private by default. Your email and account ID are never displayed.</small><div className="location-card-divider"/><strong>● Online visibility</strong><p>Show a green dot only while you're active on CampusGigs.</p><span className={profile.show_online?'status-online':'status-offline'}><i/>{profile.show_online?'Visible when active':'Hidden'}</span><button className="button button-ghost" disabled={busy} type="button" onClick={()=>void togglePresence()}>{profile.show_online?'Hide my status':'Show my online status'}</button><small>Online visibility is disabled by default. Exact coordinates stay private.</small></div></div>
  </section>;
}
