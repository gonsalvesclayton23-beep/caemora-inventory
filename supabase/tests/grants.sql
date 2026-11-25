-- Supabase gives signed-in users access to new tables and functions as they are created (default privileges).
-- Mirror that for local tests: run BEFORE the migrations, so a migration's own REVOKE still wins, as on Supabase.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
