import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { apiRequest, type Profile } from './api';
import { InstitutionPicker } from './InstitutionPicker';
import { AcademicPicker } from './AcademicPicker';

export function LocationSettingsPanel({user,profile,onSaved,notice}:{user:User;profile:Profile;onSaved:()=>Promise<void>;notice:(text:string)=>void}){
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
  return <section className="section-wrap location-settings"><div className="section-heading"><div><span className="eyebrow">YOUR CAMPUS. YOUR CHOICE.</span><h2>Campus & <i>privacy.</i></h2></div></div>
    <div className="location-settings-grid"><form className="location-settings-card" onSubmit={event=>void saveLocation(event)}><strong>◎ Your home area</strong><p>Search any recognised Nigerian school. We'll set its state automatically.</p><InstitutionPicker idPrefix="profile" schoolFirst state={state} institutionId={id} institutionName={school} onChange={(value,schoolId,name,reason)=>{setState(value);setId(schoolId);setSchool(name);if(reason!=='typing'){setFaculty('');setDepartment('');}}}/>{id&&<AcademicPicker prefix="profile" faculty={faculty} department={department} onChange={(nextFaculty,nextDepartment)=>{setFaculty(nextFaculty);setDepartment(nextDepartment);}}/>}<button className="button button-dark" type="submit" disabled={busy||!state||(Boolean(faculty)!==Boolean(department))}>{busy?'Saving…':'Save campus location'} ↗</button></form>
      <div className="location-settings-card"><strong>● Online visibility</strong><p>Show a green dot only while you're active on CampusGigs. Turn it off any time.</p><span className={profile.show_online?'status-online':'status-offline'}><i/>{profile.show_online?'Visible when active':'Hidden'}</span><button className="button button-ghost" disabled={busy} onClick={()=>void togglePresence()}>{profile.show_online?'Hide my status':'Show my online status'}</button><small>Disabled by default. Location coordinates are never shown on your public profile.</small></div></div>
  </section>;
}
