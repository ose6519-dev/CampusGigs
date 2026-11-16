import { useEffect, useState } from 'react';
import { publicRequest, type Institution } from './api';

export const nigeriaStates = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna',
  'Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun',
  'Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];

export function InstitutionPicker({ state, institutionId, institutionName, onChange, stateRequired = true, institutionRequired = false, schoolFirst = false, idPrefix = 'campus' }: {
  state: string; institutionId: string; institutionName?: string;
  onChange: (state: string, institutionId: string, institutionName: string, reason?: 'typing'|'selection'|'clear') => void;
  stateRequired?: boolean; institutionRequired?: boolean; schoolFirst?: boolean; idPrefix?: string;
}) {
  const [text, setText] = useState(institutionName || '');
  const [options, setOptions] = useState<Institution[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(()=>setText(institutionName||''),[institutionName]);
  useEffect(() => {
    if ((!state && !schoolFirst) || !open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void publicRequest<{ institutions: Institution[] }>(`/v1/public/institutions?${schoolFirst?'':`state=${encodeURIComponent(state)}&`}q=${encodeURIComponent(text)}&limit=15`,controller.signal)
        .then(result => setOptions(result.institutions))
        .catch(() => {if (!controller.signal.aborted) setOptions([]);})
        .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    },180);
    return () => {window.clearTimeout(timer);controller.abort();};
  },[state,text,open,schoolFirst]);
  return <div className="institution-fields">
    <label>State<select id={`${idPrefix}-state`} required={stateRequired} value={state} onChange={e => {setText('');setOptions([]);setOpen(false);onChange(e.target.value,'','');}}><option value="">{schoolFirst?'Auto from school / choose state':'Select state'}</option>{nigeriaStates.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
    <label className="institution-search-label">Institution {institutionRequired ? '' : <small>(optional)</small>}
      <input id={`${idPrefix}-school`} autoComplete="off" role="combobox" aria-expanded={open} aria-controls={`${idPrefix}-options`} aria-autocomplete="list" required={institutionRequired} disabled={!schoolFirst&&!state} maxLength={100}
        placeholder={schoolFirst?'Search any Nigerian school…':state ? 'Search school or acronym…' : 'Choose state first'} value={text}
        onFocus={()=>setOpen(true)} onBlur={()=>window.setTimeout(()=>setOpen(false),150)}
        onChange={e=>{setText(e.target.value);onChange(state,'','','typing');setOpen(true);}} />
      {open && (state||schoolFirst) && <div className="institution-options" id={`${idPrefix}-options`} role="listbox" aria-label="Institutions">
        {loading && <span className="institution-option-note">Searching recognised institutions…</span>}
        {!loading && options.length === 0 && <span className="institution-option-note">{schoolFirst?'No recognised school found. Check the spelling.':`No match in ${state}. Try a different name.`}</span>}
        {!loading && options.map(item=><button key={item.id} type="button" role="option" aria-selected={institutionId===item.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{setText(item.name);onChange(item.state_name,item.id,item.name,'selection');setOpen(false);}}><strong>{item.name}</strong><small>{item.institution_type.replaceAll('_',' ')} · {item.state_name}</small></button>)}
      </div>}
      {institutionId && text===institutionName && <small className="institution-selected">✓ Recognised institution · {state} <button type="button" className="institution-clear" onClick={()=>{setText('');setOpen(false);onChange(state,'','','clear');}}>Change school ↗</button></small>}
      {institutionRequired && !institutionId && text && <small className="institution-hint">Please choose a result from the list.</small>}
    </label>
  </div>;
}
