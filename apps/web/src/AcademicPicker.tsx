import { useEffect, useState } from 'react';
import { publicRequest } from './api';

// Search suggestions, not an official faculty/department roster for each institution.
// Nigerian schools have different naming conventions; members can enter their official wording.
const courses: Record<string, string[]> = {
  'Agriculture': ['Agricultural Economics','Agricultural Extension','Animal Science','Crop Science','Fisheries','Forestry','Food Science and Technology','Soil Science'],
  'Arts & Humanities': ['English and Literary Studies','History and International Studies','Linguistics','Philosophy','Religious Studies','Theatre Arts','Fine and Applied Arts'],
  'Basic Medical Sciences': ['Anatomy','Biochemistry','Human Physiology','Medical Laboratory Science','Nursing Science','Public Health'],
  'Clinical Sciences': ['Medicine and Surgery','Dentistry','Optometry','Physiotherapy','Radiography'],
  'Education': ['Adult Education','Business Education','Computer Science Education','Educational Management','English Education','Guidance and Counselling','Library and Information Science','Primary Education','Science Education','Social Studies Education'],
  'Engineering': ['Agricultural Engineering','Chemical Engineering','Civil Engineering','Computer Engineering','Electrical and Electronic Engineering','Marine Engineering','Mechanical Engineering','Mechatronics Engineering','Petroleum Engineering'],
  'Environmental Sciences': ['Architecture','Building','Estate Management','Quantity Surveying','Surveying and Geoinformatics','Urban and Regional Planning'],
  'Law': ['Law','Private and Property Law','Public and International Law'],
  'Management Sciences': ['Accounting','Banking and Finance','Business Administration','Entrepreneurship','Insurance','Marketing','Office Technology Management','Public Administration'],
  'Pharmacy': ['Pharmacy','Pharmaceutical Chemistry','Pharmacology'],
  'Sciences': ['Biochemistry','Biology','Botany','Chemistry','Computer Science','Geology','Mathematics','Microbiology','Physics','Statistics','Zoology'],
  'Social Sciences': ['Criminology','Economics','Geography','Mass Communication','Political Science','Psychology','Sociology'],
  'Veterinary Medicine': ['Veterinary Medicine','Veterinary Anatomy','Veterinary Public Health'],
  'School of Applied Sciences': ['Computer Science','Food Science Technology','Hospitality Management','Science Laboratory Technology','Statistics'],
  'School of Business Studies': ['Accountancy','Banking and Finance','Business Administration','Marketing','Office Technology and Management','Public Administration'],
  'School of Engineering Technology': ['Civil Engineering Technology','Computer Engineering Technology','Electrical/Electronic Engineering Technology','Mechanical Engineering Technology'],
  'School of Environmental Studies': ['Architectural Technology','Building Technology','Estate Management','Quantity Surveying','Urban and Regional Planning'],
  'School of Vocational Education': ['Agricultural Education','Business Education','Home Economics','Technical Education'],
};

const faculties = Object.keys(courses);
const departments = [...new Set(Object.values(courses).flat())].sort((a,b)=>a.localeCompare(b));

type AcademicCatalog = { institutionId:string; verified:boolean; sourceUrl:string|null; faculties:Record<string,string[]> };

export function AcademicPicker({faculty,department,institutionId,onChange,prefix}:{
  faculty:string;department:string;institutionId:string;onChange:(faculty:string,department:string)=>void;prefix:string;
}){
  const [catalog,setCatalog] = useState<AcademicCatalog|null>(null);
  useEffect(()=>{
    if(!institutionId){setCatalog(null);return;}
    const controller=new AbortController();
    setCatalog(null);
    void publicRequest<Omit<AcademicCatalog,'institutionId'> & { institutionId:string }>(`/v1/public/institutions/${institutionId}/academics`,controller.signal)
      .then(result=>setCatalog(result))
      .catch(()=>{if(!controller.signal.aborted)setCatalog({institutionId,verified:false,sourceUrl:null,faculties:{}});});
    return ()=>controller.abort();
  },[institutionId]);
  const ready=catalog?.institutionId===institutionId;
  const verified=ready&&catalog.verified;
  const officialFaculties=verified?Object.keys(catalog.faculties):[];
  const officialDepartments=verified?(catalog.faculties[faculty]||[]):[];
  const choices = faculty && courses[faculty] ? courses[faculty] : departments;
  return <div className="academic-fields">
    <div className="academic-heading"><strong>Faculty & department</strong><small>{verified?'✓ Institution-specific list':ready?'Suggested · Please confirm with your school':'Loading school choices…'}</small></div>
    <label>Faculty / School
      {verified?<select value={faculty} onChange={event=>onChange(event.target.value,'')}>
        <option value="">Select faculty</option>{faculty&&!officialFaculties.includes(faculty)&&<option value={faculty}>{faculty} (previous)</option>}
        {officialFaculties.map(value=><option key={value} value={value}>{value}</option>)}
      </select>:<><input disabled={!ready} list={`${prefix}-faculties`} value={faculty} maxLength={80} autoComplete="off" placeholder={ready?'Search or enter faculty':'Loading…'} onChange={event=>onChange(event.target.value,'')}/>
      <datalist id={`${prefix}-faculties`}>{faculties.map(value=><option key={value} value={value}/>)}</datalist></>}
    </label>
    <label>Department
      {verified?<select disabled={!faculty} value={department} onChange={event=>onChange(faculty,event.target.value)}>
        <option value="">Select department</option>{department&&!officialDepartments.includes(department)&&<option value={department}>{department} (previous)</option>}
        {officialDepartments.map(value=><option key={value} value={value}>{value}</option>)}
      </select>:<><input disabled={!ready} list={`${prefix}-departments`} value={department} maxLength={80} autoComplete="off" placeholder={ready?'Search or enter department':'Loading…'} onChange={event=>onChange(faculty,event.target.value)}/>
      <datalist id={`${prefix}-departments`}>{choices.map(value=><option key={value} value={value}/>)}</datalist></>}
    </label>
    <small className="academic-note">{verified?'Matched to your selected institution.':ready?'Nationwide suggestions — school-specific names are not yet verified.':''}</small>
  </div>;
}
