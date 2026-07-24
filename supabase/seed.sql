-- Seed module readiness after fixture benchmarks (all on for completeness gate build)
-- Re-run after regenerating validation/reports

insert into public.module_readiness (module_id, status, unlocked_at)
values
  ('technique:serve', 'on', now()),
  ('technique:forehand', 'on', now()),
  ('technique:backhand', 'on', now()),
  ('technique:smash', 'on', now()),
  ('technique:clear', 'on', now()),
  ('technique:drop', 'on', now()),
  ('technique:drive', 'on', now()),
  ('technique:net_shot', 'on', now()),
  ('technique:lift', 'on', now()),
  ('technique:block', 'on', now()),
  ('technique:defensive_return', 'on', now()),
  ('technique:jump_smash', 'on', now()),
  ('footwork:pure', 'on', now()),
  ('footwork:layer:serve', 'on', now()),
  ('footwork:layer:forehand', 'on', now()),
  ('footwork:layer:backhand', 'on', now()),
  ('footwork:layer:smash', 'on', now()),
  ('footwork:layer:clear', 'on', now()),
  ('footwork:layer:drop', 'on', now()),
  ('footwork:layer:drive', 'on', now()),
  ('footwork:layer:net_shot', 'on', now()),
  ('footwork:layer:lift', 'on', now()),
  ('footwork:layer:block', 'on', now()),
  ('footwork:layer:defensive_return', 'on', now()),
  ('footwork:layer:jump_smash', 'on', now())
on conflict (module_id) do update
set status = excluded.status,
    unlocked_at = excluded.unlocked_at,
    updated_at = now();
