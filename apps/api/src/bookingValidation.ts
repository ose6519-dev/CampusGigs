import { InputError } from './validation.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const asObject = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('Invalid booking information');
  return input as Record<string, unknown>;
};
const expectFields = (input: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(input).some((key) => !keys.includes(key))) throw new InputError('Unknown booking field');
};

export function parseBookingRequest(input: unknown) {
  const value = asObject(input);
  expectFields(value, ['gigId','requestId','brief']);
  if (typeof value.gigId !== 'string' || !uuid.test(value.gigId)) throw new InputError('Invalid gig');
  if (typeof value.requestId !== 'string' || !uuid.test(value.requestId)) throw new InputError('Invalid request ID');
  if (typeof value.brief !== 'string') throw new InputError('Tell the provider what you need');
  const brief = value.brief.trim();
  if (brief.length < 20 || brief.length > 2000) throw new InputError('Write 20–2000 characters about your request');
  return { gigId: value.gigId, requestId: value.requestId, brief };
}

export function parseBookingDecision(input: unknown): 'accept' | 'decline' {
  const value = asObject(input);
  expectFields(value, ['decision']);
  if (value.decision !== 'accept' && value.decision !== 'decline') throw new InputError('Choose accept or decline');
  return value.decision;
}

export function parseBookingRole(url: URL): 'buyer' | 'provider' {
  const params = [...url.searchParams.keys()];
  if (params.some((key) => key !== 'role') || url.searchParams.getAll('role').length > 1) throw new InputError('Invalid booking filter');
  const role = url.searchParams.get('role') || 'buyer';
  if (role !== 'buyer' && role !== 'provider') throw new InputError('Invalid booking filter');
  return role;
}

export function bookingUuid(input: string) { return uuid.test(input); }

export function parseBookingProgress(input: unknown):{action:'start'|'submit'|'confirm';note:string} {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError('Invalid booking progress');
  const item=input as Record<string,unknown>;
  if(Object.keys(item).some(key=>!['action','note'].includes(key))||
     !['start','submit','confirm'].includes(String(item.action)))throw new InputError('Invalid booking action');
  const action=item.action as 'start'|'submit'|'confirm';
  if(action!=='submit'&&'note' in item)throw new InputError('A note is only used when submitting work');
  const note=action==='submit'&&typeof item.note==='string'?item.note.trim():'';
  if(action==='submit'&&(note.length<10||note.length>500))throw new InputError('Add a delivery note (10–500 characters)');
  return {action,note};
}

export function parseBookingReview(input: unknown):{rating:number;comment:string}{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError('Invalid review');
  const item=input as Record<string,unknown>;
  if(Object.keys(item).some(key=>!['rating','comment'].includes(key))||
     !Number.isInteger(item.rating)||Number(item.rating)<1||Number(item.rating)>5||
     (item.comment!==undefined&&typeof item.comment!=='string'))throw new InputError('Choose a rating from 1 to 5');
  const comment=typeof item.comment==='string'?item.comment.trim():'';
  if(comment.length>500)throw new InputError('Review must be 500 characters or fewer');
  return {rating:Number(item.rating),comment};
}
