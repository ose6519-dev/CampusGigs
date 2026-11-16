export type Mode = 'buying' | 'providing';

export type ProfileRecord = {
  firebase_uid: string;
  email: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  campus: string;
  city: string;
  state_name: string;
  institution_id: string | null;
  faculty: string;
  department: string;
  directory_preference: 'default' | 'public' | 'private';
  member_public_id: string | null;
  active_mode: Mode;
  onboarding_completed: 0 | 1;
  user_kind: 'buyer' | 'provider' | 'both';
  age_range: string;
  student_status: 'student' | 'non_student' | '';
  interests_json: string;
  account_status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
};

