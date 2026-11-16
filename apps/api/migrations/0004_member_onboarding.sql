-- CampusGigs first-run profile setup. No change to CampSell's database.
ALTER TABLE profiles ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK(onboarding_completed IN (0,1));
ALTER TABLE profiles ADD COLUMN user_kind TEXT NOT NULL DEFAULT 'buyer' CHECK(user_kind IN ('buyer','provider','both'));
ALTER TABLE profiles ADD COLUMN age_range TEXT NOT NULL DEFAULT '' CHECK(age_range IN ('','under_18','18_24','25_34','35_44','45_plus'));
ALTER TABLE profiles ADD COLUMN student_status TEXT NOT NULL DEFAULT '' CHECK(student_status IN ('','student','non_student'));
ALTER TABLE profiles ADD COLUMN interests_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(interests_json));

-- Existing Phase A-D members retain their dashboards; only new members see setup.
UPDATE profiles SET onboarding_completed = 1 WHERE onboarding_completed = 0;
