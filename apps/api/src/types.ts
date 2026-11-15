export type Mode = 'buying' | 'providing';

export type ProfileRecord = {
  firebase_uid: string;
  email: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  campus: string;
  city: string;
  active_mode: Mode;
  account_status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
};

