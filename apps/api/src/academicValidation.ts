import { InputError } from './validation.ts';

export function parseAcademics(facultyInput: unknown, departmentInput: unknown): { faculty: string; department: string } {
  if (typeof facultyInput !== 'string' || typeof departmentInput !== 'string') {
    throw new InputError('Choose a faculty and department, or leave both blank');
  }
  const faculty = facultyInput.trim().replace(/\s+/g, ' ');
  const department = departmentInput.trim().replace(/\s+/g, ' ');
  if ((faculty && !department) || (!faculty && department)) {
    throw new InputError('Enter both faculty and department');
  }
  for (const value of [faculty, department]) {
    if (value.length > 80 || /[\x00-\x1f<>]/.test(value) || (value && value.length < 2)) {
      throw new InputError('Faculty and department must be 2–80 characters without markup');
    }
  }
  return { faculty, department };
}
