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

export function AcademicPicker({faculty,department,onChange,prefix}:{
  faculty:string;department:string;onChange:(faculty:string,department:string)=>void;prefix:string;
}){
  const choices = faculty && courses[faculty] ? courses[faculty] : departments;
  return <div className="academic-fields">
    <div className="academic-heading"><strong>Faculty & department</strong><small>Optional · Use your school's official names</small></div>
    <label>Faculty / School
      <input list={`${prefix}-faculties`} value={faculty} maxLength={80} autoComplete="off" placeholder="Search or enter faculty" onChange={event=>onChange(event.target.value,'')}/>
      <datalist id={`${prefix}-faculties`}>{faculties.map(value=><option key={value} value={value}/>)}</datalist>
    </label>
    <label>Department
      <input list={`${prefix}-departments`} value={department} maxLength={80} autoComplete="off" placeholder="Search or enter department" onChange={event=>onChange(faculty,event.target.value)}/>
      <datalist id={`${prefix}-departments`}>{choices.map(value=><option key={value} value={value}/>)}</datalist>
    </label>
    <small className="academic-note">Suggestions are nationwide; faculty names differ across institutions.</small>
  </div>;
}
