-- NDU's official campus address is Amassoma, Wilberforce Island, Bayelsa;
-- the NUC directory imported in Phase F described it as Yenagoa.
-- Keep the former name searchable to avoid breaking older bookmarks.
UPDATE institutions SET
  name='Niger Delta University, Amassoma',
  aliases='Niger Delta University Niger-Delta University NDU Niger-Delta University, Yenagoa Niger Delta University, Yenagoa Wilberforce Island Amassoma',
  source_url='https://www.ndu.edu.ng/undergraduate'
WHERE id='6879021fc76ef50a3d30' AND state_name='Bayelsa';

UPDATE profiles SET campus='Niger Delta University, Amassoma',
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE institution_id='6879021fc76ef50a3d30' AND campus='Niger-Delta University, Yenagoa';
