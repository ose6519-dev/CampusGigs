import { InputError } from './validation.ts';
import { parseAcademics } from './academicValidation.ts';

// Source-backed school-specific rosters. Other schools deliberately use labelled
// nationwide suggestions until their own official faculty lists are reviewed.
type SchoolCatalog = { sourceUrl: string; faculties: Record<string, string[]> };
export const schoolCatalogs: Record<string, SchoolCatalog> = {
  '6879021fc76ef50a3d30': {
    sourceUrl: 'https://www.ndu.edu.ng/undergraduate',
    faculties: {
      'Arts': ['English & Literary Studies','History & Diplomacy','Philosophy','Religious Studies','Theatre Arts'],
      'Agriculture': ['Agricultural Economics','Crop & Soil Science','Fisheries and Aquatic Studies','Agricultural Extension & Rural Sociology'],
      'Environmental Sciences': ['Architecture','Fine & Applied Arts','Quantity Surveying','Environmental Management','Urban & Regional Planning','Building','Estate Management'],
      'Engineering': ['Agricultural / Environmental Engineering','Chemical / Petrochemical Engineering','Civil Engineering','Electrical / Electronic Engineering','Mechanical Engineering','Marine Engineering','Petroleum Engineering'],
      'Education': ['Arts Education','Science Education','Social Science Education','Educational Foundations','Vocational & Technical Education','Counseling & Educational Psychology','Library & Information Science','Educational Management'],
      'Law': ['Law'],
      'Management Sciences': ['Accounting','Banking & Finance','Insurance','Business Administration','Management','Marketing','Office & Information Management'],
      'Nursing Sciences': ['Community Health Nursing','Medical-Surgical Nursing','Maternal & Child Health Nursing','Mental Health / Psychiatric Nursing'],
      'Pharmacy': ['Clinical Pharmacy & Pharmacy Practice','Pharmacology & Toxicology','Pharmaceutical Chemistry','Pharmacognosy & Herbal Medicine','Pharmaceutics & Pharmaceutical Technology','Pharmaceutical Microbiology & Biotechnology'],
      'Sciences': ['Biological Sciences','Chemical Sciences','Computer Science','Geology','Mathematics','Microbiology','Physics'],
      'Social Sciences': ['Economics','Geography & Environmental Management','Mass Communication','Political Science','Sociology'],
      'Basic Medical Sciences': ['Biochemistry','Anatomy','Physiology','Pathology','Pharmacology','Medical Laboratory Science'],
      'Clinical Sciences': ['Community Medicine & Public Health','Family Medicine','Radiology','Dentistry','Surgery','Medicine','Obstetrics & Gynaecology','Paediatrics','Psychiatry & Mental Health'],
    },
  },
  '2fa2c2a9d90565f4ef37': {
    sourceUrl: 'https://unilag.edu.ng/when-the-future-calls-unilag-answers-with-new-faculties-and-a-new-vision/',
    faculties: {
      'Architecture': ['Architecture','Landscape Architecture and Urban Design','Interior Architecture and Design'],
      'Arts': ['English','European Languages and Integration Studies','History and Strategic Studies','Linguistics, African and Asian Studies','Philosophy','Religious Studies'],
      'Basic Clinical Sciences': ['Anatomic and Molecular Pathology','Haematology and Blood Transfusion','Medical Microbiology and Parasitology','Clinical Pathology','Clinical Pharmacology'],
      'Basic Medical Sciences': ['Anatomy','Physiology','Medical Biochemistry','Pharmacology, Therapeutics and Toxicology'],
      'Clinical Sciences': ['Anaesthesia','Community Health and Primary Care','Medicine','Obstetrics and Gynaecology','Ophthalmology','Paediatrics','Psychiatry','Radiation Biology, Radiotherapy and Radiodiagnosis','Surgery'],
      'Communication and Media Studies': ['Mass Communication','Public Relations and Advertising','Journalism, Broadcasting and Media Studies'],
      'Computing and Informatics': ['Computer Science','Intelligent Systems and Robotics','Cybersecurity and Software Engineering'],
      'Creative Arts': ['Music and Sound Production','Theatre Arts and Film Studies','Fine and Applied Arts'],
      'Dental Sciences': ['Child Dental Health','Oral and Maxillofacial Pathology/Biology','Oral and Maxillofacial Surgery','Preventive Dentistry','Restorative Dentistry'],
      'Education': ['Adult Education','Arts Education','Educational Foundations','Educational Management','Human Kinetics and Health Education','Science Education','Social Sciences Education','Technology and Vocational Education'],
      'Engineering': ['Biomedical Engineering','Chemical Engineering','Petroleum and Gas Engineering','Civil and Environmental Engineering','Electrical and Electronics Engineering','Mechanical Engineering','Metallurgical and Materials Engineering','Surveying and Geoinformatics','Systems Engineering'],
      'Environmental Sciences': ['Building','Estate Management','Quantity Surveying','Urban and Regional Planning'],
      'Health Professions': ['Medical Laboratory Science','Nursing Science','Physiotherapy','Radiography'],
      'Law': ['Commercial and Industrial Law','Jurisprudence and International Law','Private and Property Law','Public Law'],
      'Life Sciences': ['Biochemistry','Botany','Cell Biology and Genetics','Marine Science','Microbiology','Zoology','Fisheries and Aquaculture'],
      'Management Sciences': ['Accounting','Actuarial Science and Insurance','Business Administration','Employment Relations and Human Resource Management','Finance'],
      'Pharmacy': ['Clinical Pharmacy and Biopharmacy','Pharmaceutical Chemistry','Pharmaceutical Microbiology and Biotechnology','Pharmaceutics and Pharmaceutical Technology','Pharmacognosy'],
      'Physical and Earth Sciences': ['Chemistry','Geosciences','Mathematics','Physics','Statistics'],
      'Social Sciences': ['Economics','Geography','Library and Information Science','Political Science','Psychology','Social Work','Sociology'],
    },
  },
};

export function publicAcademicCatalog(institutionId: string) {
  const catalog = schoolCatalogs[institutionId];
  return catalog ? { verified: true, sourceUrl: catalog.sourceUrl, faculties: catalog.faculties } :
    { verified: false, sourceUrl: null, faculties: {} };
}

export function validateSchoolAcademics(institutionId: string, faculty: unknown, department: unknown, legacy?: {
  institutionId: string | null; faculty: string; department: string;
}) {
  const normalized = parseAcademics(faculty, department);
  const catalog = schoolCatalogs[institutionId];
  if (!catalog || !normalized.faculty) return normalized;
  // Previously saved self-reported values remain available until the member edits them.
  if (legacy?.institutionId === institutionId && legacy.faculty === normalized.faculty && legacy.department === normalized.department) return normalized;
  const facultyName = Object.keys(catalog.faculties).find(name => name.toLocaleLowerCase() === normalized.faculty.toLocaleLowerCase());
  const departmentName = facultyName && catalog.faculties[facultyName].find(name => name.toLocaleLowerCase() === normalized.department.toLocaleLowerCase());
  if (!facultyName || !departmentName) throw new InputError('Select a faculty and its department from this institution’s verified list');
  return { faculty: facultyName, department: departmentName };
}
