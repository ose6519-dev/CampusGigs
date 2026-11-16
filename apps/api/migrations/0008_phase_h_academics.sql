-- Optional member academic details. School names remain canonical via institutions.
-- Faculty and department are self-reported: there is no verified school-specific catalogue.
ALTER TABLE profiles ADD COLUMN faculty TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN department TEXT NOT NULL DEFAULT '';

