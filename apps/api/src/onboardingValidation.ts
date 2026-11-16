import { InputError } from './validation.ts';
import { institutionIdPattern, nigeriaStates } from './institutions.ts';

export const interestOptions = [
  'Design & Creative', 'Tech & Digital', 'Media & Editing', 'Personal Services',
  'Tutoring & Skills', 'Typing & Proofreading', 'Events & Lifestyle', 'Business Support',
] as const;

const kinds = ['buyer','provider','both'] as const;
const ages = ['under_18','18_24','25_34','35_44','45_plus'] as const;
const statuses = ['student','non_student'] as const;

export function parseOnboarding(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Invalid setup information');
  const record = body as Record<string, unknown>;
  const fields = ['userKind','ageRange','studentStatus','interests','school','city','displayName','state','institutionId'];
  if (Object.keys(record).some(key=>!fields.includes(key))) throw new InputError('Unknown setup field');
  if (!kinds.includes(record.userKind as typeof kinds[number])) throw new InputError('Choose how you want to use CampusGigs');
  if (!ages.includes(record.ageRange as typeof ages[number])) throw new InputError('Select your age group');
  if (!statuses.includes(record.studentStatus as typeof statuses[number])) throw new InputError('Select your school status');
  if (!Array.isArray(record.interests) || record.interests.length<1 || record.interests.length>5 ||
      new Set(record.interests).size!==record.interests.length || record.interests.some(value=>!interestOptions.includes(value))) {
    throw new InputError('Choose between one and five interests');
  }
  function clean(name: string,max: number,min: number) {
    const input=record[name];
    if(typeof input!=='string') throw new InputError(`${name} is required`);
    const value=input.trim();
    if(value.length<min||value.length>max||/[\x00-\x1f]/.test(value)) throw new InputError(`${name} must be ${min}–${max} characters`);
    return value;
  }
  const studentStatus=record.studentStatus as typeof statuses[number];
  const school=clean('school',100,studentStatus==='student'?2:0);
  const state=clean('state',40,2);
  if(!nigeriaStates.includes(state as typeof nigeriaStates[number])) throw new InputError('Choose your Nigerian state');
  const institutionId=clean('institutionId',20,studentStatus==='student'?20:0);
  if(institutionId&&!institutionIdPattern.test(institutionId)) throw new InputError('Choose a recognised school from the list');
  return {
    userKind:record.userKind as typeof kinds[number], ageRange:record.ageRange as typeof ages[number],
    studentStatus, interests:record.interests as string[],school,state,institutionId,
    city:clean('city',100,2),displayName:clean('displayName',60,2),
  };
}
