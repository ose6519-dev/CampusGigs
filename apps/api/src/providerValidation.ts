import { InputError } from './validation.ts';

export const skillCategories = [
  'Design & Creative', 'Tech & Digital', 'Media & Editing', 'Personal Services',
  'Tutoring & Skills', 'Typing & Proofreading', 'Events & Lifestyle', 'Business Support',
] as const;

function recordOf(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Invalid form details');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !allowed.includes(key))) throw new InputError('Unknown form field');
  return record;
}

function stringField(record: Record<string, unknown>, key: string, min: number, max: number): string {
  const value = record[key];
  if (typeof value !== 'string') throw new InputError(`${key} must be text`);
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length < min || clean.length > max || /[\x00-\x1f]/.test(clean)) {
    throw new InputError(`${key} must be ${min}–${max} characters`);
  }
  return clean;
}

export function parseProviderApplication(value: unknown) {
  const record = recordOf(value, ['categories', 'locationKind', 'locationName', 'bio', 'evidenceType', 'evidenceKey']);
  if (!Array.isArray(record.categories) || record.categories.length < 1 || record.categories.length > 4 ||
      new Set(record.categories).size !== record.categories.length ||
      record.categories.some(category => !skillCategories.includes(category))) {
    throw new InputError('Choose between one and four service categories');
  }
  if (record.locationKind !== 'campus' && record.locationKind !== 'city') throw new InputError('Select campus or city');
  if (record.evidenceType !== 'student_id' && record.evidenceType !== 'government_id') throw new InputError('Select a valid ID type');
  return {
    categories: record.categories as string[],
    locationKind: record.locationKind,
    locationName: stringField(record, 'locationName', 3, 100),
    bio: stringField(record, 'bio', 40, 800),
    evidenceType: record.evidenceType,
    evidenceKey: stringField(record, 'evidenceKey', 20, 300),
  };
}

export function parseGig(value: unknown) {
  const record = recordOf(value, ['title', 'description', 'category', 'priceKobo', 'deliveryDays', 'locationType', 'locationName', 'paymentOption']);
  if (!skillCategories.includes(record.category as typeof skillCategories[number])) throw new InputError('Invalid category');
  if (!Number.isSafeInteger(record.priceKobo) || (record.priceKobo as number) < 10000 || (record.priceKobo as number) > 1000000000) throw new InputError('Price must be between ₦100 and ₦10,000,000');
  if (!Number.isSafeInteger(record.deliveryDays) || (record.deliveryDays as number) < 1 || (record.deliveryDays as number) > 90) throw new InputError('Delivery time must be 1–90 days');
  if (!['online', 'in_person', 'both'].includes(record.locationType as string)) throw new InputError('Invalid location type');
  if (!['full', 'deposit', 'preview'].includes(record.paymentOption as string)) throw new InputError('Invalid payment option');
  const title = stringField(record, 'title', 8, 100);
  const description = stringField(record, 'description', 40, 3000);
  const locationName = stringField(record, 'locationName', 3, 100);
  // Academic integrity: students can book tutorials, formatting and proofreading, not ghostwritten submissions.
  const prohibited = /\b(write|complete|do)\b.{0,35}\b(assignment|exam|thesis|dissertation|coursework)\b|\b(assignment|exam|thesis|dissertation|coursework)\b.{0,35}\b(for you|on your behalf)\b/i;
  if (prohibited.test(`${title} ${description}`)) throw new InputError('Full academic assignment completion is not allowed. Offer tutoring or proofreading instead.');
  return { title, description, locationName, category: record.category as string, priceKobo: record.priceKobo as number, deliveryDays: record.deliveryDays as number, locationType: record.locationType as string, paymentOption: record.paymentOption as string };
}

export function parseReview(value: unknown) {
  const record = recordOf(value, ['decision', 'note']);
  if (!['approved', 'rejected', 'changes_requested'].includes(record.decision as string)) throw new InputError('Invalid review decision');
  const note = record.note === undefined ? '' : stringField(record, 'note', 0, 500);
  if (record.decision !== 'approved' && note.length < 6) throw new InputError('Include a short reason for the applicant');
  return { decision: record.decision as 'approved' | 'rejected' | 'changes_requested', note };
}

export function parseModeration(value: unknown) {
  const record = recordOf(value, ['decision', 'note']);
  if (record.decision !== 'removed' && record.decision !== 'restored') throw new InputError('Invalid moderation action');
  const note = record.note === undefined ? '' : stringField(record, 'note', 0, 500);
  if (record.decision === 'removed' && note.length < 6) throw new InputError('Explain why this gig is being removed');
  return { decision: record.decision, note };
}
