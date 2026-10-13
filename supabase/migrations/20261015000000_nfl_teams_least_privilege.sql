-- Least privilege for the public team list: API roles only need SELECT.
-- Supabase's default grants also give anon/authenticated REFERENCES and TRIGGER on new tables;
-- neither is reachable through the API, but neither is needed, so remove them.
revoke references, trigger on public.nfl_teams from anon, authenticated;
